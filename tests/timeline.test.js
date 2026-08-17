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
  tone: jest.fn(() => (x) => String(x)),
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
});
