const fs = require("fs");
const path = require("path");
const os = require("os");
const { getConfig } = require("./config");

const BEGIN_MARKER = "# --- begin eckra (managed by eckra) ---";
const END_MARKER = "# --- end eckra ---";

/**
 * Lazygit default keys bound in the "files" context (and universal keys that
 * apply in every panel) that would clash with an eckra custom-command key.
 * Used to warn (not block) on collisions. Based on lazygit's default config.
 */
const CONFLICTING_KEYS = new Set([
  // files context
  "a",
  "A",
  "c",
  "C",
  "D",
  "f",
  "i",
  "M",
  "r",
  "s",
  "S",
  "w",
  "x",
  "y",
  // universal
  "d",
  "e",
  "H",
  "h",
  "J",
  "j",
  "K",
  "k",
  "L",
  "l",
  "m",
  "n",
  "N",
  "o",
  "p",
  "P",
  "q",
  "Q",
  "R",
  "v",
  "W",
  "z",
  "Z",
  // non-letter keys a user might type
  "?",
  "/",
  "`",
  "[",
  "]",
  "-",
  "=",
  "+",
  "_",
  "|",
  "\\",
  "@",
  ":",
  ",",
  ".",
  "<",
  ">",
  "'",
  "space",
  "enter",
  "tab",
  "esc",
  // common ctrl combos
  "<c-a>",
  "<c-b>",
  "<c-c>",
  "<c-d>",
  "<c-e>",
  "<c-f>",
  "<c-g>",
  "<c-h>",
  "<c-i>",
  "<c-j>",
  "<c-k>",
  "<c-l>",
  "<c-m>",
  "<c-n>",
  "<c-o>",
  "<c-p>",
  "<c-q>",
  "<c-r>",
  "<c-s>",
  "<c-t>",
  "<c-u>",
  "<c-v>",
  "<c-w>",
  "<c-x>",
  "<c-y>",
  "<c-z>",
]);

/**
 * The customCommands YAML block injected into the lazygit config.
 * Defaults to the configured `lazygitKey` (uppercase C unless changed).
 */
function getLazygitBlock(key) {
  const k = normalizeLazygitKey(key || getLazygitKey());
  return [
    `  ${BEGIN_MARKER}`,
    `  - key: '${k}'`,
    "    context: 'files'",
    "    description: 'AI commit with eckra'",
    "    command: 'eckra commit'",
    "    subprocess: true",
    `  ${END_MARKER}`,
  ].join("\n");
}

/**
 * Resolve the configured lazygit custom-command key.
 */
function getLazygitKey() {
  try {
    return normalizeLazygitKey(getConfig().lazygitKey) || "C";
  } catch {
    return "C";
  }
}

/**
 * Normalize a user-supplied lazygit key to a single uppercase letter.
 * Returns null when the value is not usable.
 */
function normalizeLazygitKey(key) {
  if (typeof key !== "string") return null;
  const trimmed = key.trim();
  if (/^[a-zA-Z]$/.test(trimmed)) return trimmed.toUpperCase();
  return null;
}

/**
 * Return a conflict warning string for a key, or null when it is safe.
 */
function getLazygitKeyConflictWarning(key) {
  const k = normalizeLazygitKey(key);
  if (!k) return null;
  if (CONFLICTING_KEYS.has(k)) {
    return `Key "${k}" is bound by a default lazygit shortcut in the files view; it may not trigger eckra. Pick another letter if it does not work.`;
  }
  return null;
}

/**
 * Resolve the lazygit config file path for the current platform.
 * Honors LAZYGIT_CONFIG and XDG_CONFIG_HOME overrides.
 */
function getLazygitConfigPath() {
  if (process.env.LAZYGIT_CONFIG) return process.env.LAZYGIT_CONFIG;

  const home = os.homedir();
  switch (process.platform) {
    case "win32":
      return path.join(process.env.APPDATA || home, "lazygit", "config.yml");
    case "darwin":
      return path.join(
        home,
        "Library",
        "Application Support",
        "lazygit",
        "config.yml"
      );
    default: {
      const base = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
      return path.join(base, "lazygit", "config.yml");
    }
  }
}

/**
 * Ensure the eckra custom commands are present in the lazygit config.
 * Returns { path, changed } where changed is false when already installed.
 */
function ensureLazygitCommand() {
  const file = getLazygitConfigPath();
  const block = getLazygitBlock();

  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `customCommands:\n${block}\n`, "utf8");
    return { path: file, changed: true };
  }

  const content = fs.readFileSync(file, "utf8");
  if (content.includes(BEGIN_MARKER)) {
    return { path: file, changed: false };
  }

  const insertion = `\n${block}`;
  let updated;
  if (/^customCommands:[^\n]*$/m.test(content)) {
    updated = content.replace(
      /^customCommands:[^\n]*\n/m,
      (match) => match + insertion + "\n"
    );
  } else {
    updated = `${content.replace(/\s+$/, "")}\n\ncustomCommands:\n${block}\n`;
  }

  fs.writeFileSync(file, updated, "utf8");
  return { path: file, changed: true };
}

/**
 * Remove the eckra custom commands block from the lazygit config.
 * Returns { path, changed } where changed is false if nothing was removed.
 */
function removeLazygitCommand() {
  const file = getLazygitConfigPath();
  if (!fs.existsSync(file)) return { path: file, changed: false };

  const content = fs.readFileSync(file, "utf8");
  const start = content.indexOf(BEGIN_MARKER);
  if (start === -1) return { path: file, changed: false };

  const endLineStart = content.indexOf(END_MARKER, start);
  if (endLineStart === -1) return { path: file, changed: false };
  const end = content.indexOf("\n", endLineStart);
  const endPos = end === -1 ? content.length : end + 1;

  const updated =
    content.slice(0, start - 1).replace(/\s+$/, "") +
    "\n" +
    content.slice(endPos);
  // Drop the customCommands key if our block was its only content
  const cleaned =
    updated.replace(/\n?customCommands:\s*$/, "").replace(/\s+$/, "") + "\n";
  fs.writeFileSync(file, cleaned, "utf8");
  return { path: file, changed: true };
}

module.exports = {
  getLazygitBlock,
  getLazygitKey,
  getLazygitConfigPath,
  getLazygitKeyConflictWarning,
  normalizeLazygitKey,
  ensureLazygitCommand,
  removeLazygitCommand,
  CONFLICTING_KEYS,
  BEGIN_MARKER,
  END_MARKER,
};
