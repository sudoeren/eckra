const { s, cols, link } = require("./common");
const { strWidth } = require("./screen");

// AI answers come back as Markdown. Printing them raw leaves "**", "##"
// and "---" on screen and lets long lines wrap wherever the terminal cuts
// them, so they are parsed into blocks and laid out for the terminal here.

const MAX_TEXT_WIDTH = 88;

const HEADING_RE =
  /^\s*(?:\*\*|__)?\s*(#{1,6})\s+(.*?)\s*#*\s*(?:\*\*|__)?\s*$/;
const RULE_RE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const BULLET_RE = /^(\s*)[-*+•]\s+(.*)$/;
const ORDERED_RE = /^(\s*)(\d+)[.)]\s+(.*)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;
const FENCE_RE = /^\s*```/;
const HARD_BREAK_RE = /( {2,}|\\)$/;

const INLINE_RE =
  /(\*\*|__)(.+?)\1|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|(?<![\w*])\*([^*\s][^*]*?)\*(?![\w*])/g;

/**
 * Split Markdown into blocks: { type, level?, marker?, lines[] }.
 * `lines` holds the block's logical lines: soft-wrapped source lines are
 * joined, hard breaks (two trailing spaces) start a new one.
 */
function parseBlocks(text) {
  const blocks = [];
  let inCode = false;
  let previousRaw = null;

  const last = () => blocks[blocks.length - 1];
  const canContinue = () =>
    last() && ["para", "item", "quote"].includes(last().type);

  for (const raw of String(text || "").split("\n")) {
    const line = raw.replace(/\t/g, "  ");
    const hardBreak = previousRaw !== null && HARD_BREAK_RE.test(previousRaw);
    previousRaw = line;
    const clean = line.replace(HARD_BREAK_RE, "").trimEnd();

    if (FENCE_RE.test(line)) {
      inCode = !inCode;
      previousRaw = null;
      continue;
    }
    if (inCode) {
      blocks.push({ type: "code", lines: [line] });
      continue;
    }

    let m;
    if (!clean.trim() || RULE_RE.test(clean)) {
      if (last() && last().type !== "blank") blocks.push({ type: "blank" });
      previousRaw = null;
    } else if ((m = HEADING_RE.exec(clean))) {
      blocks.push({
        type: "heading",
        level: m[1].length,
        lines: [m[2].replace(/\*\*|__/g, "").trim()],
      });
      previousRaw = null;
    } else if ((m = BULLET_RE.exec(clean))) {
      blocks.push({
        type: "item",
        level: Math.floor(m[1].length / 2),
        marker: "•",
        lines: [m[2]],
      });
    } else if ((m = ORDERED_RE.exec(clean))) {
      blocks.push({
        type: "item",
        level: Math.floor(m[1].length / 2),
        marker: `${m[2]}.`,
        lines: [m[3]],
      });
    } else if ((m = QUOTE_RE.exec(clean))) {
      if (last() && last().type === "quote") last().lines.push(m[1]);
      else blocks.push({ type: "quote", lines: [m[1]] });
    } else if (canContinue() && previousRaw !== null) {
      const block = last();
      if (hardBreak) block.lines.push(clean.trim());
      else block.lines[block.lines.length - 1] += " " + clean.trim();
    } else {
      blocks.push({ type: "para", lines: [clean.trim()] });
    }
  }

  while (last() && last().type === "blank") blocks.pop();
  return blocks;
}

/**
 * Split a line into styled words: [{ text, style, url? }].
 */
function parseInline(text) {
  const segments = [];
  let index = 0;
  let m;

  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text))) {
    if (m.index > index) {
      segments.push({ text: text.slice(index, m.index), style: "plain" });
    }
    if (m[2] !== undefined) segments.push({ text: m[2], style: "bold" });
    else if (m[3] !== undefined) segments.push({ text: m[3], style: "code" });
    else if (m[4] !== undefined) {
      segments.push({ text: m[4], style: "link", url: m[5] });
    } else segments.push({ text: m[6], style: "plain" });
    index = m.index + m[0].length;
  }
  if (index < text.length) {
    segments.push({ text: text.slice(index), style: "plain" });
  }

  // Words keep the style of their segment; a word glued across segments
  // ("**bold**," -> "bold" + ",") stays glued through `joined`.
  const words = [];
  for (const segment of segments) {
    const parts = segment.text.split(/(\s+)/);
    parts.forEach((part, i) => {
      if (!part) return;
      if (/^\s+$/.test(part)) {
        if (words.length) words[words.length - 1].spaceAfter = true;
        return;
      }
      words.push({
        text: part,
        style: segment.style,
        url: segment.url,
        joined:
          i === 0 && words.length > 0 && !words[words.length - 1].spaceAfter,
      });
    });
  }
  return words;
}

function styleWord(word, base) {
  if (word.style === "bold") return s.bold(base(word.text));
  if (word.style === "code") return s.primary(word.text);
  if (word.style === "link") return link(word.url, s.primary(word.text));
  return base(word.text);
}

/**
 * Lay styled words out in rows of at most `width` columns.
 */
function wrapWords(words, width, base) {
  const rows = [];
  let row = "";
  let rowWidth = 0;

  for (const word of words) {
    const w = strWidth(word.text);
    const gap = row && !word.joined ? 1 : 0;
    if (row && !word.joined && rowWidth + gap + w > width) {
      rows.push(row);
      row = "";
      rowWidth = 0;
    }
    const lead = row && !word.joined ? " " : "";
    row += lead + styleWord(word, base);
    rowWidth += lead.length + w;
  }
  if (row) rows.push(row);
  return rows;
}

/**
 * Render Markdown as terminal lines (returned, not printed).
 *
 * Options:
 * - indent: columns before body text (headings sit two columns left of it)
 * - width: wrap column; defaults to the terminal width, capped for
 *   readability
 * - headingTone(title): theme style name for a top-level heading
 */
function renderMarkdown(text, options = {}) {
  const { indent = 4, headingTone = () => "primary" } = options;
  const width =
    options.width ||
    Math.max(20, Math.min(cols() - indent - 2, MAX_TEXT_WIDTH));
  const pad = " ".repeat(indent);
  const out = [];
  const blank = () => {
    if (out.length && out[out.length - 1] !== "") out.push("");
  };

  for (const block of parseBlocks(text)) {
    if (block.type === "blank") {
      blank();
    } else if (block.type === "heading") {
      const title = block.lines[0];
      blank();
      if (block.level <= 2) {
        const tone = s[headingTone(title)] || s.primary;
        const headPad = " ".repeat(Math.max(0, indent - 2));
        out.push(headPad + s.bold(tone(title)));
        out.push(headPad + s.dim("-".repeat(Math.min(width + 2, 60))));
      } else {
        out.push(pad + s.bold(s.text(title)));
      }
    } else if (block.type === "code") {
      out.push(pad + "  " + s.muted(block.lines[0]));
    } else if (block.type === "item") {
      const nest = " ".repeat(block.level * 2);
      const marker = `${block.marker} `;
      const hang = " ".repeat(marker.length);
      const rows = block.lines.flatMap((line) =>
        wrapWords(
          parseInline(line),
          width - nest.length - marker.length,
          s.text
        )
      );
      rows.forEach((row, i) => {
        out.push(pad + nest + (i === 0 ? s.muted(marker) : hang) + row);
      });
    } else {
      const quote = block.type === "quote";
      const base = quote ? s.muted : s.text;
      for (const line of block.lines) {
        for (const row of wrapWords(
          parseInline(line),
          width - (quote ? 2 : 0),
          base
        )) {
          out.push(pad + (quote ? s.dim("│ ") : "") + row);
        }
      }
    }
  }

  return out;
}

module.exports = { renderMarkdown, parseBlocks, parseInline };
