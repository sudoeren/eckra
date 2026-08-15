const chalk = require("chalk");
const { diffWordsWithSpace } = require("diff");
const { parseDiff } = require("../helpers/patch");
const { s, cols } = require("./common");

// ═══════════════════════════════════════════════════════════════
// DIFF VIEWER
// Renders a raw git diff with file headers, hunk headers, line
// numbers and intraline word highlighting (via jsdiff).
// ═══════════════════════════════════════════════════════════════

const ADD_HL = chalk.bgGreen.black;
const REM_HL = chalk.bgRed.black;

function parseHunkHeader(header) {
  const m = header.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if (!m) return { oldStart: 1, newStart: 1 };
  return { oldStart: parseInt(m[1], 10), newStart: parseInt(m[2], 10) };
}

/**
 * Split a hunk's raw lines into rows. Change lines are paired so
 * intraline highlighting can compare removed vs added text.
 */
function processHunk(hunk) {
  const { oldStart, newStart } = parseHunkHeader(hunk.header);
  const rows = [];
  let oldN = oldStart;
  let newN = newStart;
  let removedQueue = [];
  let addedQueue = [];

  const flush = () => {
    const n = Math.max(removedQueue.length, addedQueue.length);
    for (let i = 0; i < n; i++) {
      rows.push({
        type: "change",
        removed: removedQueue[i] !== undefined
          ? { num: oldN - removedQueue.length + i, text: removedQueue[i] }
          : null,
        added: addedQueue[i] !== undefined
          ? { num: newN - addedQueue.length + i, text: addedQueue[i] }
          : null,
      });
    }
    removedQueue = [];
    addedQueue = [];
  };

  for (const line of hunk.lines) {
    if (line.startsWith("+")) {
      addedQueue.push(line.slice(1));
      newN += 1;
    } else if (line.startsWith("-")) {
      removedQueue.push(line.slice(1));
      oldN += 1;
    } else if (line.startsWith(" ")) {
      flush();
      rows.push({ type: "context", oldNum: oldN, newNum: newN, text: line.slice(1) });
      oldN += 1;
      newN += 1;
    } else {
      flush();
      rows.push({ type: "meta", text: line });
    }
  }
  flush();
  return { rows, oldStart, newStart };
}

function highlightPair(removed, added) {
  const parts = diffWordsWithSpace(removed, added);
  return {
    removed: parts.filter((p) => p.removed),
    added: parts.filter((p) => p.added),
  };
}

/**
 * Render a line of text, wrapping the highlighted `words` with `hl`.
 */
function renderWords(text, words, base, hl) {
  if (!words || words.length === 0) return base(text);
  let last = 0;
  let out = "";
  for (const w of words) {
    const idx = text.indexOf(w.value, last);
    if (idx === -1) continue;
    out += base(text.slice(last, idx));
    out += hl(w.value);
    last = idx + w.value.length;
  }
  out += base(text.slice(last));
  return out;
}

function padNum(num, w) {
  return num == null ? " ".repeat(w) : String(num).padStart(w);
}

