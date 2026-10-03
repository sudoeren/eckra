const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

// Thin wrappers around the GitHub CLI. `gh` is an optional runtime
// dependency: callers check isGhAvailable() and fall back when it is missing.

function runGh(args) {
  return new Promise((resolve, reject) => {
    execFile(
      "gh",
      args,
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          error.stderr = stderr;
          reject(error);
          return;
        }
        resolve(stdout);
      }
    );
  });
}

async function isGhAvailable() {
  try {
    await runGh(["--version"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * runGh, with failures turned into a message worth showing: gh's own
 * stderr, or a hint when gh is missing.
 */
async function runGhOrExplain(args) {
  try {
    return await runGh(args);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("GitHub CLI (gh) is not installed.");
    }
    throw new Error((error.stderr || error.message || "").trim());
  }
}

/**
 * Run a gh command whose body comes from a temp file, so its size and
 * content never hit command-line limits or quoting issues. `buildArgs`
 * receives the file path and returns the gh arguments.
 */
async function runGhWithBody(body, buildArgs) {
  const bodyFile = path.join(
    os.tmpdir(),
    `eckra_gh_${process.pid}_${Date.now()}.md`
  );

  try {
    fs.writeFileSync(bodyFile, body || "", { mode: 0o600 });
    return await runGhOrExplain(buildArgs(bodyFile));
  } finally {
    if (fs.existsSync(bodyFile)) fs.unlinkSync(bodyFile);
  }
}

/**
 * The URL gh prints on its last line after creating or editing something.
 */
function lastUrl(stdout) {
  const url = stdout
    .split("\n")
    .map((line) => line.trim())
    .reverse()
    .find((line) => /^https?:\/\//.test(line));
  return url || stdout.trim();
}

module.exports = {
  runGh,
  runGhOrExplain,
  runGhWithBody,
  lastUrl,
  isGhAvailable,
};
