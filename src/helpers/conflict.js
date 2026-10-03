// Parsing and resolving the conflict markers git leaves in a file:
//
//   <<<<<<< HEAD
//   our lines
//   ||||||| base          (only with merge.conflictStyle=diff3/zdiff3)
//   common ancestor
//   =======
//   their lines
//   >>>>>>> feature

const OURS_RE = /^<{7}(?: (.*))?$/;
const BASE_RE = /^\|{7}(?: .*)?$/;
const SPLIT_RE = /^={7}$/;
const THEIRS_RE = /^>{7}(?: (.*))?$/;

const CONTEXT_LINES = 8;

/**
 * Split file content into alternating text and conflict segments:
 *   { type: "text", lines }
 *   { type: "conflict", ours, base, theirs, oursLabel, theirsLabel, line }
 * `base` is null unless the file uses diff3-style markers; `line` is the
 * 1-based line of the opening marker. Unterminated markers are treated as
 * ordinary text. Also returns the line ending the file uses.
 */
function parseConflicts(content) {
  const eol = /\r\n/.test(content) ? "\r\n" : "\n";
  const lines = String(content).split(/\r?\n/);
  const segments = [];
  let text = [];
  let i = 0;

  const flushText = () => {
    if (text.length) segments.push({ type: "text", lines: text });
    text = [];
  };

  while (i < lines.length) {
    const open = OURS_RE.exec(lines[i]);
    if (!open) {
      text.push(lines[i++]);
      continue;
    }

    const conflict = {
      type: "conflict",
      ours: [],
      base: null,
      theirs: [],
      oursLabel: open[1] || "ours",
      theirsLabel: "theirs",
      line: i + 1,
    };
    let part = "ours";
    let j = i + 1;
    let closed = false;

    for (; j < lines.length; j++) {
      const close = THEIRS_RE.exec(lines[j]);
      if (part === "ours" && BASE_RE.test(lines[j])) {
        part = "base";
        conflict.base = [];
      } else if (part !== "theirs" && SPLIT_RE.test(lines[j])) {
        part = "theirs";
      } else if (part === "theirs" && close) {
        conflict.theirsLabel = close[1] || "theirs";
        closed = true;
        break;
      } else {
        conflict[part].push(lines[j]);
      }
    }

    if (!closed) {
      text.push(lines[i++]);
      continue;
    }
    flushText();
    segments.push(conflict);
    i = j + 1;
  }
  flushText();

  return { segments, eol };
}

function getConflicts(parsed) {
  return parsed.segments.filter((segment) => segment.type === "conflict");
}

/**
 * Rebuild the file with each conflict replaced by its resolution (one
 * string per conflict, in order). Throws when the counts don't match or a
 * resolution still contains conflict markers, so a half-resolved file is
 * never written.
 */
function applyResolutions(parsed, resolutions) {
  const conflicts = getConflicts(parsed);
  if (resolutions.length !== conflicts.length) {
    throw new Error(
      `Expected ${conflicts.length} resolution(s), got ${resolutions.length}.`
    );
  }

  let index = 0;
  const out = [];
  for (const segment of parsed.segments) {
    if (segment.type === "text") {
      out.push(...segment.lines);
      continue;
    }
    const resolved = String(resolutions[index++]).split(/\r?\n/);
    if (
      resolved.some(
        (line) =>
          OURS_RE.test(line) || SPLIT_RE.test(line) || THEIRS_RE.test(line)
      )
    ) {
      throw new Error("A resolution still contains conflict markers.");
    }
    // An empty resolution removes the conflicting lines altogether.
    if (!(resolved.length === 1 && resolved[0] === "")) out.push(...resolved);
  }
  return out.join(parsed.eol);
}

/**
 * Describe the conflicts for an AI prompt: each one with a few lines of
 * the surrounding code so the model can see what the two sides fit into.
 */
function describeConflicts(parsed) {
  const { segments } = parsed;
  const blocks = [];
  let number = 0;

  segments.forEach((segment, i) => {
    if (segment.type !== "conflict") return;
    number += 1;

    const before =
      segments[i - 1]?.type === "text" ? segments[i - 1].lines : [];
    const after = segments[i + 1]?.type === "text" ? segments[i + 1].lines : [];
    const block = [
      `### Conflict ${number}`,
      "Code before:",
      ...before.slice(-CONTEXT_LINES),
      `<<<<<<< OURS (${segment.oursLabel})`,
      ...segment.ours,
    ];
    if (segment.base) block.push("||||||| COMMON ANCESTOR", ...segment.base);
    block.push(
      "=======",
      ...segment.theirs,
      `>>>>>>> THEIRS (${segment.theirsLabel})`,
      "Code after:",
      ...after.slice(0, CONTEXT_LINES)
    );
    blocks.push(block.join("\n"));
  });

  return blocks.join("\n\n");
}

module.exports = {
  parseConflicts,
  getConflicts,
  applyResolutions,
  describeConflicts,
};
