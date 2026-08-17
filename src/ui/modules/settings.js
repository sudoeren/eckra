const inquirer = require("inquirer");
const autocomplete = require("inquirer-autocomplete-prompt");
const { execSync } = require("child_process");
const {
  getConfig,
  saveConfig,
  resetConfig,
  DEFAULT_CONFIG,
} = require("../../helpers/config");
const {
  checkAIConnection,
  testProviderConnection,
  fetchOpenRouterModels,
  fetchOpenAIModels,
  fetchAnthropicModels,
  fetchGeminiModels,
  fetchOllamaModels,
  fetchLMStudioModels,
} = require("../../helpers/ai");
const { s, clear, sleep, pause } = require("../common");
const {
  open,
  menuItem,
  backItem,
  sep,
  prompt,
  spinner,
  done,
  fail,
} = require("../screen");

inquirer.registerPrompt("autocomplete", autocomplete);

/**
 * Test provider connection with a spinner, then save or let user decide
 */
async function testAndSaveProvider(provider, fullConfig, answers) {
  const spin = spinner("Testing connection...");
  spin.start();
  const result = await testProviderConnection(provider, fullConfig);
  spin.stop();

  if (result.connected) {
    console.log(s.success("  ✓ Connection successful!"));
    saveConfig({ ...answers, aiProvider: provider });
    console.log(s.success("  ✓ Provider configured: " + provider));
  } else {
    console.log(
      s.error("  ✗ Connection failed: " + (result.error || "Unknown error"))
    );
    const { saveAnyway } = await prompt([
      {
        type: "confirm",
        name: "saveAnyway",
        message: s.muted("Save settings anyway?"),
        default: false,
      },
    ]);
    if (saveAnyway) {
      saveConfig({ ...answers, aiProvider: provider });
      console.log(s.success("  ✓ Settings saved (connection pending)"));
    } else {
      console.log(s.muted("  Settings not saved."));
    }
  }
  await sleep(600);
}

/**
 * Get the required API key field name for a provider (null if no key needed)
 */
function getRequiredKeyField(provider) {
  const keyFields = {
    openai: "openaiApiKey",
    anthropic: "anthropicApiKey",
    openrouter: "openrouterApiKey",
    gemini: "geminiApiKey",
  };
  return keyFields[provider] || null;
}

/**
 * Get configuration questions for a provider (excluding model selection)
 */
function getProviderQuestions(provider, config) {
  switch (provider) {
    case "openai":
      return [
        {
          type: "input",
          name: "openaiApiKey",
          message: "OpenAI API Key:",
          default: config.openaiApiKey,
        },
      ];
    case "anthropic":
      return [
        {
          type: "input",
          name: "anthropicApiKey",
          message: "Anthropic API Key:",
          default: config.anthropicApiKey,
        },
      ];
    case "ollama":
      return [
        {
          type: "input",
          name: "ollamaUrl",
          message: "Ollama URL:",
          default: config.ollamaUrl,
        },
      ];
    case "openrouter":
      return [
        {
          type: "input",
          name: "openrouterApiKey",
          message: "OpenRouter API Key:",
          default: config.openrouterApiKey,
        },
      ];
    case "gemini":
      return [
        {
          type: "input",
          name: "geminiApiKey",
          message: "Google Gemini API Key:",
          default: config.geminiApiKey,
        },
      ];
    default:
      return [
        {
          type: "input",
          name: "lmStudioUrl",
          message: "LM Studio URL:",
          default: config.lmStudioUrl,
        },
      ];
  }
}

/**
 * Prompt for model selection using autocomplete with models fetched from the provider's API
 */
