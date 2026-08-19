const { generateSuggestedCommit } = require("../src/helpers/suggest");
const git = require("../src/helpers/git");
const ai = require("../src/helpers/ai");

jest.mock("../src/helpers/git");
jest.mock("../src/helpers/ai");

describe("Suggest Helper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("generates a message from staged changes", async () => {
    git.getGitStatus.mockResolvedValue({
      staged: ["a.js"],
      modified: [],
      not_added: [],
      deleted: [],
    });
    git.getStagedDiff.mockResolvedValue("diff");
    ai.generateCommitSuggestions.mockResolvedValue(["feat: something"]);

    const message = await generateSuggestedCommit();

    expect(message).toBe("feat: something");
    expect(ai.generateCommitSuggestions).toHaveBeenCalledWith(
      "diff",
      ["a.js"],
      1,
      null,
      { type: null, maxLength: null }
    );
    expect(git.stageAll).not.toHaveBeenCalled();
  });

  test("stages all changes when all is true", async () => {
    git.getGitStatus
      .mockResolvedValueOnce({
        staged: [],
        modified: ["b.js"],
        not_added: [],
        deleted: [],
      })
      .mockResolvedValueOnce({
        staged: ["b.js"],
        modified: [],
        not_added: [],
        deleted: [],
      });
    git.getStagedDiff.mockResolvedValue("diff");
    ai.generateCommitSuggestions.mockResolvedValue(["fix: x"]);

    await generateSuggestedCommit({ all: true });

    expect(git.stageAll).toHaveBeenCalledTimes(1);
    expect(ai.generateCommitSuggestions).toHaveBeenCalledWith(
      "diff",
      ["b.js"],
      1,
      null,
      { type: null, maxLength: null }
    );
  });

  test("passes the commit format through to the AI", async () => {
    git.getGitStatus.mockResolvedValue({
      staged: ["a.js"],
      modified: [],
      not_added: [],
      deleted: [],
    });
    git.getStagedDiff.mockResolvedValue("diff");
    ai.generateCommitSuggestions.mockResolvedValue(["✨ feat: x"]);

    await generateSuggestedCommit({ type: "gitmoji" });

    expect(ai.generateCommitSuggestions).toHaveBeenCalledWith(
      "diff",
      ["a.js"],
      1,
      null,
      { type: "gitmoji", maxLength: null }
    );
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
    ai.generateCommitSuggestions.mockResolvedValue(["feat: x"]);

    await generateSuggestedCommit({ exclude: "secret*" });

    const [sentDiff, files] = ai.generateCommitSuggestions.mock.calls[0];
    expect(files).toEqual(["a.js"]);
    expect(sentDiff).not.toContain("secret");
  });

  test("passes the instruction through to the AI", async () => {
    git.getGitStatus.mockResolvedValue({
      staged: ["a.js"],
      modified: [],
      not_added: [],
      deleted: [],
    });
    git.getStagedDiff.mockResolvedValue("diff");
    ai.generateCommitSuggestions.mockResolvedValue(["feat: y"]);

    await generateSuggestedCommit({ instruction: "focus on tests" });

    expect(ai.generateCommitSuggestions).toHaveBeenCalledWith(
      "diff",
      ["a.js"],
      1,
      "focus on tests",
      { type: null, maxLength: null }
    );
  });

  test("throws when there is nothing staged", async () => {
    git.getGitStatus.mockResolvedValue({
      staged: [],
      modified: [],
      not_added: [],
      deleted: [],
    });

    await expect(generateSuggestedCommit()).rejects.toThrow(
      "No staged changes"
    );
  });

  test("throws when not in a git repo", async () => {
    git.getGitStatus.mockRejectedValue(new Error("not a repo"));

    await expect(generateSuggestedCommit()).rejects.toThrow(
      "Not a git repository"
    );
  });
});
