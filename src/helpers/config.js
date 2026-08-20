const fs = require("fs");
const path = require("path");
const os = require("os");

const CONFIG_DIR = path.join(os.homedir(), ".eckra");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const LOCAL_CONFIG_FILENAME = ".eckrarc";

const DEFAULT_CONFIG = {
  aiProvider: "ollama",
  activeAiConnection: "",
  aiConnections: {},
  lmStudioUrl: "http://localhost:1234",
  openaiApiKey: "",
  openaiModel: "gpt-5-mini",
  anthropicApiKey: "",
  anthropicModel: "claude-haiku-4-5-20251001",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "qwen3.5:2b",
  openrouterApiKey: "",
  openrouterModel: "openai/gpt-oss-120b",
  geminiApiKey: "",
  geminiModel: "gemini-3.1-flash-lite",
  opencodeGoApiKey: "",
  opencodeGoModel: "deepseek-v4-flash",
  deepseekApiKey: "",
  deepseekModel: "deepseek-chat",
  bedrockApiKey: "",
  bedrockRegion: "us-east-1",
  bedrockModel: "us.anthropic.claude-haiku-4-5",
  bedrockMantleApiKey: "",
  bedrockMantleRegion: "us-east-1",
  bedrockMantleModel: "us.anthropic.claude-haiku-4-5",
  ollamaCloudApiKey: "",
  ollamaCloudModel: "qwen3.5:2b",
  model: "git-commit-message/unsloth.Q4_K_M.gguf",
  theme: "auto",
  lazygitKey: "C",
  onboarded: false,
  commitType: "conventional+body",
  subjectMaxLength: 50,
  locale: "en",
  timeout: 30000,
  aiInstruction:
    "Use concise, present tense, and descriptive language. Focus on the 'why' of the changes.",
};

/**
 * Field names each provider may store inside a saved AI connection.
 * Single source of truth for validating `saveAIConnection` input.
 */
const PROVIDER_FIELDS = {
  lmstudio: ["lmStudioUrl", "model"],
  ollama: ["ollamaUrl", "ollamaModel"],
  openai: ["openaiApiKey", "openaiModel"],
  anthropic: ["anthropicApiKey", "anthropicModel"],
  openrouter: ["openrouterApiKey", "openrouterModel"],
  gemini: ["geminiApiKey", "geminiModel"],
  opencodego: ["opencodeGoApiKey", "opencodeGoModel"],
  deepseek: ["deepseekApiKey", "deepseekModel"],
  bedrock: ["bedrockApiKey", "bedrockRegion", "bedrockModel"],
  bedrockmantle: [
    "bedrockMantleApiKey",
    "bedrockMantleRegion",
    "bedrockMantleModel",
  ],
  ollamacloud: ["ollamaCloudApiKey", "ollamaCloudModel"],
};

const AI_PROVIDERS = Object.keys(PROVIDER_FIELDS);

/**
 * Config keys managed through dedicated commands (`eckra provider`) rather
 * than `eckra config set` — raw maps are unsafe to edit as CLI strings.
 */
const MANAGED_CONFIG_KEYS = ["aiConnections"];

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

const ENV_PREFIX = "ECKRA_";

/**
 * Map a config key to its environment variable name:
 * `openaiApiKey` -> `ECKRA_OPENAI_API_KEY`, `lmStudioUrl` -> `ECKRA_LM_STUDIO_URL`
 */
