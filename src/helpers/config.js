const fs = require("fs");
const path = require("path");
const os = require("os");

const CONFIG_DIR = path.join(os.homedir(), ".eckra");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG = {
  lmStudioUrl: "http://localhost:1234",
  model: "git-commit-message/unsloth.Q4_K_M.gguf",
  language: "en",
  autoStage: false,
  autoPush: false,
  commitPrefix: true,
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
 * Get current configuration
 */
function getConfig() {
  ensureConfigDir();

  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = fs.readFileSync(CONFIG_FILE, "utf8");
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    } catch (error) {
      return DEFAULT_CONFIG;
    }
  }

  return DEFAULT_CONFIG;
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
