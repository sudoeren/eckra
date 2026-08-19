const { spawn } = require("child_process");

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

/**
 * Copy text to the system clipboard. Resolves true on success and false
 * when no clipboard tool is available or it exits non-zero.
 */
function copyToClipboard(text) {
  return new Promise((resolve) => {
    const { cmd, args, shell } = getClipboardCommand();
    const child = spawn(cmd, args, { stdio: "pipe", shell });

    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));

    child.stdin.write(text);
    child.stdin.end();
  });
}

module.exports = { getClipboardCommand, copyToClipboard };
