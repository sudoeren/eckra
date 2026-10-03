const git = require("../src/helpers/git");
const screen = require("../src/ui/screen");
const { doStash } = require("../src/ui/modules/stash");

jest.mock("../src/helpers/git");
jest.mock("../src/ui/common", () => ({
  s: new Proxy(
    {},
    {
      get: () => (value) => value,
    }
  ),
  pause: jest.fn(),
  sleep: jest.fn(),
}));
jest.mock("../src/ui/screen", () => ({
  open: jest.fn(),
  emptyState: jest.fn(),
  menuItem: (label, _tone, value) => ({ name: label, value }),
  backItem: (label = "Back", value = "back") => ({ name: label, value }),
  sep: () => ({ type: "separator" }),
  prompt: jest.fn(),
  confirmAction: jest.fn(),
}));

// Shape of simple-git's status: `files` lists every changed path,
// `not_added` the untracked ones.
const status = ({ tracked = [], untracked = [] }) => ({
  files: [...tracked, ...untracked].map((path) => ({ path })),
  not_added: untracked,
  modified: [],
});

describe("Stash", () => {
  let logSpy;

  beforeEach(() => {
    jest.resetAllMocks();
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    git.listStashes.mockResolvedValue({ all: [] });
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test("saves staged-only and deleted files", async () => {
    git.getGitStatus.mockResolvedValue(status({ tracked: ["staged.js"] }));
    screen.prompt
      .mockResolvedValueOnce({ action: "save" })
      .mockResolvedValueOnce({ message: "wip" });

    await doStash();

    expect(git.stashChanges).toHaveBeenCalledWith("wip", {
      includeUntracked: false,
    });
  });

  test("asks before including untracked files", async () => {
    git.getGitStatus.mockResolvedValue(
      status({ tracked: ["a.js"], untracked: ["new.js"] })
    );
    screen.prompt
      .mockResolvedValueOnce({ action: "save" })
      .mockResolvedValueOnce({ includeUntracked: true })
      .mockResolvedValueOnce({ message: "" });

    await doStash();

    expect(git.stashChanges).toHaveBeenCalledWith(null, {
      includeUntracked: true,
    });
  });

  test("does not claim success when only untracked files are declined", async () => {
    git.getGitStatus.mockResolvedValue(status({ untracked: ["new.js"] }));
    screen.prompt
      .mockResolvedValueOnce({ action: "save" })
      .mockResolvedValueOnce({ includeUntracked: false });

    await doStash();

    expect(git.stashChanges).not.toHaveBeenCalled();
    expect(screen.emptyState).toHaveBeenCalledWith("Nothing else to stash.");
  });

  test("reports a clean working tree", async () => {
    git.getGitStatus.mockResolvedValue(status({}));
    screen.prompt.mockResolvedValueOnce({ action: "save" });

    await doStash();

    expect(git.stashChanges).not.toHaveBeenCalled();
    expect(screen.emptyState).toHaveBeenCalledWith("No changes to stash.");
  });

  test("Back in the stash picker does nothing", async () => {
    git.listStashes.mockResolvedValue({ all: [{ message: "wip" }] });
    screen.prompt
      .mockResolvedValueOnce({ action: "pop" })
      .mockResolvedValueOnce({ index: null });

    await doStash();

    expect(git.popStash).not.toHaveBeenCalled();
  });
});
