const { parseDiff, generatePatch } = require("../src/helpers/patch");

describe("Patch Helper", () => {
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

  test("should parse diff into hunks correctly", () => {
    const files = parseDiff(mockDiff);

    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("test.js");
    expect(files[0].hunks).toHaveLength(2);

    expect(files[0].hunks[0].header).toContain("@@ -1,3 +1,4 @@");
    expect(files[0].hunks[1].header).toContain("@@ -10,3 +11,3 @@");
  });

  test("should generate patch for selected hunks", () => {
    const files = parseDiff(mockDiff);
    const patch = generatePatch(files[0], [0]); // Only first hunk

    expect(patch).toContain("@@ -1,3 +1,4 @@");
    expect(patch).not.toContain("@@ -10,3 +11,3 @@");
    expect(patch).toContain("+added line");
    expect(patch).not.toContain("-removed line");
  });

  test("should handle empty diffs", () => {
    const files = parseDiff("");
    expect(files).toHaveLength(0);
  });

  test("should keep rename and mode metadata in the header", () => {
    const diff = `diff --git a/old.js b/new.js
similarity index 78%
rename from old.js
rename to new.js
index 1111111..2222222 100644
old mode 100644
new mode 100755
--- a/old.js
+++ b/new.js
@@ -1 +1 @@
-old line
+new line`;
    const files = parseDiff(diff);

    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("new.js");
    const header = files[0].header.join("\n");
    expect(header).toContain("similarity index 78%");
    expect(header).toContain("rename from old.js");
    expect(header).toContain("rename to new.js");
    expect(header).toContain("old mode 100644");
    expect(header).toContain("new mode 100755");
    expect(header).toContain("--- a/old.js");
    expect(header).toContain("+++ b/new.js");
  });
});
