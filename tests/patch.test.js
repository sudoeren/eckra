const { parseDiff, generatePatch } = require('../src/helpers/patch');

describe('Patch Helper', () => {
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

  test('should parse diff into hunks correctly', () => {
    const files = parseDiff(mockDiff);
    
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('test.js');
    expect(files[0].hunks).toHaveLength(2);
    
    expect(files[0].hunks[0].header).toContain('@@ -1,3 +1,4 @@');
    expect(files[0].hunks[1].header).toContain('@@ -10,3 +11,3 @@');
  });

  test('should generate patch for selected hunks', () => {
    const files = parseDiff(mockDiff);
    const patch = generatePatch(files[0], [0]); // Only first hunk
    
    expect(patch).toContain('@@ -1,3 +1,4 @@');
    expect(patch).not.toContain('@@ -10,3 +11,3 @@');
    expect(patch).toContain('+added line');
    expect(patch).not.toContain('-removed line');
  });

  test('should handle empty diffs', () => {
    const files = parseDiff('');
    expect(files).toHaveLength(0);
  });
});
