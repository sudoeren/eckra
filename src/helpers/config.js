const fs = require("fs");
const path = require("path");
const os = require("os");

const CONFIG_DIR = path.join(os.homedir(), ".eckra");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const LOCAL_CONFIG_FILENAME = ".eckrarc";

const DEFAULT_CONFIG = {
  aiProvider: "lmstudio",
  lmStudioUrl: "http://localhost:1234",
  openaiApiKey: "",
  openaiModel: "gpt-5-mini",
  anthropicApiKey: "",
  anthropicModel: "claude-sonnet-4-6",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "",
  openrouterApiKey: "",
  openrouterModel: "openai/gpt-oss-120b",
  geminiApiKey: "",
  geminiModel: "gemini-3.1-flash-lite",
  model: "git-commit-message/unsloth.Q4_K_M.gguf",
  theme: "auto",
  aiInstruction:
    "Use concise, present tense, and descriptive language. Focus on the 'why' of the changes.",
};

/**
 * Ensure config directory exists
 */
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Enforce owner-only permissions on the global config file (it holds API keys)
 */
function secureConfigFile() {
  try {
    if (fs.existsSync(CONFIG_FILE)) fs.chmodSync(CONFIG_FILE, 0o600);
  } catch {}
}

/**
 * Write a config file with 0600 permissions (API keys may be stored in it).
 * writeFileSync only applies mode on creation, so chmod enforces it for
 * existing files too.
 */
function writeFile0600(file, data) {
  fs.writeFileSync(file, data, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {}
}

/**
 * Write the global config file with 0600 permissions.
 */
function writeConfigFile(data) {
  writeFile0600(CONFIG_FILE, data);
}

/**
 * Find local configuration file in current or parent directories
 */
function findLocalConfig(startDir = process.cwd()) {
  let currentDir = startDir;
  while (currentDir !== path.parse(currentDir).root) {
    const localPath = path.join(currentDir, LOCAL_CONFIG_FILENAME);
    if (fs.existsSync(localPath)) {
      return localPath;
    }
    currentDir = path.dirname(currentDir);
  }
  // Check root
  const rootLocalPath = path.join(currentDir, LOCAL_CONFIG_FILENAME);
  if (fs.existsSync(rootLocalPath)) {
    return rootLocalPath;
  }
  return null;
}

let _cachedConfig = null;

/**
 * Strip trailing slashes from a URL so path concatenation never yields "//"
 */
function normalizeUrl(url) {
  if (!url) return url;
  return String(url).replace(/\/+$/, "");
}

/**
 * Get current configuration
 */
function getConfig() {
  if (_cachedConfig) return _cachedConfig;

  ensureConfigDir();
  secureConfigFile();

  let config = { ...DEFAULT_CONFIG };

  // 1. Global config
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const globalData = fs.readFileSync(CONFIG_FILE, "utf8");
      const parsed = JSON.parse(globalData);
      if (typeof parsed === "object" && parsed !== null) {
        config = { ...config, ...parsed };
      }
    } catch {
      console.warn(
        `\n  ⚠️  Warning: Malformed global config file at ${CONFIG_FILE}. Using defaults.\n`
      );
    }
  }

  // 2. Local config (overrides global)
  const localConfigPath = findLocalConfig();
  if (localConfigPath) {
    try {
      const localData = fs.readFileSync(localConfigPath, "utf8");
      const parsed = JSON.parse(localData);
      if (typeof parsed === "object" && parsed !== null) {
        config = { ...config, ...parsed };
      }
    } catch {
      console.warn(
        `\n  ⚠️  Warning: Malformed local config file at ${localConfigPath}. Ignoring local overrides.\n`
      );
    }
  }

  // Normalize URL fields once so downstream path concatenation is safe
  config.lmStudioUrl = normalizeUrl(config.lmStudioUrl);
  config.ollamaUrl = normalizeUrl(config.ollamaUrl);

  _cachedConfig = config;
  return config;
}

/**
 * Save configuration
 */
function saveConfig(config) {
  ensureConfigDir();

  const currentConfig = getConfig();
  const newConfig = { ...currentConfig, ...config };

  writeConfigFile(JSON.stringify(newConfig, null, 2));
  _cachedConfig = newConfig; // Update cache
  return newConfig;
}

/**
 * Reset configuration to defaults. With `{ local: true }` the local
 * `.eckrarc` override file is removed instead.
 */
function resetConfig({ local = false } = {}) {
  if (local) {
    const file = getConfigPath({ local });
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
    _cachedConfig = null;
    return {};
  }

  ensureConfigDir();
  writeConfigFile(JSON.stringify(DEFAULT_CONFIG, null, 2));
  _cachedConfig = { ...DEFAULT_CONFIG }; // Update cache
  return DEFAULT_CONFIG;
}

/**
 * Get config file path. With `{ local: true }` returns the `.eckrarc`
 * path in the current working directory.
 */
function getConfigPath({ local = false } = {}) {
  if (local) return path.join(process.cwd(), LOCAL_CONFIG_FILENAME);
  return CONFIG_FILE;
}

/**
 * Read a config file's raw contents (no defaults/local merging).
 * Returns an empty object if the file is missing or malformed.
 */
function getRawConfig({ local = false } = {}) {
  const file = getConfigPath({ local });
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Whether `key` is a known config key (typo protection for set/unset)
 */
function isValidConfigKey(key) {
  return (
    typeof key === "string" &&
    Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, key)
  );
}

/**
 * Mask a secret value for display: `****` + last 4 chars, or "(not set)".
 */
function maskSecret(value) {
  if (!value) return "(not set)";
  const str = String(value);
  if (str.length <= 4) return "****";
  return "****" + str.slice(-4);
}

/**
 * Set a single config key on the raw target file (global or local).
 * Only the delta is written — defaults/local overrides are never spilled
 * into the target file. Invalidates the in-memory config cache.
 */
function setConfigValue(key, value, { local = false } = {}) {
  if (!isValidConfigKey(key)) {
    throw new Error(
      `Unknown config key: "${key}". Valid keys: ${Object.keys(DEFAULT_CONFIG).join(", ")}`
    );
  }

  const file = getConfigPath({ local });
  ensureConfigDir();

  const raw = getRawConfig({ local });
  raw[key] = value;
  writeFile0600(file, JSON.stringify(raw, null, 2));

  _cachedConfig = null;
  return raw[key];
}

/**
 * Remove a config key from the raw target file. Returns true if the key
 * was present and removed, false otherwise. Any existing key can be
 * removed (including legacy keys not in DEFAULT_CONFIG).
 */
function unsetConfigValue(key, { local = false } = {}) {
  const file = getConfigPath({ local });
  if (!fs.existsSync(file)) return false;

  const raw = getRawConfig({ local });
  if (!(key in raw)) return false;

  delete raw[key];
  writeFile0600(file, JSON.stringify(raw, null, 2));

  _cachedConfig = null;
  return true;
}

/**
 * Check if the application is configured (global config file or local .eckrarc)
 */
function isConfigured() {
  return fs.existsSync(CONFIG_FILE) || findLocalConfig() !== null;
}

function resetConfigCache() {
  _cachedConfig = null;
}

module.exports = {
  getConfig,
  saveConfig,
  resetConfig,
  resetConfigCache, // Exported for testing
  getConfigPath,
  isConfigured,
  getRawConfig,
  isValidConfigKey,
  maskSecret,
  setConfigValue,
  unsetConfigValue,
  DEFAULT_CONFIG,
  normalizeUrl,
};