async function promptModelSearch(provider, answers, config) {
  let models;
  let currentModel;
  let configKey;
  let fetchLabel;

  switch (provider) {
    case "openai":
      configKey = "openaiModel";
      currentModel = config.openaiModel || DEFAULT_CONFIG.openaiModel;
      fetchLabel = "Fetching models from OpenAI...";
      break;
    case "anthropic":
      configKey = "anthropicModel";
      currentModel = config.anthropicModel || DEFAULT_CONFIG.anthropicModel;
      fetchLabel = "Loading Anthropic models...";
      break;
    case "gemini":
      configKey = "geminiModel";
      currentModel = config.geminiModel || DEFAULT_CONFIG.geminiModel;
      fetchLabel = "Fetching models from Gemini...";
      break;
    case "ollama":
      configKey = "ollamaModel";
      currentModel = config.ollamaModel || DEFAULT_CONFIG.ollamaModel;
      fetchLabel = "Fetching models from Ollama...";
      break;
    case "openrouter":
      configKey = "openrouterModel";
      currentModel = config.openrouterModel || DEFAULT_CONFIG.openrouterModel;
      fetchLabel = "Fetching models from OpenRouter...";
      break;
    case "lmstudio":
    default:
      configKey = "model";
      currentModel = config.model || DEFAULT_CONFIG.model;
      fetchLabel = "Fetching models from LM Studio...";
      break;
  }

  const spin = spinner(fetchLabel);
  spin.start();

  switch (provider) {
    case "openai":
      models = await fetchOpenAIModels(
        answers.openaiApiKey || config.openaiApiKey
      );
      break;
    case "anthropic":
      models = await fetchAnthropicModels();
      break;
    case "gemini":
      models = await fetchGeminiModels(
        answers.geminiApiKey || config.geminiApiKey
      );
      break;
    case "ollama":
      models = await fetchOllamaModels(answers.ollamaUrl || config.ollamaUrl);
      break;
    case "openrouter":
      models = await fetchOpenRouterModels(
        answers.openrouterApiKey || config.openrouterApiKey
      );
      break;
    case "lmstudio":
    default:
      models = await fetchLMStudioModels(
        answers.lmStudioUrl || config.lmStudioUrl
      );
      break;
  }

  spin.stop();

  if (models.length === 0) {
    console.log(
      s.muted("  Could not fetch models. You can type a model name manually.")
    );
    const result = await prompt([
      {
        type: "input",
        name: configKey,
        message: "Model:",
        default: currentModel,
      },
    ]);
    return result;
  }

  const modelChoices = models.map((m) => ({
    name: m.name !== m.id ? `${m.name}  (${m.id})` : m.name,
    value: m.id,
    short: m.id,
  }));

  const result = await prompt([
    {
      type: "autocomplete",
      name: configKey,
      message: "Select Model (type to search):",
      source: (_answers, input) => {
        if (!input) return modelChoices;
        const term = input.toLowerCase();
        return modelChoices.filter(
          (c) =>
            c.name.toLowerCase().includes(term) ||
            c.value.toLowerCase().includes(term)
        );
      },
      default: currentModel,
      pageSize: 15,
    },
  ]);

  return result;
}

/**
 * Ask provider configuration and return answers (handles model selection with autocomplete for all providers)
 */
async function askProviderConfig(provider, config) {
  const questions = getProviderQuestions(provider, config);
  const answers = questions.length > 0 ? await prompt(questions) : {};

  const modelAnswers = await promptModelSearch(provider, answers, config);

  return { ...answers, ...modelAnswers };
}

