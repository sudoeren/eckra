const git = require("../src/helpers/git");
const ai = require("../src/helpers/ai");
const screen = require("../src/ui/screen");
const { doTimeline } = require("../src/ui/modules/timeline");

jest.mock("../src/helpers/git");
jest.mock("../src/helpers/ai");
jest.mock("../src/ui/common", () => ({
  s: new Proxy(
    {},
    {
      get: () => (x) => (Array.isArray(x) ? x.join("") : String(x)),
    }
  ),
  cols: () => 80,
  pause: jest.fn().mockResolvedValue(),
}));
jest.mock("../src/ui/markdown", () => ({
  renderMarkdown: jest.fn((text) => text.split("\n")),
}));
jest.mock("../src/ui/screen", () => ({
  open: jest.fn(),
  rule: jest.fn(),
  menuItem: jest.fn((label, _tone, value) => ({
    name: label,
    value: value === undefined ? label : value,
  })),
  backItem: jest.fn(() => ({ name: "Back", value: "back" })),
  prompt: jest.fn(),
  spinner: jest.fn(() => ({ start: jest.fn(), stop: jest.fn(), text: "" })),
  fail: jest.fn(),
  showPages: jest.fn(),
}));

describe("Timeline UI module", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Back selection returns without fetching history", async () => {
    screen.prompt.mockResolvedValueOnce({ count: "back" });

    await doTimeline();

    expect(git.getCommitHistory).not.toHaveBeenCalled();
    expect(ai.generateTimeline).not.toHaveBeenCalled();
  });

  test("a numeric selection fetches and analyzes commits", async () => {
    git.getCommitHistory.mockResolvedValue({ all: [{ hash: "a" }] });
    ai.generateTimeline.mockResolvedValue("## Story");
    screen.prompt.mockResolvedValueOnce({ count: 25 });

    await doTimeline();

    expect(git.getCommitHistory).toHaveBeenCalledWith(25);
    expect(ai.generateTimeline).toHaveBeenCalled();
  });

  test("the story is shown paged, with the analyzed range as subtitle", async () => {
    git.getCommitHistory.mockResolvedValue({
      all: [
        { hash: "b", date: "2026-10-03T10:00:00Z" },
        { hash: "a", date: "2026-09-18T10:00:00Z" },
      ],
    });
    ai.generateTimeline.mockResolvedValue("## Timeline\n- one");
    screen.prompt.mockResolvedValueOnce({ count: 10 });

    await doTimeline();

    expect(screen.showPages).toHaveBeenCalledWith(
      "Project Story",
      "2 commits  ·  Sep 18, 2026 → Oct 3, 2026",
      ["## Timeline", "- one"]
    );
  });

  test("section headings get their own colors", async () => {
    const { renderMarkdown } = require("../src/ui/markdown");
    git.getCommitHistory.mockResolvedValue({ all: [{ hash: "a" }] });
    ai.generateTimeline.mockResolvedValue("## Contributors");
    screen.prompt.mockResolvedValueOnce({ count: 10 });

    await doTimeline();

    const { headingTone } = renderMarkdown.mock.calls[0][1];
    expect(headingTone("Contributors")).toBe("ai");
    expect(headingTone("Key Milestones")).toBe("success");
    expect(headingTone("Something else")).toBe("primary");
  });

  test("an AI failure is reported without showing an empty story", async () => {
    git.getCommitHistory.mockResolvedValue({ all: [{ hash: "a" }] });
    ai.generateTimeline.mockRejectedValue(new Error("boom"));
    screen.prompt.mockResolvedValueOnce({ count: 10 });

    await doTimeline();

    expect(screen.fail).toHaveBeenCalledWith(
      expect.anything(),
      "AI Error: boom"
    );
    expect(screen.showPages).not.toHaveBeenCalled();
  });
});
