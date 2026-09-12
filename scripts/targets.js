// Target definitions for the standalone binaries. Kept in CommonJS so the
// ESM build scripts can import it and Jest can require it directly.

const TARGETS = {
  "linux-x64": { target: "node22-linux-x64", output: "eckra-linux-x64" },
  "linux-arm64": {
    target: "node22-linux-arm64",
    output: "eckra-linux-arm64",
  },
  "win-x64": { target: "node22-win-x64", output: "eckra-win-x64.exe" },
  "macos-x64": { target: "node22-macos-x64", output: "eckra-macos-x64" },
  "macos-arm64": { target: "node22-macos-arm64", output: "eckra-macos-arm64" },
};

const GROUPS = {
  linux: ["linux-x64", "linux-arm64"],
  win: ["win-x64"],
  macos: ["macos-x64", "macos-arm64"],
  all: ["linux-x64", "linux-arm64", "win-x64", "macos-x64", "macos-arm64"],
};

/**
 * Resolve target groups to a de-duplicated list of target descriptors.
 * Defaults to linux + win so a local build on Linux does not try to sign
 * macOS binaries. Unknown groups throw.
 */
function selectTargets(groups) {
  const requested = groups && groups.length ? groups : ["linux", "win"];

  const unknown = requested.filter((group) => !GROUPS[group]);
  if (unknown.length) {
    throw new Error(
      `unknown target group(s): ${unknown.join(", ")} (valid: ${Object.keys(
        GROUPS
      ).join(", ")})`
    );
  }

  const keys = [];
  for (const group of requested) {
    for (const key of GROUPS[group]) {
      if (!keys.includes(key)) keys.push(key);
    }
  }
  return keys.map((key) => TARGETS[key]);
}

module.exports = { TARGETS, GROUPS, selectTargets };
