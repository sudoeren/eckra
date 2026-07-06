const inquirer = require("inquirer");
const autocomplete = require("inquirer-autocomplete-prompt");
const ora = require("ora").default;
const { getConfig, saveConfig, resetConfig } = require("../../helpers/config");
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
const { s, header, clear, sleep, truncate } = require("../common");

inquirer.registerPrompt("autocomplete", autocomplete);

/**
 * Test provider connection with a spinner, then save or let user decide
 */
async function testAndSaveProvider(provider, fullConfig, answers) {
  const spinner = ora({
    text: s.muted("  Testing connection..."),
    spinner: "dots",
  }).start();
  const result = await testProviderConnection(provider, fullConfig);
  spinner.stop();

  if (result.connected) {
    console.log(s.success("  ✓ Connection successful!"));
    saveConfig({ ...fullConfig, aiProvider: provider });
    console.log(s.success("  ✓ Provider configured: " + provider));
  } else {
    console.log(
      s.error("  ✗ Connection failed: " + (result.error || "Unknown error")),
    );
    const { saveAnyway } = await inquirer.prompt([
      {
        type: "confirm",
        name: "saveAnyway",
        message: s.muted("Save settings anyway?"),
        default: false,
      },
    ]);
    if (saveAnyway) {
      saveConfig({ ...fullConfig, aiProvider: provider });
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
  let models = [];
  let currentModel = "";
  let configKey = "";
  let fetchLabel = "";

  switch (provider) {
    case "openai":
      configKey = "openaiModel";
      currentModel = config.openaiModel || "gpt-4o";
      fetchLabel = "Fetching models from OpenAI...";
      break;
    case "anthropic":
      configKey = "anthropicModel";
      currentModel = config.anthropicModel || "claude-3-5-sonnet-20240620";
      fetchLabel = "Loading Anthropic models...";
      break;
    case "gemini":
      configKey = "geminiModel";
      currentModel = config.geminiModel || "gemini-2.0-flash";
      fetchLabel = "Fetching models from Gemini...";
      break;
    case "ollama":
      configKey = "ollamaModel";
      currentModel = config.ollamaModel || "llama3";
      fetchLabel = "Fetching models from Ollama...";
      break;
    case "openrouter":
      configKey = "openrouterModel";
      currentModel = config.openrouterModel || "openai/gpt-4o";
      fetchLabel = "Fetching models from OpenRouter...";
      break;
    case "lmstudio":
    default:
      configKey = "model";
      currentModel = config.model || "";
      fetchLabel = "Fetching models from LM Studio...";
      break;
  }

  const spinner = ora({ text: s.muted("  " + fetchLabel), spinner: "dots" }).start();

  switch (provider) {
    case "openai":
      models = await fetchOpenAIModels(answers.openaiApiKey || config.openaiApiKey);
      break;
    case "anthropic":
      models = await fetchAnthropicModels();
      break;
    case "gemini":
      models = await fetchGeminiModels(answers.geminiApiKey || config.geminiApiKey);
      break;
    case "ollama":
      models = await fetchOllamaModels(answers.ollamaUrl || config.ollamaUrl);
      break;
    case "openrouter":
      models = await fetchOpenRouterModels(answers.openrouterApiKey || config.openrouterApiKey);
      break;
    case "lmstudio":
    default:
      models = await fetchLMStudioModels(answers.lmStudioUrl || config.lmStudioUrl);
      break;
  }

  spinner.stop();

  if (models.length === 0) {
    console.log(
      s.muted("  Could not fetch models. You can type a model name manually."),
    );
    const result = await inquirer.prompt([
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

  const result = await inquirer.prompt([
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
            c.value.toLowerCase().includes(term),
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
  const answers = questions.length > 0 ? await inquirer.prompt(questions) : {};

  const modelAnswers = await promptModelSearch(provider, answers, config);

  return { ...answers, ...modelAnswers };
}

async function doSettings() {
  clear();
  header();
  console.log(s.bold("  Settings\n"));

  const config = getConfig();
  const aiStatus = await checkAIConnection();

  console.log(
    s.muted("  Provider: ") + s.text(config.aiProvider || "lmstudio"),
  );

  if (config.aiProvider === "openai") {
    console.log(s.muted("  Model: ") + s.text(config.openaiModel));
    console.log(
      s.muted("  API Key: ") +
        s.text(
          config.openaiApiKey ? "****" + config.openaiApiKey.slice(-4) : "None",
        ),
    );
  } else if (config.aiProvider === "anthropic") {
    console.log(s.muted("  Model: ") + s.text(config.anthropicModel));
    console.log(
      s.muted("  API Key: ") +
        s.text(
          config.anthropicApiKey
            ? "****" + config.anthropicApiKey.slice(-4)
            : "None",
        ),
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
            : "None",
        ),
    );
  } else if (config.aiProvider === "gemini") {
    console.log(s.muted("  Model: ") + s.text(config.geminiModel));
    console.log(
      s.muted("  API Key: ") +
        s.text(
          config.geminiApiKey ? "****" + config.geminiApiKey.slice(-4) : "None",
        ),
    );
  } else {
    console.log(s.muted("  LM Studio URL: ") + s.text(config.lmStudioUrl));
    console.log(s.muted("  Model: ") + s.text(config.model));
  }

  console.log(
    s.muted("  AI Instruction: ") +
      s.text(truncate(config.aiInstruction || "", 50)),
  );
  console.log(s.muted("  Theme: ") + s.text(config.theme || "dark"));
  console.log(
    s.muted("  AI Status: ") +
      (aiStatus.connected
        ? s.success("Connected ✓")
        : s.error(
            "Not connected ✗ (" + (aiStatus.error || "Unknown error") + ")",
          )),
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
        message: s.error(
          "Are you sure? This will delete all your API keys and settings.",
        ),
        default: false,
      },
    ]);

    if (confirmReset) {
      resetConfig();
      console.log(
        s.success("\n  ✓ Settings reset to default. Starting onboarding..."),
      );
      await sleep(1000);
      await require("./onboarding").doOnboarding();
      return;
    }
    return;
  }

  if (action === "provider") {
    const providerChoices = [
      { name: "LM Studio (Local)", value: "lmstudio" },
      { name: "OpenAI", value: "openai" },
      { name: "Anthropic (Claude)", value: "anthropic" },
      { name: "Ollama (Local)", value: "ollama" },
      { name: "OpenRouter", value: "openrouter" },
      { name: "Google Gemini", value: "gemini" },
    ];

    const { provider } = await inquirer.prompt([
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
              c.value.toLowerCase().includes(term),
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
        s.muted("\n  This provider requires configuration. Let's set it up:\n"),
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

module.exports = { doSettings, promptModelSearch };