const ANSI_RE = /\x1b\[[0-9;]*m/g;
function vlen(str) {
  return str.replace(ANSI_RE, "").length;
}

function renderHunkBody(hunk, numW) {
  const { rows } = processHunk(hunk);
  const lines = [];

  for (const row of rows) {
    if (row.type === "meta") {
      lines.push(s.dim(row.text));
      continue;
    }
    if (row.type === "context") {
      lines.push(
        `${s.dim(padNum(row.oldNum, numW))} ${s.dim(padNum(row.newNum, numW))} ${s.text(row.text)}`,
      );
      continue;
    }
    // change row
    const hl =
      row.removed && row.added
        ? highlightPair(row.removed.text, row.added.text)
        : null;
    if (row.removed) {
      const words = hl ? hl.removed : null;
      lines.push(
        `${s.dim(padNum(row.removed.num, numW))} ${" ".repeat(numW)} ${s.error("-")}${renderWords(row.removed.text, words, s.error, REM_HL)}`,
      );
    }
    if (row.added) {
      const words = hl ? hl.added : null;
      lines.push(
        `${" ".repeat(numW)} ${s.dim(padNum(row.added.num, numW))} ${s.success("+")}${renderWords(row.added.text, words, s.success, ADD_HL)}`,
      );
    }
  }
  return lines;
}

function renderHunkSideBySide(hunk, numW) {
  const { rows } = processHunk(hunk);
  const half = Math.max(24, Math.floor((cols() - 6) / 2));
  const prefixW = numW * 2 + 2; // " OLD NEW "
  const sideW = Math.max(1, half - 1 - prefixW);
  const lines = [];

  const pColored = (oldNum, newNum) =>
    `${s.dim(padNum(oldNum, numW))} ${s.dim(padNum(newNum, numW))} `;

  for (const row of rows) {
    if (row.type === "meta") {
      lines.push(s.dim(row.text));
      continue;
    }
    if (row.type === "context") {
      const content =
        row.text.length > sideW ? row.text.slice(0, sideW) : row.text;
      const left = pColored(row.oldNum, row.newNum) + s.text(content);
      const pad = Math.max(0, half - 1 - vlen(left));
      lines.push(
        left + " ".repeat(pad) + s.dim("│ ") + pColored(row.oldNum, row.newNum) + s.text(content),
      );
      continue;
    }
    const hl =
      row.removed && row.added
        ? highlightPair(row.removed.text, row.added.text)
        : null;

    let left = "";
    let leftPad = half - 1;
    if (row.removed) {
      const content =
        row.removed.text.length > sideW ? row.removed.text.slice(0, sideW) : row.removed.text;
      left = pColored(row.removed.num, null) + renderWords(content, hl ? hl.removed : null, s.error, REM_HL);
      leftPad = Math.max(0, half - 1 - vlen(left));
    } else {
      left = pColored(null, null);
      leftPad = Math.max(0, half - 1 - vlen(left));
    }

    let right = "";
    if (row.added) {
      const content =
        row.added.text.length > sideW ? row.added.text.slice(0, sideW) : row.added.text;
      right = pColored(null, row.added.num) + renderWords(content, hl ? hl.added : null, s.success, ADD_HL);
    } else {
      right = pColored(null, null);
    }

    lines.push(left + " ".repeat(leftPad) + s.dim("│ ") + right);
  }
  return lines;
}

function renderFile(file, opts, numW) {
  const lines = [];

  for (const h of file.header) {
    if (h.startsWith("diff --git") || h.startsWith("index")) {
      lines.push(s.dim(h));
    } else if (h.startsWith("---")) {
      lines.push(s.error(h));
    } else if (h.startsWith("+++")) {
      lines.push(s.success(h));
    } else {
      lines.push(s.muted(h));
    }
  }

  for (const hunk of file.hunks) {
    lines.push(s.primary(hunk.header));
    const body =
      opts.sideBySide
        ? renderHunkSideBySide(hunk, numW)
        : renderHunkBody(hunk, numW);
    for (const l of body) lines.push(l);
  }

  return lines;
}

function computeNumWidth(files) {
  let maxNum = 0;
  for (const file of files) {
    for (const hunk of file.hunks) {
      const { rows } = processHunk(hunk);
      for (const row of rows) {
        if (row.type === "context") maxNum = Math.max(maxNum, row.oldNum, row.newNum);
        if (row.removed) maxNum = Math.max(maxNum, row.removed.num);
        if (row.added) maxNum = Math.max(maxNum, row.added.num);
      }
    }
  }
  return String(maxNum || 1).length;
}

/**
 * Render a raw git diff to an array of styled lines.
 */
function renderDiff(rawDiff, opts = {}) {
  const { sideBySide = false, maxLines = 1000 } = opts;
  if (!rawDiff || !rawDiff.trim()) return [];

  const files = parseDiff(rawDiff);
  const numW = computeNumWidth(files);
  const lines = [];

  files.forEach((file, i) => {
    if (i > 0) lines.push("");
    lines.push(...renderFile(file, { sideBySide }, numW));
  });

  if (lines.length > maxLines) {
    lines.splice(maxLines);
    lines.push(
      s.warning(`\n  ... diff truncated (${lines.length} of more lines shown)`),
    );
  }
  return lines;
}

module.exports = { renderDiff };
