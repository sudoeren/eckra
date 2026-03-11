const inquirer = require("inquirer");
const autocomplete = require("inquirer-autocomplete-prompt");
const { getConfig, saveConfig } = require("../../helpers/config");
const { checkAIConnection, fetchOpenRouterModels } = require("../../helpers/ai");
const { s, header, clear, sleep, truncate } = require("../common");

inquirer.registerPrompt("autocomplete", autocomplete);

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
 * Get configuration questions for a provider
 */
function getProviderQuestions(provider, config) {
  switch (provider) {
    case "openai":
      return [
        { type: "input", name: "openaiApiKey", message: "OpenAI API Key:", default: config.openaiApiKey },
        { type: "input", name: "openaiModel", message: "Model (e.g. gpt-4o, gpt-3.5-turbo):", default: config.openaiModel }
      ];
    case "anthropic":
      return [
        { type: "input", name: "anthropicApiKey", message: "Anthropic API Key:", default: config.anthropicApiKey },
        { type: "input", name: "anthropicModel", message: "Model (e.g. claude-3-5-sonnet-20240620):", default: config.anthropicModel }
      ];
    case "ollama":
      return [
        { type: "input", name: "ollamaUrl", message: "Ollama URL:", default: config.ollamaUrl },
        { type: "input", name: "ollamaModel", message: "Model (e.g. llama3):", default: config.ollamaModel }
      ];
    case "openrouter":
      return [
        { type: "input", name: "openrouterApiKey", message: "OpenRouter API Key:", default: config.openrouterApiKey },
      ];
    case "gemini":
      return [
        { type: "input", name: "geminiApiKey", message: "Google Gemini API Key:", default: config.geminiApiKey },
        { type: "input", name: "geminiModel", message: "Model (e.g. gemini-2.0-flash, gemini-2.5-pro):", default: config.geminiModel }
      ];
    default:
      return [
        { type: "input", name: "lmStudioUrl", message: "LM Studio URL:", default: config.lmStudioUrl },
        { type: "input", name: "model", message: "Model:", default: config.model }
      ];
  }
}

/**
 * Prompt for OpenRouter model selection using autocomplete with models fetched from API
 */
