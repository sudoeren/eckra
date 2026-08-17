const { doConflict } = require("../src/ui/modules/conflict");
const git = require("../src/helpers/git");
const screen = require("../src/ui/screen");
const common = require("../src/ui/common");

jest.mock("../src/helpers/git", () => ({
  getConflictDetails: jest.fn(),
  getConflictedDiff: jest.fn(),
  acceptOurs: jest.fn(),
  acceptTheirs: jest.fn(),
  acceptBoth: jest.fn(),
  abortMerge: jest.fn(),
  stageFiles: jest.fn(),
}));

jest.mock("../src/ui/screen", () => ({
  open: jest.fn(),
  menuItem: jest.fn((label, _tone, value) => ({ name: label, value })),
  backItem: jest.fn(() => ({ name: "Back", value: "back" })),
  sep: jest.fn(),
  prompt: jest.fn(),
}));

jest.mock("../src/ui/common", () => ({
  s: new Proxy(
    {},
    {
      get: () => (value) => value,
    }
  ),
  pause: jest.fn(),
  sleep: jest.fn(),
  clear: jest.fn(),
  header: jest.fn(),
}));

jest.mock("../src/ui/diff-view", () => ({
  renderDiff: jest.fn((diff) =>
    diff ? ["+<<<<<<< HEAD", "+conflict", "+>>>>>>>"] : []
  ),
}));

describe("Conflict Resolver", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("shows conflict diff before the action menu", async () => {
    git.getConflictDetails.mockResolvedValue(["a.txt"]);
    git.getConflictedDiff.mockResolvedValue("raw conflict diff");
    screen.prompt.mockResolvedValue({ action: "back" });

    await doConflict();

    const { renderDiff } = require("../src/ui/diff-view");
    expect(renderDiff).toHaveBeenCalledWith("raw conflict diff");
    expect(common.pause).toHaveBeenCalledTimes(1);

    const question = screen.prompt.mock.calls[0][0][0];
    expect(question.name).toBe("action");
  });

  test("skips diff pause when diff is empty", async () => {
    git.getConflictDetails.mockResolvedValue(["a.txt"]);
    git.getConflictedDiff.mockResolvedValue("");
    screen.prompt.mockResolvedValue({ action: "back" });

    await doConflict();

    const { renderDiff } = require("../src/ui/diff-view");
    expect(renderDiff).toHaveBeenCalledWith("");
    expect(common.pause).not.toHaveBeenCalled();

    const question = screen.prompt.mock.calls[0][0][0];
    expect(question.name).toBe("action");
  });

  test("does not prompt when there are no conflicts", async () => {
    git.getConflictDetails.mockResolvedValue([]);

    await doConflict();

    expect(screen.prompt).not.toHaveBeenCalled();
    expect(common.pause).toHaveBeenCalledTimes(1);
  });
});
