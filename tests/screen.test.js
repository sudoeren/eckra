const {
  menuItem,
  backItem,
  sep,
  rule,
  tone,
  strWidth,
  confirmAction,
  withSyncUpdate,
} = require("../src/ui/screen");

jest.mock("inquirer", () => ({ prompt: jest.fn() }));
const inquirer = require("inquirer");

jest.mock("../src/ui/common", () => ({
  s: new Proxy(
    {},
    {
      get: () => (value) => value,
    }
  ),
  cols: () => 80,
  clear: jest.fn(),
  header: jest.fn(),
}));

describe("Screen helpers", () => {
  test("menuItem returns styled name and explicit value", () => {
    expect(menuItem("Commit", "success", "commit")).toEqual({
      name: "  Commit",
      value: "commit",
    });
  });

  test("menuItem defaults value to the label", () => {
    expect(menuItem("Edit")).toEqual({ name: "  Edit", value: "Edit" });
  });

  test("backItem returns a back choice", () => {
    expect(backItem()).toEqual({ name: "  Back", value: "back" });
    expect(backItem("Go Back")).toEqual({ name: "  Go Back", value: "back" });
  });

  test("sep returns an inquirer separator", () => {
    const s = sep();
    expect(s.type).toBe("separator");
    expect(s.line).toContain("-");
  });

  test("rule includes the label", () => {
    expect(rule("Merge")).toContain("Merge");
  });

  test("tone falls back to plain text for unknown tones", () => {
    expect(tone("unknown")("hello")).toBe("hello");
  });

  test("strWidth counts wide characters as 2 columns", () => {
    expect(strWidth("abc")).toBe(3);
    expect(strWidth("abc 日本語")).toBe(10);
  });

  test("strWidth skips control characters", () => {
    expect(strWidth("line\nbreak")).toBe(9);
    expect(strWidth("a\u0000b")).toBe(2);
  });

  test("confirmAction asks a confirm prompt defaulting to no", async () => {
    inquirer.prompt.mockResolvedValue({ confirmed: true });

    const result = await confirmAction("Are you sure?");

    expect(result).toBe(true);
    const question = inquirer.prompt.mock.calls[0][0][0];
    expect(question.type).toBe("confirm");
    expect(question.default).toBe(false);
    expect(question.message).toContain("Are you sure?");
  });

  test("confirmAction returns false when declined", async () => {
    inquirer.prompt.mockResolvedValue({ confirmed: false });

    const result = await confirmAction("Are you sure?");

    expect(result).toBe(false);
  });

  test("withSyncUpdate brackets a frame with DEC 2026 markers on a TTY", () => {
    const originalIsTTY = process.stdout.isTTY;
    const write = jest
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    Object.defineProperty(process.stdout, "isTTY", {
      value: true,
      configurable: true,
    });
    try {
      const result = withSyncUpdate(() => 42);

      expect(result).toBe(42);
      const written = write.mock.calls.map((call) => call[0]);
      expect(written[0]).toBe("\u001b[?2026h");
      expect(written[written.length - 1]).toBe("\u001b[?2026l");
    } finally {
      write.mockRestore();
      Object.defineProperty(process.stdout, "isTTY", {
        value: originalIsTTY,
        configurable: true,
      });
    }
  });
});
