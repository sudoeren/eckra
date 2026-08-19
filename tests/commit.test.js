const { doCommit } = require("../src/ui/modules/commit");
const git = require("../src/helpers/git");
const ai = require("../src/helpers/ai");
const clipboard = require("../src/helpers/clipboard");
const screen = require("../src/ui/screen");

jest.mock("../src/helpers/git");
jest.mock("../src/helpers/ai");
jest.mock("../src/helpers/clipboard");
jest.mock("../src/ui/screen", () => ({
  open: jest.fn(),
  prompt: jest.fn(),
  spinner: () => ({ start: jest.fn(), stop: jest.fn() }),
  done: jest.fn(),
  fail: jest.fn(),
}));
jest.mock("../src/ui/common", () => ({
  s: new Proxy(
    {},
    {
      get: () => (value) => value,
    }
  ),
  pause: jest.fn(),
}));

describe("Commit flow (aicommits-style)", () => {
  const stagedStatus = {
    staged: ["a.js"],
    modified: [],
    not_added: [],
    deleted: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    git.getGitStatus.mockResolvedValue(stagedStatus);
    git.getStagedDiff.mockResolvedValue("diff");
    ai.generateCommitSuggestions.mockResolvedValue(["feat: x\n\n- body"]);
    git.createCommit.mockResolvedValue({ commit: "abc1234def5678" });
    clipboard.copyToClipboard.mockResolvedValue(true);
  });

  test("generates one message, confirms, and commits", async () => {
    screen.prompt.mockResolvedValueOnce({ confirm: true });

    await doCommit(null, { generate: 1 });

    expect(ai.generateCommitSuggestions).toHaveBeenCalledWith(
      "diff",
      ["a.js"],
      1,
      null,
      { type: null, maxLength: null }
    );
    expect(git.createCommit).toHaveBeenCalledWith("feat: x\n\n- body", {
      noVerify: false,
    });
  });

  test("passes the commit format through to the AI", async () => {
    screen.prompt.mockResolvedValueOnce({ confirm: true });

    await doCommit(null, { type: "gitmoji" });

    expect(ai.generateCommitSuggestions).toHaveBeenCalledWith(
      "diff",
      ["a.js"],
      1,
      null,
      { type: "gitmoji", maxLength: null }
    );
    expect(git.createCommit).toHaveBeenCalledWith("feat: x\n\n- body", {
      noVerify: false,
    });
  });

  test("passes the instruction through to the AI", async () => {
    screen.prompt.mockResolvedValueOnce({ confirm: true });

    await doCommit(null, { instruction: "focus on tests" });

    expect(ai.generateCommitSuggestions).toHaveBeenCalledWith(
      "diff",
      ["a.js"],
      1,
      "focus on tests",
      { type: null, maxLength: null }
    );
  });

  test("skips confirmation with yes", async () => {
    await doCommit(null, { yes: true });

    expect(screen.prompt).not.toHaveBeenCalled();
    expect(git.createCommit).toHaveBeenCalledTimes(1);
  });

  test("passes noVerify through to createCommit", async () => {
    screen.prompt.mockResolvedValueOnce({ confirm: true });

    await doCommit(null, { noVerify: true });

    expect(git.createCommit).toHaveBeenCalledWith("feat: x\n\n- body", {
      noVerify: true,
    });
  });

  test("asks for a manual message when the AI message is declined", async () => {
    screen.prompt
      .mockResolvedValueOnce({ confirm: false })
      .mockResolvedValueOnce({ manual: "fix: my own message" });

    await doCommit(null);

    expect(git.createCommit).toHaveBeenCalledWith("fix: my own message", {
      noVerify: false,
    });
  });

  test("cancels when the manual message is empty", async () => {
    screen.prompt
      .mockResolvedValueOnce({ confirm: false })
      .mockResolvedValueOnce({ manual: "   " });

    await doCommit(null);

    expect(git.createCommit).not.toHaveBeenCalled();
  });

  test("generates multiple suggestions and lets the user pick", async () => {
    ai.generateCommitSuggestions.mockResolvedValue([
      "feat: one",
      "fix: two",
      "refactor: three",
    ]);
    screen.prompt
      .mockResolvedValueOnce({ selected: "fix: two" })
      .mockResolvedValueOnce({ confirm: true });

    await doCommit(null, { generate: 3 });

    expect(ai.generateCommitSuggestions).toHaveBeenCalledWith(
      "diff",
      ["a.js"],
      3,
      null,
      { type: null, maxLength: null }
    );
    expect(git.createCommit).toHaveBeenCalledWith("fix: two", {
      noVerify: false,
    });
  });

  test("noCommit only shows the message and never commits", async () => {
    await doCommit(null, { noCommit: true });

    expect(git.createCommit).not.toHaveBeenCalled();
  });

  test("clipboard copies the message instead of committing", async () => {
    await doCommit(null, { clipboard: true });

    expect(clipboard.copyToClipboard).toHaveBeenCalledWith("feat: x\n\n- body");
    expect(git.createCommit).not.toHaveBeenCalled();
  });

  test("clipboard failure reports a warning but never commits", async () => {
    clipboard.copyToClipboard.mockResolvedValue(false);

    await doCommit(null, { clipboard: true });

    expect(clipboard.copyToClipboard).toHaveBeenCalledTimes(1);
    expect(git.createCommit).not.toHaveBeenCalled();
  });

  test("excludes matching files from the AI analysis", async () => {
    const diff = [
      "diff --git a/a.js b/a.js",
      "index 111..222 100644",
      "--- a/a.js",
      "+++ b/a.js",
      "@@ -1 +1 @@",
      "-const x = 1;",
      "+const x = 2;",
      "diff --git a/secret.js b/secret.js",
      "index 333..444 100644",
      "--- a/secret.js",
      "+++ b/secret.js",
      "@@ -1 +1 @@",
      "-secret = 1;",
      "+secret = 2;",
    ].join("\n");
    git.getGitStatus.mockResolvedValue({
      staged: ["a.js", "secret.js"],
      modified: [],
      not_added: [],
      deleted: [],
    });
    git.getStagedDiff.mockResolvedValue(diff);
    screen.prompt.mockResolvedValueOnce({ confirm: true });

    await doCommit(null, { exclude: "secret.js" });

    const [sentDiff, files] = ai.generateCommitSuggestions.mock.calls[0];
    expect(files).toEqual(["a.js"]);
    expect(sentDiff).toContain("diff --git a/a.js");
    expect(sentDiff).not.toContain("secret");
  });

  test("falls back to a manual message when the AI fails", async () => {
    ai.generateCommitSuggestions.mockRejectedValue(new Error("provider down"));
    screen.prompt
      .mockResolvedValueOnce({ manual: "chore: manual fallback" })
      .mockResolvedValueOnce({ confirm: true });

    await doCommit(null);

    expect(git.createCommit).toHaveBeenCalledWith("chore: manual fallback", {
      noVerify: false,
    });
  });

  test("stages all changes with the all option", async () => {
    git.getGitStatus
      .mockResolvedValueOnce({
        staged: [],
        modified: ["b.js"],
        not_added: [],
        deleted: [],
      })
      .mockResolvedValueOnce(stagedStatus);
    screen.prompt.mockResolvedValueOnce({ confirm: true });

    await doCommit(null, { all: true });

    expect(git.stageAll).toHaveBeenCalledTimes(1);
    expect(git.createCommit).toHaveBeenCalledTimes(1);
  });

  test("does not commit when the user declines to stage", async () => {
    git.getGitStatus.mockResolvedValue({
      staged: [],
      modified: ["b.js"],
      not_added: [],
      deleted: [],
    });
    screen.prompt.mockResolvedValueOnce({ stageFirst: false });

    await doCommit(null);

    expect(git.stageAll).not.toHaveBeenCalled();
    expect(git.createCommit).not.toHaveBeenCalled();
  });
});
