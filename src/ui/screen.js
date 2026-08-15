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
 */
function menuItem(iconName, label, t = "text", value) {
  return {
    name: tone(t)(`  ${icons[iconName] || icons.dot} ${label}`),
    value: value === undefined ? label : value,
  };
}

/**
 * Standard back choice for menus.
 */
function backItem(label = "Back") {
  return { name: s.muted(`  ${icons.back} ${label}`), value: "back" };
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
  s,
  icons,
  clear,
  header,
};