async function promptOpenRouterModel(apiKey, currentModel) {
  const ora = require("ora");
  const spinner = ora({ text: s.muted("  Fetching models from OpenRouter..."), spinner: "dots" }).start();
  
  let models = await fetchOpenRouterModels(apiKey);
  spinner.stop();

  if (models.length === 0) {
    console.log(s.muted("  Could not fetch models. You can type a model ID manually."));
    const { openrouterModel } = await inquirer.prompt([
      { type: "input", name: "openrouterModel", message: "Model ID:", default: currentModel || "openai/gpt-4o" }
    ]);
    return openrouterModel;
  }

  // Sort: free models first, then by name
  models.sort((a, b) => {
    const aFree = parseFloat(a.pricing?.prompt || "1") === 0;
    const bFree = parseFloat(b.pricing?.prompt || "1") === 0;
    if (aFree !== bFree) return aFree ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const modelChoices = models.map(m => {
    const isFree = parseFloat(m.pricing?.prompt || "1") === 0;
    const label = isFree ? `${m.name}  [free]` : m.name;
    return { name: label, value: m.id, short: m.id };
  });

  const { openrouterModel } = await inquirer.prompt([
    {
      type: "autocomplete",
      name: "openrouterModel",
      message: "Select Model (type to search):",
      source: (_answers, input) => {
        if (!input) return modelChoices;
        const term = input.toLowerCase();
        return modelChoices.filter(c =>
          c.name.toLowerCase().includes(term) || c.value.toLowerCase().includes(term)
        );
      },
      default: currentModel || "openai/gpt-4o",
      pageSize: 15,
    },
  ]);

  return openrouterModel;
}

/**
 * Ask provider configuration and return answers (handles OpenRouter model selection specially)
 */
async function askProviderConfig(provider, config) {
  const questions = getProviderQuestions(provider, config);
  const answers = await inquirer.prompt(questions);

  if (provider === "openrouter") {
    const apiKey = answers.openrouterApiKey || config.openrouterApiKey;
    const model = await promptOpenRouterModel(apiKey, config.openrouterModel);
    answers.openrouterModel = model;
  }

  return answers;
}

const { doOnboarding } = require("./onboarding");

async function doSettings() {
  clear();
  header();
  console.log(s.bold("  Settings\n"));

  const config = getConfig();
  const aiStatus = await checkAIConnection();

  console.log(s.muted("  Provider: ") + s.text(config.aiProvider || "lmstudio"));
  
  if (config.aiProvider === "openai") {
    console.log(s.muted("  Model: ") + s.text(config.openaiModel));
    console.log(s.muted("  API Key: ") + s.text(config.openaiApiKey ? "****" + config.openaiApiKey.slice(-4) : "None"));
  } else if (config.aiProvider === "anthropic") {
    console.log(s.muted("  Model: ") + s.text(config.anthropicModel));
    console.log(s.muted("  API Key: ") + s.text(config.anthropicApiKey ? "****" + config.anthropicApiKey.slice(-4) : "None"));
  } else if (config.aiProvider === "ollama") {
    console.log(s.muted("  URL: ") + s.text(config.ollamaUrl));
    console.log(s.muted("  Model: ") + s.text(config.ollamaModel));
  } else if (config.aiProvider === "openrouter") {
    console.log(s.muted("  Model: ") + s.text(config.openrouterModel));
    console.log(s.muted("  API Key: ") + s.text(config.openrouterApiKey ? "****" + config.openrouterApiKey.slice(-4) : "None"));
  } else if (config.aiProvider === "gemini") {
    console.log(s.muted("  Model: ") + s.text(config.geminiModel));
    console.log(s.muted("  API Key: ") + s.text(config.geminiApiKey ? "****" + config.geminiApiKey.slice(-4) : "None"));
  } else {
    console.log(s.muted("  LM Studio URL: ") + s.text(config.lmStudioUrl));
    console.log(s.muted("  Model: ") + s.text(config.model));
  }

  console.log(s.muted("  AI Instruction: ") + s.text(truncate(config.aiInstruction || "", 50)));
  console.log(s.muted("  Theme: ") + s.text(config.theme || "dark"));
  console.log(
    s.muted("  AI Status: ") +
    (aiStatus.connected ? s.success("Connected ✓") : s.error("Not connected ✗ (" + (aiStatus.error || "Unknown error") + ")")),
  );
  console.log();

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("What should I do?"),
      choices: [
        { name: s.text("  Change Provider"), value: "provider" },
        { name: s.text("  Configure Provider Settings"), value: "configure" },
        { name: s.text("  Change AI Instructions"), value: "instruction" },
        { name: s.text("  Change Theme"), value: "theme" },
        { type: "separator", line: " " },
        { name: s.error("  ⚠ Reset & Restart Onboarding"), value: "reset" },
        { name: s.muted("  ← Back"), value: "back" },
      ],
      loop: true,
      pageSize: 15,
    },
  ]);

  if (action === "back") return;

  if (action === "reset") {
    const { confirmReset } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmReset",
        message: s.error("Are you sure? This will delete all your API keys and settings."),
        default: false
      }
    ]);

    if (confirmReset) {
      const { resetConfig } = require("../../helpers/config");
      resetConfig();
      console.log(s.success("\n  ✓ Settings reset to default. Starting onboarding..."));
      await sleep(1000);
      await doOnboarding();
      return;
    }
    return;
  }

  if (action === "provider") {
    const { provider } = await inquirer.prompt([
      {
        type: "list",
        name: "provider",
        message: s.muted("Select AI Provider:"),
        choices: [
          { name: "LM Studio (Local)", value: "lmstudio" },
          { name: "OpenAI", value: "openai" },
          { name: "Anthropic (Claude)", value: "anthropic" },
          { name: "Ollama (Local)", value: "ollama" },
          { name: "OpenRouter", value: "openrouter" },
          { name: "Google Gemini", value: "gemini" },
        ],
        default: config.aiProvider,
        loop: true,
        pageSize: 15,
      },
    ]);

    // Check if this provider requires an API key and it's not yet configured
    const keyField = getRequiredKeyField(provider);
    const needsSetup = keyField && !config[keyField];

    if (needsSetup) {
      console.log(s.muted("\n  This provider requires configuration. Let's set it up:\n"));
      const answers = await askProviderConfig(provider, config);
      saveConfig({ ...config, aiProvider: provider, ...answers });
      console.log(s.success("\n  ✓ Provider changed to " + provider + " and configured"));
    } else {
      saveConfig({ ...config, aiProvider: provider });
      console.log(s.success("\n  ✓ Provider changed to " + provider));
    }

    await sleep(600);
    return;
  }

  if (action === "configure") {
    const provider = config.aiProvider || "lmstudio";
    const answers = await askProviderConfig(provider, config);
    saveConfig({ ...config, ...answers });
    console.log(s.success("\n  ✓ Settings saved!"));
    await sleep(600);
    return;
  }

  if (action === "instruction") {
    const { instruction } = await inquirer.prompt([
      {
        type: "input",
        name: "instruction",
        message: s.muted("AI System Instruction:"),
        default: config.aiInstruction,
      },
    ]);
    saveConfig({ ...config, aiInstruction: instruction });
    console.log(s.success("\n  ✓ Saved!"));
    await sleep(600);
  }

  if (action === "theme") {
    const { theme } = await inquirer.prompt([
      {
        type: "list",
        name: "theme",
        message: s.muted("Select Theme:"),
        choices: [
          { name: "Auto (Detect terminal theme)", value: "auto" },
          { name: "Dark", value: "dark" },
          { name: "Light", value: "light" },
        ],
        default: config.theme || "auto",
        loop: true,
        pageSize: 15,
      },
    ]);
    saveConfig({ ...config, theme });
    console.log(s.success("\n  ✓ Theme changed to " + theme));
    await sleep(600);
  }
}

module.exports = { doSettings };
