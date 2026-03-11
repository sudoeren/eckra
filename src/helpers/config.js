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
  openaiModel: "gpt-4o",
  anthropicApiKey: "",
  anthropicModel: "claude-3-5-sonnet-20240620",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "llama3",
  openrouterApiKey: "",
  openrouterModel: "openai/gpt-4o",
  geminiApiKey: "",
  geminiModel: "gemini-2.0-flash",
  model: "git-commit-message/unsloth.Q4_K_M.gguf",
  language: "en",
  autoStage: false,
  autoPush: false,
  commitPrefix: true,
  theme: "dark",
  aiInstruction: "Use concise, present tense, and descriptive language. Focus on the 'why' of the changes.",
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

/**
 * Get current configuration
 */
function getConfig() {
  ensureConfigDir();

  let config = { ...DEFAULT_CONFIG };

  // 1. Global config
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const globalData = fs.readFileSync(CONFIG_FILE, "utf8");
      const parsed = JSON.parse(globalData);
      if (typeof parsed === "object" && parsed !== null) {
        config = { ...config, ...parsed };
      }
    } catch (error) {
      console.warn(`\n  ⚠️  Warning: Malformed global config file at ${CONFIG_FILE}. Using defaults.\n`);
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
    } catch (error) {
      console.warn(`\n  ⚠️  Warning: Malformed local config file at ${localConfigPath}. Ignoring local overrides.\n`);
    }
  }

  return config;
}

/**
 * Save configuration
 */
function saveConfig(config) {
  ensureConfigDir();

  const currentConfig = getConfig();
  const newConfig = { ...currentConfig, ...config };

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2));
  return newConfig;
}

/**
 * Reset configuration to defaults
 */
function resetConfig() {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
  return DEFAULT_CONFIG;
}

/**
 * Get config file path
 */
function getConfigPath() {
  return CONFIG_FILE;
}

module.exports = {
  getConfig,
  saveConfig,
  resetConfig,
  getConfigPath,
  DEFAULT_CONFIG,
};
