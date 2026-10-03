const git = require("../src/helpers/git");
const screen = require("../src/ui/screen");
const { doBlame } = require("../src/ui/modules/blame");

jest.mock("../src/helpers/git");
jest.mock("../src/ui/common", () => ({
  s: new Proxy(
    {},
    {
      get: () => (value) => value,
    }
  ),
  pause: jest.fn(),
  truncate: (value) => value,
  cols: () => 120,
  // pageSize() = rows - 14 = 10 lines per page
  rows: () => 24,
}));
jest.mock("../src/ui/screen", () => ({
  open: jest.fn(),
  emptyState: jest.fn(),
  menuItem: (label, _tone, value) => ({ name: label, value }),
  backItem: (label = "Back", value = "back") => ({ name: label, value }),
  prompt: jest.fn(),
  spinner: () => ({ start: jest.fn(), stop: jest.fn() }),
  fail: jest.fn(),
}));

describe("Blame", () => {
  const files = Array.from({ length: 80 }, (_, i) => `src/file${i}.js`);
  const blameOf = (count) =>
    Array.from({ length: count }, (_, i) => ({
      hash: "abcdef1234567",
      author: "eren",
      line: `line ${i + 1}`,
    }));
  let logSpy;

  const printed = () => logSpy.mock.calls.flat().join("\n");
  const values = (call) =>
    screen.prompt.mock.calls[call][0][0].choices.map((c) => c.value);

  beforeEach(() => {
    jest.resetAllMocks();
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    git.getTrackedFiles.mockResolvedValue(files);
    git.getBlame.mockResolvedValue(blameOf(25));
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test("every tracked file can be found by searching", async () => {
    screen.prompt.mockResolvedValueOnce({ file: null });

    await doBlame();

    const { type, source } = screen.prompt.mock.calls[0][0][0];
    expect(type).toBe("autocomplete");
    expect(source({}, "").length).toBe(files.length + 1);
    expect(source({}, "FILE79")).toEqual([
      "src/file79.js",
      { name: "Back", value: null },
    ]);
    expect(git.getBlame).not.toHaveBeenCalled();
  });

  test("pages through the whole file", async () => {
    screen.prompt
      .mockResolvedValueOnce({ file: "src/file1.js" })
      .mockResolvedValueOnce({ action: "next" })
      .mockResolvedValueOnce({ action: "next" })
      .mockResolvedValueOnce({ action: "prev" })
      .mockResolvedValueOnce({ action: "back" });

    await doBlame();

    expect(values(1)).toEqual(["next", "file", "back"]);
    expect(values(2)).toEqual(["next", "prev", "file", "back"]);
    expect(values(3)).toEqual(["prev", "file", "back"]);
    expect(printed()).toContain("line 25");
    expect(screen.open).toHaveBeenCalledWith(
      "Blame: src/file1.js",
      "25 lines · page 3 of 3"
    );
  });

  test("'Another File' returns to the file picker", async () => {
    screen.prompt
      .mockResolvedValueOnce({ file: "src/file1.js" })
      .mockResolvedValueOnce({ action: "file" })
      .mockResolvedValueOnce({ file: "src/file2.js" })
      .mockResolvedValueOnce({ action: "back" });

    await doBlame();

    expect(git.getBlame).toHaveBeenNthCalledWith(1, "src/file1.js");
    expect(git.getBlame).toHaveBeenNthCalledWith(2, "src/file2.js");
  });

  test("a blame error goes back to the picker instead of crashing", async () => {
    git.getBlame.mockRejectedValueOnce(new Error("no such path"));
    screen.prompt
      .mockResolvedValueOnce({ file: "gone.js" })
      .mockResolvedValueOnce({ file: null });

    await doBlame();

    expect(screen.fail).toHaveBeenCalledWith(expect.anything(), "no such path");
    expect(screen.prompt).toHaveBeenCalledTimes(2);
  });
});
