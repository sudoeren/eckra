const { renderDiff } = require("../src/ui/diff-view");

jest.mock("../src/ui/common", () => ({
  s: new Proxy(
    {},
    {
      get: () => (value) => value,
    }
  ),
  cols: () => 120,
}));

describe("Diff view", () => {
  const mockDiff = `diff --git a/test.js b/test.js
index 1234567..89abcdef 100644
--- a/test.js
+++ b/test.js
@@ -1,3 +1,4 @@
 line 1
+added line
 line 2
 line 3
@@ -10,3 +11,3 @@
 old line
-removed line
+new line
 other line`;

  test("renders unified diff lines", () => {
    const lines = renderDiff(mockDiff);
    const text = lines.join("\n");

    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toContain("diff --git");
    expect(text).toContain("--- a/test.js");
    expect(text).toContain("+++ b/test.js");
    expect(text).toContain("+added line");
    expect(text).toContain("-removed line");
    expect(text).toContain("+new line");
    expect(text).toContain("@@ -1,3 +1,4 @@");
    expect(text).toContain("@@ -10,3 +11,3 @@");
  });

  test("renders side-by-side diff with a separator column", () => {
    const lines = renderDiff(mockDiff, { sideBySide: true });
    const text = lines.join("\n");

    expect(lines.length).toBeGreaterThan(0);
    expect(text).toContain("│");
    expect(text).toContain("removed line");
    expect(text).toContain("new line");
    expect(text).toContain("added line");
  });

  test("renders hunk line numbers in both modes", () => {
    const unified = renderDiff(mockDiff).join("\n");
    const sideBySide = renderDiff(mockDiff, { sideBySide: true }).join("\n");

    expect(unified).toContain("line 1");
    expect(sideBySide).toContain("line 1");
  });

  test("returns empty array for empty or whitespace diffs", () => {
    expect(renderDiff("")).toEqual([]);
    expect(renderDiff("   ")).toEqual([]);
    expect(renderDiff(null)).toEqual([]);
  });

  test("truncates long diffs", () => {
    const lines = renderDiff(mockDiff, { maxLines: 2 });

    expect(lines.length).toBe(3);
    expect(lines[lines.length - 1]).toContain("truncated");
  });
});
