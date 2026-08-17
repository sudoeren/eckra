const git = require("../src/helpers/git");
const screen = require("../src/ui/screen");
const { doBranch } = require("../src/ui/modules/branch");

jest.mock("../src/helpers/git");
jest.mock("../src/ui/common", () => ({
  s: new Proxy(
    {},
    {
      get: () => (x) => (Array.isArray(x) ? x.join("") : String(x)),
    }
  ),
  cols: () => 80,
  clear: jest.fn(),
  header: jest.fn(),
  sleep: jest.fn().mockResolvedValue(),
  pause: jest.fn().mockResolvedValue(),
}));
jest.mock("../src/ui/screen", () => ({
  open: jest.fn(),
  emptyState: jest.fn(),
  menuItem: jest.fn((label, _tone, value) => ({
    name: label,
    value: value === undefined ? label : value,
  })),
  backItem: jest.fn(() => ({ name: "Back", value: "back" })),
  sep: jest.fn(() => ({ type: "separator" })),
  rule: jest.fn(),
  prompt: jest.fn(),
}));

describe("Branch UI module", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    git.getBranches.mockResolvedValue({ current: "main", all: ["main"] });
  });

  test("menu items carry values matching the switch cases", () => {
    const newBranch = screen.menuItem("New Branch", "success", "new");
    const del = screen.menuItem("Delete Branch", "danger", "delete");
    expect(newBranch.value).toBe("new");
    expect(del.value).toBe("delete");
  });

  test("New Branch flow creates and switches to the branch", async () => {
    screen.prompt
      .mockResolvedValueOnce({ action: "new" })
      .mockResolvedValueOnce({ name: "feature" });

    await doBranch();

    expect(git.createBranch).toHaveBeenCalledWith("feature");
  });

  test("Switch Branch flow switches to the target", async () => {
    git.getBranches.mockResolvedValue({
      current: "main",
      all: ["main", "dev"],
    });
    screen.prompt
      .mockResolvedValueOnce({ action: "switch" })
      .mockResolvedValueOnce({ target: "dev" });

    await doBranch();

    expect(git.switchBranch).toHaveBeenCalledWith("dev");
  });

  test("Delete Branch flow asks for confirmation before deleting", async () => {
    git.getBranches.mockResolvedValue({
      current: "main",
      all: ["main", "old"],
    });
    screen.prompt
      .mockResolvedValueOnce({ action: "delete" })
      .mockResolvedValueOnce({ toDelete: "old" })
      .mockResolvedValueOnce({ confirm: true });

    await doBranch();

    expect(git.deleteBranch).toHaveBeenCalledWith("old");
  });

  test("Back returns without calling git helpers", async () => {
    screen.prompt.mockResolvedValueOnce({ action: "back" });

    await doBranch();

    expect(git.createBranch).not.toHaveBeenCalled();
    expect(git.switchBranch).not.toHaveBeenCalled();
    expect(git.deleteBranch).not.toHaveBeenCalled();
  });
});
