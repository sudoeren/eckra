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
        hunks: []
      };
      continue;
    }

    if (!currentFile) continue;

    // Header lines (index, ---, +++)
    if (line.startsWith("index") || line.startsWith("---") || line.startsWith("+++") || line.startsWith("new file") || line.startsWith("deleted file")) {
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
        lines: []
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

module.exports = {
  parseDiff,
  generatePatch
};
