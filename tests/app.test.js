const inquirer = require("inquirer");
const git = require("../src/helpers/git");
const clipboard = require("../src/helpers/clipboard");
const ai = require("../src/helpers/ai");
const { doPullRequest } = require("../src/ui/modules/pr");
const { quickCommit, easyWorkflow } = require("../src/ui/app");

jest.mock("../src/helpers/git");
jest.mock("../src/helpers/ai");
jest.mock("../src/helpers/clipboard");
jest.mock("../src/ui/modules/pr", () => ({ doPullRequest: jest.fn() }));
jest.mock("../src/ui/modules/sync", () => ({ doPush: jest.fn() }));
jest.mock("ora", () => ({
  default: () => ({
    start: jest.fn(),
    stop: jest.fn(),
    succeed: jest.fn(),
    fail: jest.fn(),
  }),
}));

// The UI modules are deliberately left unmocked: these flows broke once
// because app.js imported a helper from the wrong UI module.
describe("quickCommit with an explicit message", () => {
  let logSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(inquirer, "prompt").mockResolvedValue({});
    git.getGitStatus.mockResolvedValue({ staged: ["a.js"] });
    clipboard.copyToClipboard.mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("--no-commit shows the message without committing", async () => {
    await quickCommit("feat: x", { noCommit: true });

    expect(logSpy.mock.calls.flat().join("\n")).toContain("feat: x");
    expect(git.createCommit).not.toHaveBeenCalled();
  });

  test("--clipboard copies the message without committing", async () => {
    await quickCommit("feat: x", { clipboard: true });

    expect(clipboard.copyToClipboard).toHaveBeenCalledWith("feat: x");
    expect(git.createCommit).not.toHaveBeenCalled();
  });

  test("commits the given message", async () => {
    await quickCommit("feat: x", { noVerify: true });

    expect(git.stageAll).not.toHaveBeenCalled();
    expect(git.createCommit).toHaveBeenCalledWith("feat: x", {
      noVerify: true,
    });
  });
});

describe("easyWorkflow", () => {
  const { doPush } = require("../src/ui/modules/sync");
  const dirty = { modified: ["a.js"], not_added: [], deleted: [], staged: [] };
  const clean = { modified: [], not_added: [], deleted: [], staged: [] };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    git.getStagedDiff.mockResolvedValue("diff");
    git.createCommit.mockResolvedValue({ commit: "abc1234def" });
    ai.generateCommitMessage.mockResolvedValue("feat: x");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("commits and pushes after confirmation", async () => {
    git.getGitStatus.mockResolvedValue(dirty);
    jest
      .spyOn(inquirer, "prompt")
      .mockResolvedValueOnce({ confirmCommit: true })
      .mockResolvedValueOnce({ pushNow: true });

    await easyWorkflow();

    expect(git.createCommit).toHaveBeenCalledWith("feat: x");
    expect(doPush).toHaveBeenCalledWith(true);
    expect(doPullRequest).not.toHaveBeenCalled();
  });

  test("--pr hands over to the pull request flow instead of pushing", async () => {
    git.getGitStatus.mockResolvedValue(dirty);
    const promptSpy = jest
      .spyOn(inquirer, "prompt")
      .mockResolvedValueOnce({ confirmCommit: true });

    await easyWorkflow({ pr: true });

    expect(git.createCommit).toHaveBeenCalledWith("feat: x");
    expect(promptSpy).toHaveBeenCalledTimes(1);
    expect(doPush).not.toHaveBeenCalled();
    expect(doPullRequest).toHaveBeenCalledTimes(1);
  });

  test("--pr with a clean tree goes straight to the pull request", async () => {
    git.getGitStatus.mockResolvedValue(clean);

    await easyWorkflow({ pr: true });

    expect(git.createCommit).not.toHaveBeenCalled();
    expect(doPullRequest).toHaveBeenCalledTimes(1);
  });

  test("a clean tree without --pr does nothing", async () => {
    git.getGitStatus.mockResolvedValue(clean);

    await easyWorkflow();

    expect(git.createCommit).not.toHaveBeenCalled();
    expect(doPullRequest).not.toHaveBeenCalled();
  });
});
