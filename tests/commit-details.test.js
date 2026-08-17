const git = require("../src/helpers/git");
const screen = require("../src/ui/screen");
const { showCommitSelector } = require("../src/ui/modules/commit-details");

jest.mock("../src/helpers/git");
jest.mock("../src/ui/common", () => ({
  s: new Proxy(
    {},
    {
      get: () => (x) => (Array.isArray(x) ? x.join("") : String(x)),
    }
  ),
  cols: () => 80,
  truncate: (str) => String(str),
  pause: jest.fn().mockResolvedValue(),
}));
jest.mock("../src/ui/screen", () => ({
  open: jest.fn(),
  rule: jest.fn(),
  menuItem: jest.fn((label, _tone, value) => ({
    name: label,
    value: value === undefined ? label : value,
  })),
  backItem: jest.fn((label = "Back") => ({ name: label, value: "back" })),
  sep: jest.fn(() => ({ type: "separator" })),
  prompt: jest.fn(),
  spinner: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() })),
  done: jest.fn(),
  fail: jest.fn(),
}));

describe("Commit details helper", () => {
  const commit = {
    hash: "abc1234",
    author_name: "Eren",
    author_email: "e@x.com",
    date: "2026-08-17T00:00:00Z",
    message: "feat: something",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("cherry-picks the selected commit", async () => {
    git.cherryPick.mockResolvedValue();
    screen.prompt
      .mockResolvedValueOnce({ selected: commit })
      .mockResolvedValueOnce({ action: "cherry" });

    await showCommitSelector({
      commits: [commit],
      backLabel: "Back",
    });

    expect(git.cherryPick).toHaveBeenCalledWith("abc1234");
  });

  test("calls onBack when Back is chosen in the action menu", async () => {
    const onBack = jest.fn().mockResolvedValue();
    screen.prompt
      .mockResolvedValueOnce({ selected: commit })
      .mockResolvedValueOnce({ action: "back" });

    await showCommitSelector({ commits: [commit], onBack });

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(git.cherryPick).not.toHaveBeenCalled();
  });

  test("returns without cherry-picking when Back is chosen in the list", async () => {
    screen.prompt.mockResolvedValueOnce({ selected: "back" });

    await showCommitSelector({ commits: [commit] });

    expect(git.cherryPick).not.toHaveBeenCalled();
  });
});