function envVarName(key) {
  return ENV_PREFIX + key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

/**
 * Read config overrides from ECKRA_* environment variables.
 * Empty values are ignored so `ECKRA_X=""` unset can't clear a file value.
 */
function getEnvConfig() {
  const overrides = {};
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    const value = process.env[envVarName(key)];
    if (value !== undefined && value !== "") {
      overrides[key] = value;
    }
  }
  return overrides;
}

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
  let globalRaw = {};

  // 1. Global config
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const globalData = fs.readFileSync(CONFIG_FILE, "utf8");
      const parsed = JSON.parse(globalData);
      if (typeof parsed === "object" && parsed !== null) {
        globalRaw = parsed;
        config = { ...config, ...parsed };
      }
    } catch {
      console.warn(
        `\n  Warning: Malformed global config file at ${CONFIG_FILE}. Using defaults.\n`
      );
    }
  }

  // 2. Local config raw (read once; applied after the active connection)
  let localRaw = {};
  const localConfigPath = findLocalConfig();
  if (localConfigPath) {
    try {
      const localData = fs.readFileSync(localConfigPath, "utf8");
      const parsed = JSON.parse(localData);
      if (typeof parsed === "object" && parsed !== null) {
        localRaw = parsed;
      }
    } catch {
      console.warn(
        `\n  Warning: Malformed local config file at ${localConfigPath}. Ignoring local overrides.\n`
      );
    }
  }

  // 3. Environment variables (ECKRA_*) — read once, applied last
  const envOverrides = getEnvConfig();

  // 4. Active saved AI connection. The name resolves as
  // .eckrarc > ECKRA_ACTIVE_AI_CONNECTION > global config; its fields are
  // merged over the global values but stay weaker than local/env overrides.
  const hasLocalActive = Object.prototype.hasOwnProperty.call(
    localRaw,
    "activeAiConnection"
  );
  const activeName = hasLocalActive
    ? localRaw.activeAiConnection
    : envOverrides.activeAiConnection !== undefined
      ? envOverrides.activeAiConnection
      : globalRaw.activeAiConnection;
  if (typeof activeName === "string" && activeName) {
    const connections =
      globalRaw.aiConnections && typeof globalRaw.aiConnections === "object"
        ? globalRaw.aiConnections
        : {};
    const connection = connections[activeName];
    if (
      connection &&
      typeof connection === "object" &&
      typeof connection.provider === "string"
    ) {
      const scoped = { aiProvider: connection.provider };
      for (const field of PROVIDER_FIELDS[connection.provider] || []) {
        if (connection[field] !== undefined) scoped[field] = connection[field];
      }
      config = { ...config, ...scoped };
    }
  }

  // 5. Local config (overrides global + active connection)
  config = { ...config, ...localRaw };

  // 6. Environment variables override everything
  config = { ...config, ...envOverrides };

  // Normalize URL fields once so downstream path concatenation is safe
  config.lmStudioUrl = normalizeUrl(config.lmStudioUrl);
  config.ollamaUrl = normalizeUrl(config.ollamaUrl);

  _cachedConfig = config;
  return config;
}

/**
 * Save configuration. The given `config` is treated as a delta and merged
 * over the raw global config file, so defaults and local `.eckrarc`
 * overrides are never spilled into the global file.
 */
function saveConfig(config) {
  ensureConfigDir();

  const currentGlobal = getRawConfig({ local: false });
  const newConfig = { ...currentGlobal, ...config };

  writeConfigFile(JSON.stringify(newConfig, null, 2));
  _cachedConfig = null; // Invalidate cache; getConfig() re-applies local overrides
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
    Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, key) &&
    !MANAGED_CONFIG_KEYS.includes(key)
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
    const validKeys = Object.keys(DEFAULT_CONFIG).filter(
      (k) => !MANAGED_CONFIG_KEYS.includes(k)
    );
    throw new Error(
      `Unknown config key: "${key}". Valid keys: ${validKeys.join(", ")}`
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

// ─── Saved AI connections ──────────────────────────────────────
// Multiple provider credentials stored side by side (e.g. two OpenAI
// accounts plus an OpenRouter key). One connection is active at a time;
// getConfig() merges its fields so the rest of the app is unaware of them.

function getConnectionMap(raw) {
  return raw.aiConnections && typeof raw.aiConnections === "object"
    ? raw.aiConnections
    : {};
}

/**
 * List saved AI connections sorted by name:
 * `[{ name, provider, <provider fields> }, ...]`
 */
function listAIConnections() {
  const map = getConnectionMap(getRawConfig({ local: false }));
  return Object.keys(map)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, ...map[name] }));
}

/**
 * Get one saved AI connection by name, or null when missing.
 */
function getAIConnection(name) {
  const map = getConnectionMap(getRawConfig({ local: false }));
  const entry = map[name];
  return entry && typeof entry === "object" ? { name, ...entry } : null;
}

/**
 * Validate and normalize a connection name.
 */
function validateConnectionName(name) {
  const clean = String(name == null ? "" : name).trim();
  if (!clean) throw new Error("Connection name is required");
  if (/[\r\n]/.test(clean)) {
    throw new Error("Connection name must be a single line");
  }
  if (clean.length > 64) {
    throw new Error("Connection name is too long (max 64 characters)");
  }
  return clean;
}

