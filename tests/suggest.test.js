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
      { type: null }
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
      { type: null }
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
      { type: "gitmoji" }
    );
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
      { type: null }
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
