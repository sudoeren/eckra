const fs = require("fs");
const path = require("path");
const os = require("os");

const BEGIN_MARKER = "# --- begin eckra (managed by eckra) ---";
const END_MARKER = "# --- end eckra ---";

/**
 * The customCommands YAML block injected into the lazygit config.
 * Ctrl+g launches the interactive aicommits-style commit flow.
 */
function getLazygitBlock() {
  return [
    `  ${BEGIN_MARKER}`,
    "  - key: '<c-g>'",
    "    context: 'files'",
    "    description: 'AI commit with eckra'",
    "    command: 'eckra commit'",
    "    subprocess: true",
    `  ${END_MARKER}`,
  ].join("\n");
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
  getLazygitConfigPath,
  ensureLazygitCommand,
  removeLazygitCommand,
  BEGIN_MARKER,
  END_MARKER,
};
