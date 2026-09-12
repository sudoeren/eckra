const chalk = require("chalk");
const inquirer = require("inquirer");
const { getThemeName, resetThemeCache } = require("../helpers/theme");

// ═══════════════════════════════════════════════════════════════
// THEMES
// ═══════════════════════════════════════════════════════════════

const themes = {
  dark: {
    brand: chalk.hex("#38BDF8").bold,
    primary: chalk.hex("#38BDF8"),
    success: chalk.hex("#34D399"),
    warning: chalk.hex("#FBBF24"),
    error: chalk.hex("#F87171"),
    muted: chalk.hex("#64748B"),
    text: chalk.hex("#E2E8F0"),
    dim: chalk.hex("#475569"),
    white: chalk.hex("#F8FAFC"),
    ai: chalk.hex("#A78BFA"),
    bold: chalk.bold,
  },
  light: {
    brand: chalk.hex("#0369A1").bold,
    primary: chalk.hex("#0284C7"),
    success: chalk.hex("#059669"),
    warning: chalk.hex("#B45309"),
    error: chalk.hex("#DC2626"),
    muted: chalk.hex("#64748B"),
    text: chalk.hex("#1E293B"),
    dim: chalk.hex("#94A3B8"),
    white: chalk.hex("#0F172A"),
    ai: chalk.hex("#7C3AED"),
    bold: chalk.bold,
  },
};

function getTheme() {
  return themes[getThemeName()] || themes.dark;
}

// Proxy so every access to s.primary etc. reads the current theme
const s = new Proxy(
  {},
  {
    get(_target, prop) {
      const theme = getTheme();
      return theme[prop];
    },
  }
);

// ═══════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════

const clear = () => console.clear();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cols = () => process.stdout.columns || 80;
const rows = () => process.stdout.rows || 24;

function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
  if (seconds < 60) return "now";
  if (seconds < 3600) return Math.floor(seconds / 60) + " min";
  if (seconds < 86400) return Math.floor(seconds / 3600) + " hr";
  if (seconds < 604800) return Math.floor(seconds / 86400) + " days";
  return Math.floor(seconds / 604800) + " weeks";
}

function header() {
  console.log();
  console.log(s.brand("  ╔═╗╔═╗╦╔═╦═╗╔═╗"));
  console.log(s.brand("  ║╣ ║  ╠╩╗╠╦╝╠═╣"));
  console.log(s.brand("  ╚═╝╚═╝╩ ╩╩╚═╩ ╩"));
  console.log();
}

async function pause() {
  await inquirer.prompt([
    {
      type: "input",
      name: "x",
      message: s.dim("Press Enter..."),
    },
  ]);
}

/**
 * Render a terminal hyperlink (OSC 8). Terminals without support show the
 * plain text, so the display text should stay readable on its own.
 */
function link(url, text = url) {
  return `\u001b]8;;${url}\u001b\\${text}\u001b]8;;\u001b\\`;
}

module.exports = {
  s,
  clear,
  sleep,
  cols,
  rows,
  truncate,
  timeAgo,
  header,
  pause,
  link,
  resetThemeCache,
};
