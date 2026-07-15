const chalk = require("chalk");
const inquirer = require("inquirer");
const { getConfig } = require("../helpers/config");

// ═══════════════════════════════════════════════════════════════
// THEMES
// ═══════════════════════════════════════════════════════════════

const themes = {
  dark: {
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
  },
  light: {
    brand: chalk.hex("#0077B6").bold,
    primary: chalk.hex("#0077B6"),
    success: chalk.hex("#059669"),
    warning: chalk.hex("#D97706"),
    error: chalk.hex("#DC2626"),
    muted: chalk.hex("#6B7280"),
    text: chalk.hex("#1F2937"),
    dim: chalk.hex("#787878"),
    white: chalk.hex("#111827"),
    bold: chalk.bold,
  },
};

let _isDark = null;

function isDarkMode() {
  if (_isDark !== null) return _isDark;

  const { execSync } = require("child_process");
  const env = process.env;

  try {
    if (process.platform === "win32") {
      const command = 'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" /v AppsUseLightTheme';
      const output = execSync(command, { stdio: ["pipe", "pipe", "ignore"] }).toString();
      _isDark = output.includes("0x0");
      return _isDark;
    }

    if (process.platform === "darwin") {
      const output = execSync("defaults read -g AppleInterfaceStyle", { stdio: ["pipe", "pipe", "ignore"] }).toString();
      _isDark = output.trim() === "Dark";
      return _isDark;
    }

    // ---- Linux detection ----

    // 1. GNOME via gsettings
    try {
      const out = execSync("gsettings get org.gnome.desktop.interface color-scheme", {
        stdio: ["pipe", "pipe", "ignore"],
        timeout: 2000,
      }).toString().trim();
      if (out === "'prefer-dark'") { _isDark = true; return true; }
      if (out === "'default'" || out === "'prefer-light'") { _isDark = false; return false; }
    } catch {}

    // 2. KDE via kreadconfig5
    try {
      const out = execSync("kreadconfig5 --group General --key ColorScheme", {
        stdio: ["pipe", "pipe", "ignore"],
        timeout: 2000,
      }).toString().trim().toLowerCase();
      if (out.includes("dark")) { _isDark = true; return true; }
      if (out.length > 0) { _isDark = false; return false; }
    } catch {}

    // 3. KDE via kdeglobals
    try {
      const fs = require("fs");
      const p = require("path");
      const kdegl = p.join(require("os").homedir(), ".config", "kdeglobals");
      if (fs.existsSync(kdegl)) {
        const c = fs.readFileSync(kdegl, "utf8");
        if (c.includes("ColorScheme=KDE Breeze Dark") || c.includes("ColorScheme=BreezeDark")) { _isDark = true; return true; }
        if (/ColorScheme=/.test(c)) { _isDark = false; return false; }
      }
    } catch {}

    // 4. GTK settings.ini
    try {
      const fs = require("fs");
      const p = require("path");
      const gtkIni = p.join(require("os").homedir(), ".config", "gtk-3.0", "settings.ini");
      if (fs.existsSync(gtkIni)) {
        const c = fs.readFileSync(gtkIni, "utf8");
        if (/gtk-application-prefer-dark-theme\s*=\s*1/.test(c)) { _isDark = true; return true; }
      }
    } catch {}

    // 5. COLORFGBG env
    if (env.COLORFGBG) {
      const parts = env.COLORFGBG.split(";");
      const bg = parts[parts.length - 1];
      if (bg) {
        const val = parseInt(bg, 10);
        if (!isNaN(val)) { _isDark = val < 8; return _isDark; }
      }
    }

    // 6. GTK_THEME env
    if (env.GTK_THEME && env.GTK_THEME.endsWith("-dark")) { _isDark = true; return true; }
  } catch {
    // fall through
  }

  // Fallback: check terminal emulator env hints
  const term = (env.COLORTERM || env.TERM || "").toLowerCase();
  if (term.includes("dark") || term.includes("black")) { _isDark = true; return true; }

  _isDark = false; // Default to light (safer for most terminals)
  return _isDark;
}

let _cachedTheme = null;
function resetThemeCache() {
  _cachedTheme = null;
}
function getTheme() {
  if (_cachedTheme) return _cachedTheme;

  try {
    const config = getConfig();
    let selectedTheme = config.theme || "auto";

    if (selectedTheme === "auto") {
      selectedTheme = isDarkMode() ? "dark" : "light";
    }

    _cachedTheme = themes[selectedTheme] || themes.dark;
    return _cachedTheme;
  } catch {
    return themes.dark;
  }
}

// Proxy so every access to s.primary etc. reads the current theme
const s = new Proxy({}, {
  get(_target, prop) {
    const theme = getTheme();
    return theme[prop];
  },
});

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
  pause,
  resetThemeCache,
};