/**
 * Create or update a saved AI connection in the global config. Only fields
 * valid for the given provider are accepted — unknown fields throw so
 * typos fail loudly instead of silently doing nothing. With
 * `{ activate: true }` the connection also becomes the active one.
 */
function saveAIConnection(name, data, { activate = false } = {}) {
  const cleanName = validateConnectionName(name);
  const provider = data ? data.provider : undefined;
  if (!AI_PROVIDERS.includes(provider)) {
    throw new Error(
      `Unknown provider: "${provider}". Valid providers: ${AI_PROVIDERS.join(", ")}`
    );
  }

  const fields = PROVIDER_FIELDS[provider];
  for (const key of Object.keys(data)) {
    if (key !== "provider" && !fields.includes(key)) {
      throw new Error(
        `"${key}" is not a ${provider} field. Valid fields: ${fields.join(", ")}`
      );
    }
  }

  const entry = { provider };
  for (const field of fields) {
    const value = data[field];
    if (value !== undefined && value !== null && value !== "") {
      entry[field] = value;
    }
  }

  ensureConfigDir();
  const raw = getRawConfig({ local: false });
  const connections = getConnectionMap(raw);
  connections[cleanName] = entry;
  raw.aiConnections = connections;
  if (activate) raw.activeAiConnection = cleanName;

  writeConfigFile(JSON.stringify(raw, null, 2));
  _cachedConfig = null;
  return { name: cleanName, ...entry };
}

/**
 * Delete a saved AI connection. Returns true when something was removed.
 * A matching active pointer is cleared so getConfig() never resolves a
 * ghost connection name.
 */
function deleteAIConnection(name) {
  const raw = getRawConfig({ local: false });
  const connections = getConnectionMap(raw);
  if (!(name in connections)) return false;

  delete connections[name];
  if (Object.keys(connections).length === 0) delete raw.aiConnections;
  if (raw.activeAiConnection === name) raw.activeAiConnection = "";

  writeConfigFile(JSON.stringify(raw, null, 2));
  _cachedConfig = null;
  return true;
}

/**
 * Rename a saved AI connection, keeping it active if it was.
 */
function renameAIConnection(oldName, newName) {
  const cleanNew = validateConnectionName(newName);
  const raw = getRawConfig({ local: false });
  const connections = getConnectionMap(raw);
  if (!(oldName in connections)) {
    throw new Error(`No saved connection named "${oldName}"`);
  }
  if (cleanNew !== oldName && cleanNew in connections) {
    throw new Error(`A connection named "${cleanNew}" already exists`);
  }

  connections[cleanNew] = connections[oldName];
  delete connections[oldName];
  if (raw.activeAiConnection === oldName) raw.activeAiConnection = cleanNew;

  writeConfigFile(JSON.stringify(raw, null, 2));
  _cachedConfig = null;
  return { name: cleanNew, ...connections[cleanNew] };
}

/**
 * Point eckra at a saved AI connection (empty string clears the choice).
 * With `{ local: true }` the choice is pinned to the current repo via
 * `.eckrarc` instead of the global config.
 */
function setActiveAIConnection(name, { local = false } = {}) {
  const cleanName = String(name == null ? "" : name).trim();
  if (cleanName && !getAIConnection(cleanName)) {
    throw new Error(`No saved connection named "${cleanName}"`);
  }
  setConfigValue("activeAiConnection", cleanName, { local });
  return cleanName;
}

/**
 * Check whether onboarding has been completed.
 *
 * Onboarding only counts as done once its completion flag is set (written
 * after every onboarding step finishes). An explicit `onboarded: false` also
 * means "not done". Existing users who have a global config without the flag
 * are migrated as done so they are not re-onboarded.
 */
function isConfigured() {
  if (getConfig().onboarded === true) return true;
  const raw = getRawConfig({ local: false });
  if (Object.prototype.hasOwnProperty.call(raw, "onboarded")) {
    return raw.onboarded === true;
  }
  return fs.existsSync(CONFIG_FILE);
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
  findLocalConfig,
  listAIConnections,
  getAIConnection,
  saveAIConnection,
  deleteAIConnection,
  renameAIConnection,
  setActiveAIConnection,
  DEFAULT_CONFIG,
  PROVIDER_FIELDS,
  AI_PROVIDERS,
  MANAGED_CONFIG_KEYS,
  normalizeUrl,
  envVarName,
  getEnvConfig,
};
