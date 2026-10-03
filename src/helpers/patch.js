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

// Generated files whose diffs are long and say nothing about intent.
const NOISE_FILE_RE =
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|Gemfile\.lock|composer\.lock|poetry\.lock|Pipfile\.lock|uv\.lock|flake\.lock|go\.sum)$|\.(min\.js|min\.css|map|snap)$/i;

function splitDiffByFile(diffOutput) {
  const sections = [];
  for (const line of diffOutput.split("\n")) {
    if (line.startsWith("diff --git") || sections.length === 0) {
      const matches = line.match(/^diff --git a\/(.*) b\/(.*)$/);
      sections.push({ name: matches ? matches[2] : null, lines: [line] });
    } else {
      sections[sections.length - 1].lines.push(line);
    }
  }
  return sections;
}

const isChangeLine = (line) =>
  (line.startsWith("+") && !line.startsWith("+++")) ||
  (line.startsWith("-") && !line.startsWith("---"));

/**
 * Shrink a diff to roughly `maxChars` for an AI prompt without losing sight
 * of any file. A diff that already fits is returned unchanged. Otherwise:
 * - lock files, minified bundles, source maps, snapshots and binaries are
 *   reduced to a one-line note;
 * - the budget is shared between the remaining files, small files first, so
 *   one huge file can't push every other file out of the prompt;
 * - files that don't fit are cut at a line boundary with a note saying how
 *   much is missing.
 */
function compactDiff(diffOutput, maxChars) {
  const diff = diffOutput || "";
  if (diff.length <= maxChars) return diff;

  const sections = splitDiffByFile(diff);
  if (!sections.some((section) => section.name)) {
    return `${diff.substring(0, maxChars)}\n\n[Diff truncated: ${diff.length - maxChars} characters omitted. Review the changed files list for the full scope.]`;
  }

  const rendered = sections.map((section) => {
    const text = section.lines.join("\n");
    const changed = section.lines.filter(isChangeLine).length;
    if (section.name && NOISE_FILE_RE.test(section.name)) {
      return {
        fixed: `${section.lines[0]}\n[generated file: ${changed} changed lines omitted]`,
      };
    }
    if (section.lines.some((line) => line.startsWith("Binary files "))) {
      return { fixed: `${section.lines[0]}\n[binary file changed]` };
    }
    return { section, text };
  });

  // Share the budget smallest-first: whatever a small file leaves unused
  // goes to the bigger ones.
  const open = rendered.filter((r) => !r.fixed);
  let budget =
    maxChars -
    rendered.reduce((sum, r) => sum + (r.fixed ? r.fixed.length : 0), 0);
  const bySize = [...open].sort((a, b) => a.text.length - b.text.length);
  bySize.forEach((entry, i) => {
    const share = Math.max(0, Math.floor(budget / (bySize.length - i)));
    if (entry.text.length <= share) {
      entry.fixed = entry.text;
    } else {
      const kept = [];
      let used = 0;
      for (const line of entry.section.lines) {
        // The "diff --git" line always stays so the file is still named.
        if (kept.length > 0 && used + line.length + 1 > share) break;
        kept.push(line);
        used += line.length + 1;
      }
      const omitted = entry.section.lines.length - kept.length;
      entry.fixed = `${kept.join("\n")}\n[... ${omitted} more lines of this file omitted]`;
    }
    budget -= entry.fixed.length;
  });

  return rendered.map((r) => r.fixed).join("\n");
}

module.exports = {
  compactDiff,
  parseDiff,
  generatePatch,
  filterFilesList,
  filterDiff,
};
