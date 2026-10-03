const mockPrompt = jest.fn();
class MockSeparator {
  constructor(text) {
    this.type = "separator";
    this.separator = text;
  }
}

jest.mock("inquirer", () => ({
  default: { prompt: mockPrompt, Separator: MockSeparator },
}));

const { ask, adaptQuestion } = require("../src/ui/inquirer");

describe("inquirer adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("list becomes select, without the key help line", () => {
    const adapted = adaptQuestion({
      type: "list",
      name: "action",
      message: "What?",
      choices: ["a", "b"],
      pageSize: 10,
    });

    expect(adapted.type).toBe("select");
    expect(adapted.theme.style.keysHelpTip()).toBeUndefined();
    expect(adapted).toMatchObject({ name: "action", message: "What?" });
  });

  test("the highlight only wraps when the whole list is on screen", () => {
    const choices = (count) => Array.from({ length: count }, (_, i) => `c${i}`);
    const list = (extra) => adaptQuestion({ type: "list", ...extra });

    expect(list({ choices: choices(5), pageSize: 10 }).loop).toBe(true);
    expect(list({ choices: choices(30), pageSize: 10 }).loop).toBe(false);
    expect(list({ choices: choices(8) }).loop).toBe(false);
    expect(list({ choices: choices(5), pageSize: 10, loop: false }).loop).toBe(
      false
    );
  });

  test("separators are converted and other choices left alone", () => {
    const back = { name: "Back", value: null };
    const { choices } = adaptQuestion({
      type: "list",
      choices: ["main", { type: "separator", line: "----" }, back],
    });

    expect(choices[0]).toBe("main");
    expect(choices[1]).toBeInstanceOf(MockSeparator);
    expect(choices[1].separator).toBe("----");
    expect(choices[2]).toBe(back);
  });

  test("prefix moves into the theme", () => {
    expect(adaptQuestion({ type: "input", prefix: "?" })).toEqual({
      type: "input",
      theme: { prefix: "?" },
    });
    expect(adaptQuestion({ type: "confirm" })).toEqual({ type: "confirm" });
  });

  test("autocomplete becomes search with the old source signature", async () => {
    const source = jest.fn((_answers, input) => [
      `match:${input}`,
      { type: "separator", line: "--" },
    ]);
    const adapted = adaptQuestion({ type: "autocomplete", source });

    expect(adapted.type).toBe("search");
    expect(adapted.theme.style.keysHelpTip()).toBeUndefined();
    const results = await adapted.source("abc");
    expect(source).toHaveBeenCalledWith({}, "abc");
    expect(results[0]).toBe("match:abc");
    expect(results[1]).toBeInstanceOf(MockSeparator);

    // inquirer passes undefined for an empty search box.
    await adapted.source(undefined);
    expect(source).toHaveBeenLastCalledWith({}, "");
  });

  test("ask adapts every question and returns the answers", async () => {
    mockPrompt.mockResolvedValue({ a: 1 });

    expect(await ask({ type: "list", name: "a", choices: ["x"] })).toEqual({
      a: 1,
    });
    expect(mockPrompt.mock.calls[0][0][0].type).toBe("select");

    await ask([
      { type: "input", name: "b" },
      { type: "confirm", name: "c" },
    ]);
    expect(mockPrompt.mock.calls[1][0].map((q) => q.type)).toEqual([
      "input",
      "confirm",
    ]);
  });

  test("Ctrl+C in a prompt interrupts the process instead of rejecting", async () => {
    const kill = jest.spyOn(process, "kill").mockImplementation(() => true);
    const exit = new Error("User force closed the prompt with SIGINT");
    exit.name = "ExitPromptError";
    mockPrompt.mockRejectedValue(exit);

    let settled = false;
    ask({ type: "input", name: "x" }).then(
      () => (settled = true),
      () => (settled = true)
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(kill).toHaveBeenCalledWith(process.pid, "SIGINT");
    expect(settled).toBe(false);
    kill.mockRestore();
  });

  test("other prompt errors still surface", async () => {
    mockPrompt.mockRejectedValue(new Error("boom"));

    await expect(ask({ type: "input", name: "x" })).rejects.toThrow("boom");
  });
});
