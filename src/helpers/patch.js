/**
 * Parse git diff output into hunks
 */
function parseDiff(diffOutput) {
  const files = [];
  let currentFile = null;
  let currentHunk = null;

  const lines = diffOutput.split("\n");

  for (const line of lines) {
    // Start of a new file diff
    if (line.startsWith("diff --git")) {
      if (currentHunk) {
        currentFile.hunks.push(currentHunk);
        currentHunk = null;
      }
      if (currentFile) {
        files.push(currentFile);
      }

      const matches = line.match(/diff --git a\/(.*) b\/(.*)/);
      const fileName = matches ? matches[2] : "unknown";

      currentFile = {
        name: fileName,
        header: [line],
        hunks: [],
      };
      continue;
    }

    if (!currentFile) continue;

    // Header / metadata lines (index, mode, rename/copy, ---, +++)
    if (
      line.startsWith("index") ||
      line.startsWith("old mode") ||
      line.startsWith("new mode") ||
      line.startsWith("similarity index") ||
      line.startsWith("dissimilarity index") ||
      line.startsWith("rename from") ||
      line.startsWith("rename to") ||
      line.startsWith("copy from") ||
      line.startsWith("copy to") ||
      line.startsWith("new file") ||
      line.startsWith("deleted file") ||
      line.startsWith("---") ||
      line.startsWith("+++")
    ) {
      currentFile.header.push(line);
      continue;
    }

    // Start of a hunk
    if (line.startsWith("@@")) {
      if (currentHunk) {
        currentFile.hunks.push(currentHunk);
      }
      currentHunk = {
        header: line,
        lines: [],
      };
      continue;
    }

    // Lines inside a hunk
    if (currentHunk) {
      currentHunk.lines.push(line);
    }
  }

  // Push last items
  if (currentHunk && currentFile) {
    currentFile.hunks.push(currentHunk);
  }
  if (currentFile) {
    files.push(currentFile);
  }

  return files;
}

/**
 * Generate patch content from selected hunks
 */
function generatePatch(file, selectedHunkIndices) {
  if (selectedHunkIndices.length === 0) return null;

  let patch = file.header.join("\n") + "\n";

  file.hunks.forEach((hunk, index) => {
    if (selectedHunkIndices.includes(index)) {
      patch += hunk.header + "\n";
      patch += hunk.lines.join("\n") + "\n";
    }
  });

  return patch;
}

/**
 * Turn a comma/glob-style pattern into a RegExp. `*` matches anything,
 * everything else is matched literally so paths with dots are safe.
 */
function patternToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp("^" + escaped.replace(/\*/g, ".*") + "$");
}

/**
 * Check whether a file name matches any of the exclusion patterns
 * (exact match or `*` glob).
 */
function matchesExclude(fileName, patterns) {
  return patterns.some((pattern) => patternToRegExp(pattern).test(fileName));
}

/**
 * Filter a parsed file list, dropping entries that match the exclusion patterns.
 */
function filterFilesList(files, excludedPatterns) {
  if (!excludedPatterns || excludedPatterns.length === 0) return files;
  return files.filter((name) => !matchesExclude(name, excludedPatterns));
}

/**
 * Remove the diff sections of excluded files from a raw git diff. The
 * remaining files are re-joined so the result is still a valid-looking diff.
 * Returns the original diff when nothing is excluded or nothing can be parsed.
 */
function filterDiff(diffOutput, excludedPatterns) {
  if (!excludedPatterns || excludedPatterns.length === 0) return diffOutput;

  const files = parseDiff(diffOutput);
  if (files.length === 0) return diffOutput;

  const kept = files.filter(
    (file) => !matchesExclude(file.name, excludedPatterns)
  );
  if (kept.length === files.length) return diffOutput;

  const allHunks = (file) => file.hunks.map((_, i) => i);
  return kept.map((file) => generatePatch(file, allHunks(file))).join("\n");
}

module.exports = {
  parseDiff,
  generatePatch,
  filterFilesList,
  filterDiff,
};
