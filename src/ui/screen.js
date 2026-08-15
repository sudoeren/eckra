const inquirer = require("inquirer");
const { s, icons, icon, cols, clear, header } = require("./common");

// ═══════════════════════════════════════════════════════════════
// SCREEN ANATOMY
// Every screen follows the same skeleton:
//   title -> rule -> content -> footer hint
// ═══════════════════════════════════════════════════════════════

const TONES = {
  primary: "primary",
  success: "success",
  warning: "warning",
  danger: "error",
  error: "error",
  muted: "muted",
  text: "text",
  ai: "ai",
  dim: "dim",
};

function tone(name) {
  return s[TONES[name]] || s.text;
}

const ruleWidth = () => Math.min(cols() - 4, 60);

/**
 * Approximate display width of a code point (0 = zero-width, 1 = narrow,
 * 2 = wide/fullwidth). Used to keep menu icons column-aligned.
 */
function charWidth(code) {
  if (code === 0 || code < 32 || (code >= 0x7f && code < 0xa0)) return 0;
  if (code >= 0x0300 && code <= 0x036f) return 0;
  if (code >= 0x20d0 && code <= 0x20ff) return 0;
  if (code >= 0xfe20 && code <= 0xfe2f) return 0;
  if (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1f64f) ||
    (code >= 0x1f900 && code <= 0x1f9ff) ||
    (code >= 0x1fa70 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x2fffd) ||
    (code >= 0x30000 && code <= 0x3fffd)
  ) {
    return 2;
  }
  return 1;
}

function strWidth(str) {
  let w = 0;
  for (const ch of String(str)) w += charWidth(ch.codePointAt(0));
  return w;
}

/**
 * Pad a glyph to `target` display columns so all menu icons line up.
 */
function padGlyph(glyph, target = 2) {
  const w = strWidth(glyph);
  return w >= target ? glyph : glyph + " ".repeat(target - w);
}

/**
 * Screen opener: clears, draws the brand header, the screen title,
 * an optional subtitle and a rule line.
 */
function open(title, subtitle) {
  clear();
  header();
  console.log(s.bold("  " + title));
  if (subtitle) console.log(s.muted("  " + subtitle));
  console.log(s.dim("  " + "─".repeat(ruleWidth())));
  console.log();
}

/**
 * Rule / divider line, optionally with a centered label.
 */
function rule(label) {
  const width = ruleWidth();
  if (!label) return s.dim("  " + "─".repeat(width));
  const inner = ` ${label} `;
  const side = "─".repeat(Math.max(1, Math.floor((width - inner.length) / 2)));
  return s.dim(side) + s.muted(inner) + s.dim(side);
}

/**
 * Consistent empty state message with an optional hint.
 */
function emptyState(text, hint) {
  console.log(s.muted("  " + text));
  if (hint) console.log(s.dim("    " + hint));
  console.log();
}

/**
 * Consistent single-line message.
 */
function line(text, t = "text") {
  console.log(tone(t)("  " + text));
}

/**
 * A styled inquirer menu choice: "  <icon> <label>".
 * `t` is one of the TONES above. `value` defaults to the plain label.
 * Icons are padded to a uniform width so labels stay column-aligned.
 */
function menuItem(iconName, label, t = "text", value) {
  const glyph = icons[iconName] || icons.dot;
  return {
    name: tone(t)(`  ${padGlyph(glyph)} ${label}`),
    value: value === undefined ? label : value,
  };
}

/**
 * Standard back choice for menus.
 */
function backItem(label = "Back") {
  return { name: s.muted(`  ${padGlyph(icons.back)} ${label}`), value: "back" };
}

/**
 * Consistent separator for inquirer menus.
 */
function sep() {
  return { type: "separator", line: s.dim("  " + "─".repeat(Math.min(cols() - 8, 52))) };
}

/**
 * A themed inquirer prompt wrapper (adds a brand-colored prefix).
 */
async function prompt(questions, ...rest) {
  const qs = Array.isArray(questions) ? questions : [questions];
  return inquirer.prompt(
    qs.map((q) => ({ ...q, prefix: q.prefix === null ? undefined : (q.prefix || s.primary("?")) })),
    ...rest,
  );
}

/**
 * A standardized ora spinner with consistent indent.
 * (ora is ESM-only, so it is required lazily to keep this module loadable
 *  in CJS test environments.)
 */
function spinner(text) {
  const ora = require("ora").default || require("ora");
  return ora({ text: s.muted("  " + text), spinner: "dots" });
}

function done(spin, text) {
  spin.succeed(s.success("  " + text));
}

function fail(spin, text) {
  spin.fail(s.error("  " + text));
}

module.exports = {
  open,
  rule,
  emptyState,
  line,
  menuItem,
  backItem,
  sep,
  prompt,
  spinner,
  done,
  fail,
  tone,
  icon,
  padGlyph,
  strWidth,
  s,
  icons,
  clear,
  header,
};
