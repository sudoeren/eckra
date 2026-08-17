const { doCommit } = require("../src/ui/modules/commit");
const git = require("../src/helpers/git");
const ai = require("../src/helpers/ai");
const screen = require("../src/ui/screen");

jest.mock("../src/helpers/git");
jest.mock("../src/helpers/ai");
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
  });

  test("generates one message, confirms, and commits", async () => {
    screen.prompt.mockResolvedValueOnce({ confirm: true });

    await doCommit(null, { generate: 1 });

    expect(ai.generateCommitSuggestions).toHaveBeenCalledWith(
      "diff",
      ["a.js"],
      1,
      null
    );
    expect(git.createCommit).toHaveBeenCalledWith("feat: x\n\n- body");
  });

  test("passes the instruction through to the AI", async () => {
    screen.prompt.mockResolvedValueOnce({ confirm: true });

    await doCommit(null, { instruction: "focus on tests" });

    expect(ai.generateCommitSuggestions).toHaveBeenCalledWith(
      "diff",
      ["a.js"],
      1,
      "focus on tests"
    );
  });

  test("skips confirmation with yes", async () => {
    await doCommit(null, { yes: true });

    expect(screen.prompt).not.toHaveBeenCalled();
    expect(git.createCommit).toHaveBeenCalledTimes(1);
  });

  test("asks for a manual message when the AI message is declined", async () => {
    screen.prompt
      .mockResolvedValueOnce({ confirm: false })
      .mockResolvedValueOnce({ manual: "fix: my own message" });

    await doCommit(null);

    expect(git.createCommit).toHaveBeenCalledWith("fix: my own message");
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
      null
    );
    expect(git.createCommit).toHaveBeenCalledWith("fix: two");
  });

  test("noCommit only shows the message and never commits", async () => {
    await doCommit(null, { noCommit: true });

    expect(git.createCommit).not.toHaveBeenCalled();
  });

  test("falls back to a manual message when the AI fails", async () => {
    ai.generateCommitSuggestions.mockRejectedValue(new Error("provider down"));
    screen.prompt
      .mockResolvedValueOnce({ manual: "chore: manual fallback" })
      .mockResolvedValueOnce({ confirm: true });

    await doCommit(null);

    expect(git.createCommit).toHaveBeenCalledWith("chore: manual fallback");
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
