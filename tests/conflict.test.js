const { doConflict } = require("../src/ui/modules/conflict");
const git = require("../src/helpers/git");
const screen = require("../src/ui/screen");
const common = require("../src/ui/common");
const ai = require("../src/helpers/ai");

jest.mock("../src/helpers/git", () => ({
  getConflictDetails: jest.fn(),
  getConflictedDiff: jest.fn(),
  acceptOurs: jest.fn(),
  acceptTheirs: jest.fn(),
  acceptBoth: jest.fn(),
  abortMerge: jest.fn(),
  stageFiles: jest.fn(),
  readConflictedFile: jest.fn(),
  writeResolvedFile: jest.fn(),
}));
jest.mock("../src/helpers/ai");
jest.mock("../src/ui/markdown", () => ({
  renderMarkdown: (text) => text.split("\n"),
}));

jest.mock("../src/ui/screen", () => ({
  open: jest.fn(),
  menuItem: jest.fn((label, _tone, value) => ({ name: label, value })),
  backItem: jest.fn((label = "Back", value = "back") => ({
    name: label,
    value,
  })),
  sep: jest.fn(),
  prompt: jest.fn(),
  spinner: () => ({ start: jest.fn(), stop: jest.fn() }),
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
  describe("AI suggestion", () => {
    const conflicted = [
      "const a = 1;",
      "<<<<<<< HEAD",
      "const b = 2;",
      "=======",
      "const b = 3;",
      ">>>>>>> feature",
      "const c = 4;",
      "",
    ].join("\n");
    let logSpy;

    beforeEach(() => {
      logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
      git.getConflictDetails.mockResolvedValue(["a.js"]);
      git.getConflictedDiff.mockResolvedValue("");
      git.readConflictedFile.mockResolvedValue(conflicted);
      ai.generateConflictResolution.mockResolvedValue({
        explanation: "Took theirs; it is newer.",
        resolutions: ["const b = 3;"],
      });
    });

    afterEach(() => {
      logSpy.mockRestore();
    });

    test("shows both sides and the suggestion, then applies on accept", async () => {
      screen.prompt
        .mockResolvedValueOnce({ action: "each" })
        .mockResolvedValueOnce({ choice: "ai" })
        .mockResolvedValueOnce({ apply: true });

      await doConflict();

      expect(ai.generateConflictResolution).toHaveBeenCalledWith({
        file: "a.js",
        description: expect.stringContaining("<<<<<<< OURS (HEAD)"),
        count: 1,
      });
      const out = logSpy.mock.calls.flat().join("\n");
      expect(out).toContain("Ours (HEAD):");
      expect(out).toContain("Theirs (feature):");
      expect(out).toContain("Took theirs; it is newer.");
      expect(git.writeResolvedFile).toHaveBeenCalledWith(
        "a.js",
        "const a = 1;\nconst b = 3;\nconst c = 4;\n"
      );
    });

    test("declining changes nothing and returns to the choices", async () => {
      screen.prompt
        .mockResolvedValueOnce({ action: "each" })
        .mockResolvedValueOnce({ choice: "ai" })
        .mockResolvedValueOnce({ apply: false })
        .mockResolvedValueOnce({ choice: "ours" });

      await doConflict();

      expect(git.writeResolvedFile).not.toHaveBeenCalled();
      expect(git.acceptOurs).toHaveBeenCalledWith("a.js");
    });

    test("an AI answer that leaves markers behind is rejected", async () => {
      ai.generateConflictResolution.mockResolvedValue({
        explanation: "",
        resolutions: ["<<<<<<< HEAD\nconst b = 2;"],
      });
      screen.prompt
        .mockResolvedValueOnce({ action: "each" })
        .mockResolvedValueOnce({ choice: "ai" })
        .mockResolvedValueOnce({ choice: "skip" });

      await doConflict();

      expect(screen.fail).toHaveBeenCalledWith(
        expect.anything(),
        "AI error: A resolution still contains conflict markers."
      );
      expect(git.writeResolvedFile).not.toHaveBeenCalled();
    });

    test("files without markers are not sent to the AI", async () => {
      git.readConflictedFile.mockResolvedValue(null);
      screen.prompt
        .mockResolvedValueOnce({ action: "each" })
        .mockResolvedValueOnce({ choice: "ai" })
        .mockResolvedValueOnce({ choice: "theirs" });

      await doConflict();

      expect(ai.generateConflictResolution).not.toHaveBeenCalled();
      expect(git.acceptTheirs).toHaveBeenCalledWith("a.js");
    });
  });
});