async function doSettings() {
  open("Settings");

  const config = getConfig();
  const aiStatus = await checkAIConnection();

  console.log(
    s.muted("  Provider: ") + s.text(config.aiProvider || "lmstudio")
  );

  if (config.aiProvider === "openai") {
    console.log(s.muted("  Model: ") + s.text(config.openaiModel));
    console.log(
      s.muted("  API Key: ") +
        s.text(
          config.openaiApiKey ? "****" + config.openaiApiKey.slice(-4) : "None"
        )
    );
  } else if (config.aiProvider === "anthropic") {
    console.log(s.muted("  Model: ") + s.text(config.anthropicModel));
    console.log(
      s.muted("  API Key: ") +
        s.text(
          config.anthropicApiKey
            ? "****" + config.anthropicApiKey.slice(-4)
            : "None"
        )
    );
  } else if (config.aiProvider === "ollama") {
    console.log(s.muted("  URL: ") + s.text(config.ollamaUrl));
    console.log(s.muted("  Model: ") + s.text(config.ollamaModel));
  } else if (config.aiProvider === "openrouter") {
    console.log(s.muted("  Model: ") + s.text(config.openrouterModel));
    console.log(
      s.muted("  API Key: ") +
        s.text(
          config.openrouterApiKey
            ? "****" + config.openrouterApiKey.slice(-4)
            : "None"
        )
    );
  } else if (config.aiProvider === "gemini") {
    console.log(s.muted("  Model: ") + s.text(config.geminiModel));
    console.log(
      s.muted("  API Key: ") +
        s.text(
          config.geminiApiKey ? "****" + config.geminiApiKey.slice(-4) : "None"
        )
    );
  } else {
    console.log(s.muted("  LM Studio URL: ") + s.text(config.lmStudioUrl));
    console.log(s.muted("  Model: ") + s.text(config.model));
  }

  console.log(s.muted("  Theme: ") + s.text(config.theme || "auto"));
  console.log(
    s.muted("  AI Status: ") +
      (aiStatus.connected
        ? s.success("Connected ✓")
        : s.error(
            "Not connected ✗ (" + (aiStatus.error || "Unknown error") + ")"
          ))
  );
  console.log();

  const { action } = await prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("What should I do?"),
      choices: [
        menuItem("Change Provider", "text", "provider"),
        menuItem("Configure Provider Settings", "text", "configure"),
        menuItem("Show AI Instruction", "text", "show-instruction"),
        menuItem("Change AI Instructions", "text", "instruction"),
        menuItem("Change Theme", "text", "theme"),
        sep(),
        menuItem("Reset & Restart Onboarding", "danger", "reset"),
        menuItem("Uninstall Eckra", "danger", "uninstall"),
        backItem(),
      ],
      loop: true,
      pageSize: 15,
    },
  ]);

  if (action === "back") return;

  if (action === "reset") {
    const { confirmReset } = await prompt([
      {
        type: "confirm",
        name: "confirmReset",
        message: s.error(
          "Are you sure? This will delete all your API keys and settings."
        ),
        default: false,
      },
    ]);

    if (confirmReset) {
      resetConfig();
      console.log(
        s.success("\n  ✓ Settings reset to default. Starting onboarding...")
      );
      await sleep(1000);
      await require("./onboarding").doOnboarding();
      return;
    }
    return;
  }

  if (action === "uninstall") {
    const { confirmUninstall } = await prompt([
      {
        type: "confirm",
        name: "confirmUninstall",
        message: s.error(
          "This will DELETE all Eckra settings, API keys, and remove the global package. Continue?"
        ),
        default: false,
      },
    ]);

    if (!confirmUninstall) return;

    const { reallySure } = await prompt([
      {
        type: "input",
        name: "reallySure",
        message: s.error('Type "uninstall" to confirm:'),
        validate: (v) => v === "uninstall" || "Type 'uninstall' to confirm",
      },
    ]);

    if (reallySure !== "uninstall") return;

    clear();
    console.log(s.muted("\n  Uninstalling Eckra...\n"));

    // Remove config directory
    const spinner1 = spinner("Removing config files...");
    spinner1.start();
    try {
      const configDir = require("path").join(require("os").homedir(), ".eckra");
      require("fs").rmSync(configDir, { recursive: true, force: true });
      done(spinner1, "Config files removed");
    } catch {
      fail(spinner1, "Failed to remove config files");
    }

    // Remove lazygit integration
    const spinnerLg = spinner("Removing lazygit integration...");
    spinnerLg.start();
    try {
      const { removeLazygitCommand } = require("../../helpers/lazygit");
      const result = removeLazygitCommand();
      done(
        spinnerLg,
        result.changed
          ? "Lazygit integration removed"
          : "No lazygit integration found"
      );
    } catch {
      fail(spinnerLg, "Failed to remove lazygit integration");
    }

    // Uninstall global package
    const spinner2 = spinner("Uninstalling global package...");
    spinner2.start();
    try {
      execSync("npm uninstall -g eckra", { stdio: ["pipe", "pipe", "ignore"] });
      done(spinner2, "Global package uninstalled");
    } catch {
      spinner2.fail(
        s.warning("  Global package may not be installed or npm not found")
      );
    }

    console.log();
    console.log(s.success("  Eckra has been uninstalled."));
    console.log(s.muted("  You can delete the project folder manually:"));
    console.log(
      s.dim("    rm -rf " + require("path").join(__dirname, "..", "..", ".."))
    );
    console.log();
    await sleep(2000);
    process.exit(0);
  }

  if (action === "provider") {
    const providerChoices = [
      { name: "Ollama (Local)", value: "ollama" },
      { name: "LM Studio (Local)", value: "lmstudio" },
      { name: "OpenAI", value: "openai" },
      { name: "Anthropic (Claude)", value: "anthropic" },
      { name: "OpenRouter", value: "openrouter" },
      { name: "Google Gemini", value: "gemini" },
    ];

    const { provider } = await prompt([
      {
        type: "autocomplete",
        name: "provider",
        message: s.muted("Select AI Provider (type to search):"),
        source: (_answers, input) => {
          if (!input) return providerChoices;
          const term = input.toLowerCase();
          return providerChoices.filter(
            (c) =>
              c.name.toLowerCase().includes(term) ||
              c.value.toLowerCase().includes(term)
          );
        },
        default: config.aiProvider,
        pageSize: 15,
      },
    ]);

    // Check if this provider requires an API key and it's not yet configured
    const keyField = getRequiredKeyField(provider);
    const needsSetup = keyField && !config[keyField];

    let answers = {};
    if (needsSetup) {
      console.log(
        s.muted("\n  This provider requires configuration. Let's set it up:\n")
      );
      answers = await askProviderConfig(provider, config);
    }

    await testAndSaveProvider(provider, { ...config, ...answers }, answers);
    return;
  }

  if (action === "configure") {
    const provider = config.aiProvider || "lmstudio";
    const answers = await askProviderConfig(provider, config);
    await testAndSaveProvider(provider, { ...config, ...answers }, answers);
    return;
  }

  if (action === "show-instruction") {
    console.log();
    console.log(s.muted("  AI Instruction:"));
    console.log(
      s.text("  " + (config.aiInstruction || "No custom instruction set."))
    );
    console.log();
    await pause();
  }

  if (action === "instruction") {
    const { instruction } = await prompt([
      {
        type: "input",
        name: "instruction",
        message: s.muted("AI System Instruction:"),
        default: config.aiInstruction,
      },
    ]);
    saveConfig({ aiInstruction: instruction });
    console.log(s.success("\n  ✓ Saved!"));
    await sleep(600);
  }

  if (action === "theme") {
    const { theme } = await prompt([
      {
        type: "list",
        name: "theme",
        message: s.muted("Select Theme:"),
        choices: [
          menuItem("Auto (Detect terminal theme)", "text", "auto"),
          menuItem("Dark", "text", "dark"),
          menuItem("Light", "text", "light"),
        ],
        default: config.theme || "auto",
        loop: true,
        pageSize: 15,
      },
    ]);
    saveConfig({ theme });
    const { resetThemeCache } = require("../common");
    resetThemeCache();
    console.log(s.success("\n  ✓ Theme changed to " + theme));
    await sleep(600);
  }
}

module.exports = { doSettings, promptModelSearch };
