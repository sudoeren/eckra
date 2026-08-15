const chalk = require("chalk");
const inquirer = require("inquirer");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { getConfig } = require("../helpers/config");

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

let _isDark = null;

const THEME_CACHE_PATH = path.join(os.homedir(), ".eckra", "theme-cache.json");
const THEME_CACHE_TTL = 60 * 60 * 1000; // 1 hour

function readThemeCache() {
  try {
    if (!fs.existsSync(THEME_CACHE_PATH)) return null;
    const parsed = JSON.parse(fs.readFileSync(THEME_CACHE_PATH, "utf8"));
    if (
      parsed &&
      typeof parsed.isDark === "boolean" &&
      Date.now() - parsed.ts < THEME_CACHE_TTL
    ) {
      return parsed.isDark;
    }
  } catch {}
  return null;
}

function writeThemeCache(isDark) {
  try {
    fs.mkdirSync(path.dirname(THEME_CACHE_PATH), { recursive: true });
    fs.writeFileSync(
      THEME_CACHE_PATH,
      JSON.stringify({ isDark, ts: Date.now() })
    );
  } catch {}
}

function detectDarkMode() {
  const { execSync } = require("child_process");
  const env = process.env;

  try {
    if (process.platform === "win32") {
      const command =
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" /v AppsUseLightTheme';
      const output = execSync(command, {
        stdio: ["pipe", "pipe", "ignore"],
      }).toString();
      return output.includes("0x0");
    }

    if (process.platform === "darwin") {
      const output = execSync("defaults read -g AppleInterfaceStyle", {
        stdio: ["pipe", "pipe", "ignore"],
      }).toString();
      return output.trim() === "Dark";
    }

    // ---- Linux detection ----

    // 1. GNOME via gsettings
    try {
      const out = execSync(
        "gsettings get org.gnome.desktop.interface color-scheme",
        {
          stdio: ["pipe", "pipe", "ignore"],
          timeout: 2000,
        }
      )
        .toString()
        .trim();
      if (out === "'prefer-dark'") {
        return true;
      }
      if (out === "'default'" || out === "'prefer-light'") {
        return false;
      }
    } catch {}

    // 2. KDE via kreadconfig5
    try {
      const out = execSync("kreadconfig5 --group General --key ColorScheme", {
        stdio: ["pipe", "pipe", "ignore"],
        timeout: 2000,
      })
        .toString()
        .trim()
        .toLowerCase();
      if (out.includes("dark")) {
        return true;
      }
      if (out.length > 0) {
        return false;
      }
    } catch {}

    // 3. KDE via kdeglobals
    try {
      const kdegl = path.join(os.homedir(), ".config", "kdeglobals");
      if (fs.existsSync(kdegl)) {
        const c = fs.readFileSync(kdegl, "utf8");
        if (
          c.includes("ColorScheme=KDE Breeze Dark") ||
          c.includes("ColorScheme=BreezeDark")
        ) {
          return true;
        }
        if (/ColorScheme=/.test(c)) {
          return false;
        }
      }
    } catch {}

    // 4. GTK settings.ini
    try {
      const gtkIni = path.join(
        os.homedir(),
        ".config",
        "gtk-3.0",
        "settings.ini"
      );
      if (fs.existsSync(gtkIni)) {
        const c = fs.readFileSync(gtkIni, "utf8");
        if (/gtk-application-prefer-dark-theme\s*=\s*1/.test(c)) {
          return true;
        }
      }
    } catch {}

    // 5. COLORFGBG env
    if (env.COLORFGBG) {
      const parts = env.COLORFGBG.split(";");
      const bg = parts[parts.length - 1];
      if (bg) {
        const val = parseInt(bg, 10);
        if (!isNaN(val)) {
          return val < 8;
        }
      }
    }

    // 6. GTK_THEME env
    if (env.GTK_THEME && env.GTK_THEME.endsWith("-dark")) {
      return true;
    }
  } catch {
    // fall through
  }

  // Fallback: check terminal emulator env hints
  const term = (env.COLORTERM || env.TERM || "").toLowerCase();
  if (term.includes("dark") || term.includes("black")) {
    return true;
  }

  return false; // Default to light (safer for most terminals)
}

function isDarkMode() {
  if (_isDark !== null) return _isDark;

  // Reuse detection across sessions so gsettings/kreadconfig5 aren't
  // spawned on every startup
  const cached = readThemeCache();
  if (cached !== null) {
    _isDark = cached;
    return _isDark;
  }

  _isDark = detectDarkMode();
  writeThemeCache(_isDark);
  return _isDark;
}

let _cachedTheme = null;
function resetThemeCache() {
  _cachedTheme = null;
  _isDark = null;
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
  resetThemeCache,
};
