const { execSync } = require("child_process");
const axios = require("axios");

const PACKAGE_NAME = "eckra";
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
const UPGRADE_COMMAND = `npm install -g ${PACKAGE_NAME}@latest`;

/**
 * Get the currently installed version
 */
function getInstalledVersion() {
  return require("../../package.json").version;
}

/**
 * Fetch the latest published version from the npm registry.
 * Returns null when the registry can't be reached (offline, etc.).
 */
async function fetchLatestVersion() {
  try {
    const response = await axios.get(REGISTRY_URL, { timeout: 8000 });
    return response.data?.version || null;
  } catch {
    return null;
  }
}

/**
 * Compare two dotted version strings numerically (e.g. "1.4.10" > "1.4.9")
 */
function isVersionNewer(latest, current) {
  if (!latest || !current) return false;
  const a = String(latest).split(".").map(Number);
  const b = String(current).split(".").map(Number);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const left = a[i] || 0;
    const right = b[i] || 0;
    if (left > right) return true;
    if (left < right) return false;
  }
  return false;
}

/**
 * Check whether an update is available.
 * Returns { current, latest, outdated } where `latest` is null when the
 * registry could not be reached.
 */
async function checkForUpdates() {
  const current = getInstalledVersion();
  const latest = await fetchLatestVersion();
  return {
    current,
    latest,
    outdated: isVersionNewer(latest, current),
  };
}

/**
 * Upgrade the globally installed package to the latest version.
 */
function runGlobalUpgrade() {
  return execSync(UPGRADE_COMMAND, {
    stdio: "inherit",
    env: process.env,
  });
}

module.exports = {
  PACKAGE_NAME,
  REGISTRY_URL,
  UPGRADE_COMMAND,
  getInstalledVersion,
  fetchLatestVersion,
  isVersionNewer,
  checkForUpdates,
  runGlobalUpgrade,
};
