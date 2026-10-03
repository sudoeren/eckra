const { renderMarkdown, parseBlocks } = require("../src/ui/markdown");

jest.mock("../src/ui/common", () => ({
  // Styles become visible tags so the tests can see what was applied.
  s: new Proxy(
    {},
    {
      get: (_target, name) => (value) =>
        ["bold", "primary", "success", "ai"].includes(name)
          ? `<${name}>${value}</${name}>`
          : value,
    }
  ),
  cols: () => 60,
  link: (url, text) => `${text}{${url}}`,
}));
jest.mock("../src/ui/screen", () => ({
  strWidth: (value) => String(value).length,
}));

const plain = (text, options) =>
  renderMarkdown(text, options).map((line) => line.replace(/<\/?\w+>/g, ""));

describe("renderMarkdown", () => {
  test("headings lose their markers, even when wrapped in bold", () => {
    expect(plain("**## Timeline**\n\ntext")).toEqual([
      "  Timeline",
      "  " + "-".repeat(56),
      "",
      "    text",
    ]);
    expect(plain("### Sub heading ###")).toEqual(["    Sub heading"]);
  });

  test("top-level headings take their tone from headingTone", () => {
    const [title] = renderMarkdown("## Contributors", {
      headingTone: () => "ai",
    });

    expect(title).toBe("  <bold><ai>Contributors</ai></bold>");
  });

  test("inline bold, code and links are styled and their markers removed", () => {
    const [line] = renderMarkdown(
      "Use **bold**, `code` and [docs](https://x.y)."
    );

    expect(line).toBe(
      "    Use <bold>bold</bold>, <primary>code</primary> and <primary>docs</primary>{https://x.y}."
    );
  });

  test("snake_case and stray asterisks are left alone", () => {
    expect(plain("keep my_var_name and 2 * 3 * 4")).toEqual([
      "    keep my_var_name and 2 * 3 * 4",
    ]);
  });

  test("bullets wrap with a hanging indent", () => {
    const lines = plain(
      "- one two three four five six seven eight nine ten eleven twelve thirteen fourteen"
    );

    expect(lines[0].startsWith("    • one two")).toBe(true);
    expect(lines[1].startsWith("      ")).toBe(true);
    expect(lines[1].startsWith("       ")).toBe(false);
    lines.forEach((line) => expect(line.length).toBeLessThanOrEqual(60));
  });

  test("hard breaks and continuation lines stay inside their bullet", () => {
    expect(plain("- **Phase one**  \n  It began.\n  And went on.")).toEqual([
      "    • Phase one",
      "      It began. And went on.",
    ]);
  });

  test("nested and ordered lists keep their structure", () => {
    expect(plain("1. first\n2. second\n  * nested\n    - deeper")).toEqual([
      "    1. first",
      "    2. second",
      "      • nested",
      "        • deeper",
    ]);
  });

  test("horizontal rules and repeated blank lines collapse to one blank", () => {
    expect(plain("a\n\n---\n\n\nb\n")).toEqual(["    a", "", "    b"]);
  });

  test("code blocks are kept verbatim and never wrapped", () => {
    const long = "x".repeat(100);

    expect(plain("```js\nconst **a** = 1;\n" + long + "\n```")).toEqual([
      "      const **a** = 1;",
      "      " + long,
    ]);
  });

  test("quotes are marked", () => {
    expect(plain("> quoted\n> more")).toEqual(["    │ quoted", "    │ more"]);
  });

  test("soft-wrapped paragraph lines are joined and re-wrapped", () => {
    expect(plain("one\ntwo\n\nthree", { width: 40 })).toEqual([
      "    one two",
      "",
      "    three",
    ]);
  });

  test("empty input renders nothing", () => {
    expect(renderMarkdown("")).toEqual([]);
    expect(renderMarkdown(null)).toEqual([]);
    expect(parseBlocks("\n\n---\n")).toEqual([]);
  });
});
