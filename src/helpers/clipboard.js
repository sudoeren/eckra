const { spawn } = require("child_process");

// Terminals cap the OSC 52 payload; larger selections are usually truncated
// or dropped entirely, so we refuse rather than copy corrupt data.
const OSC52_MAX_BYTES = 74 * 1024;

/**
 * Pick the system clipboard command for the current platform.
 * - macOS: pbcopy
 * - Windows: clip
 * - Linux: wl-copy (Wayland) or xclip (X11)
 */
function getClipboardCommand() {
  if (process.platform === "darwin") {
    return { cmd: "pbcopy", args: [] };
  }
  if (process.platform === "win32") {
    return { cmd: "clip", args: [], shell: true };
  }
  if (process.env.WAYLAND_DISPLAY) {
    return { cmd: "wl-copy", args: [] };
  }
  return { cmd: "xclip", args: ["-selection", "clipboard"] };
}

function resolveOscPreference(env = process.env) {
  const value = String(env.ECKRA_CLIPBOARD || "").toLowerCase();
  if (value === "osc52" || value === "system") return value;
  return "auto";
}

/**
 * Copy text through the terminal using OSC 52, which works over SSH and in
 * terminals without wl-copy/xclip (Alacritty, kitty, WezTerm, Ghostty...).
 * Returns false when the payload is too large to be reliable.
 */
function osc52(text, options = {}) {
  const buffer = Buffer.from(String(text), "utf8");
  if (buffer.length > OSC52_MAX_BYTES) return false;
  const write =
    options.write ||
    ((data) => {
      process.stdout.write(data);
    });
  write(`\u001b]52;c;${buffer.toString("base64")}\u001b\\`);
  return true;
}

/**
 * Whether OSC 52 should be attempted. `ECKRA_CLIPBOARD=osc52` forces it,
 * `system` disables it, otherwise it is used whenever stdout is a TTY.
 */
function canUseOsc52(options = {}) {
  const env = options.env || process.env;
  const preference = resolveOscPreference(env);
  if (preference === "system") return false;
  if (preference === "osc52") return true;
  const isTTY =
    options.isTTY !== undefined
      ? options.isTTY
      : Boolean(process.stdout && process.stdout.isTTY);
  return isTTY;
}

/**
 * Copy through the platform clipboard tool. Resolves true on success and
 * false when the tool is missing or exits non-zero.
 */
function copyViaCommand(text) {
  return new Promise((resolve) => {
    const { cmd, args, shell } = getClipboardCommand();
    let settled = false;
    const done = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    const child = spawn(cmd, args, { stdio: "pipe", shell });
    child.on("error", () => done(false));
    child.on("close", (code) => done(code === 0));

    try {
      child.stdin.write(text);
      child.stdin.end();
    } catch {
      done(false);
    }
  });
}

/**
 * Copy text to the system clipboard, falling back to the terminal's OSC 52
 * clipboard when no platform tool is available. Resolves true on success.
 */
async function copyToClipboard(text, options = {}) {
  if (resolveOscPreference(options.env) === "osc52") {
    return osc52(text, options);
  }

  const ok = await copyViaCommand(text);
  if (ok) return true;

  if (canUseOsc52(options)) return osc52(text, options);
  return false;
}

module.exports = {
  getClipboardCommand,
  copyToClipboard,
  canUseOsc52,
  osc52,
  OSC52_MAX_BYTES,
};
