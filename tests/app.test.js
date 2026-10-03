const inquirer = require("inquirer");
const git = require("../src/helpers/git");
const clipboard = require("../src/helpers/clipboard");
const { quickCommit } = require("../src/ui/app");

jest.mock("../src/helpers/git");
jest.mock("../src/helpers/ai");
jest.mock("../src/helpers/clipboard");

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
