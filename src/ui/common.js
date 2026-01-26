const chalk = require("chalk");
const inquirer = require("inquirer");

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════

const s = {
  brand: chalk.hex("#00D9FF").bold,
  primary: chalk.hex("#00D9FF"),
  success: chalk.hex("#00FF88"),
  warning: chalk.hex("#FFB800"),
  error: chalk.hex("#FF4757"),
  muted: chalk.hex("#6B7280"),
  text: chalk.hex("#E5E7EB"),
  dim: chalk.hex("#4B5563"),
  white: chalk.white,
  bold: chalk.bold,
};

const icons = {
  staged: "●",
  modified: "◐",
  untracked: "○",
  branch: "",
  commit: "◆",
  push: "↑",
  pull: "↓",
  check: "✓",
  cross: "✗",
  arrow: "→",
  dot: "·",
  star: "★",
  folder: "📁",
  tag: "🏷",
};

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

function box(content, title = "") {
  const width = Math.min(cols() - 4, 70);
  const top = title
    ? s.dim("╭─") +
    s.muted(` ${title} `) +
    s.dim("─".repeat(width - title.length - 5) + "╮")
    : s.dim("╭" + "─".repeat(width - 2) + "╮");
  const bottom = s.dim("╰" + "─".repeat(width - 2) + "╯");
  const lines = content.split("\n").map((line) => {
    const padded = line.padEnd(width - 4);
    return s.dim("│") + " " + padded + " " + s.dim("│");
  });
  return [top, ...lines, bottom].join("\n");
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

module.exports = {
  s,
  icons,
  clear,
  sleep,
  cols,
  rows,
  truncate,
  timeAgo,
  box,
  header,
  pause
};
