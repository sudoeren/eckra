const inquirer = require("inquirer");
const chalk = require("chalk");
const ora = require("ora");
const boxen = require("boxen");
const {
  getConfig,
  saveConfig,
  resetConfig,
  getConfigPath,
  DEFAULT_CONFIG,
} = require("../helpers/config");
const { testProviderConnection, checkAIConnection, fetchOpenRouterModels } = require("../helpers/ai");

const PROVIDER_NAMES = {
  lmstudio: "LM Studio",
  openai: "OpenAI",
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
  gemini: "Google Gemini",
  ollama: "Ollama",
};

const PROVIDER_LIST = Object.keys(PROVIDER_NAMES);

function truncate(str, len = 40) {
  if (!str) return "";
  return str.length > len ? str.substring(0, len - 3) + "..." : str;
}

function maskKey(key) {
  if (!key || key.length < 8) return key ? key.substring(0, 4) + "****" : "";
  return key.substring(0, 4) + "****" + key.substring(key.length - 4);
}

async function configMenu() {
  let running = true;

  while (running) {
    const config = getConfig();
    const aiStatus = await checkAIConnection();
    const provider = config.aiProvider || "lmstudio";
    const connText = aiStatus.connected
      ? chalk.green("\u2713 " + PROVIDER_NAMES[provider] + " connected")
      : chalk.red("\u2717 " + PROVIDER_NAMES[provider] + " not connected");

    let settingsText =
      chalk.cyan.bold("Settings\n\n") +
      chalk.yellow("AI Provider:      ") + chalk.white(PROVIDER_NAMES[provider]) + "\n" +
      chalk.yellow("Model:            ") + chalk.white(config.model) + "\n" +
      chalk.yellow("Language:         ") + chalk.white(config.language) + "\n" +
      chalk.yellow("Auto Stage:       ") + (config.autoStage ? chalk.green("On") : chalk.gray("Off")) + "\n" +
      chalk.yellow("Auto Push:        ") + (config.autoPush ? chalk.green("On") : chalk.gray("Off")) + "\n" +
      chalk.yellow("AI Instruction:   ") + chalk.white(truncate(config.aiInstruction || "Default")) + "\n\n";

    if (provider === "lmstudio") {
      settingsText += chalk.yellow("LM Studio URL:    ") + chalk.white(config.lmStudioUrl) + "\n";
    } else if (provider === "openai") {
      settingsText += chalk.yellow("OpenAI Model:     ") + chalk.white(config.openaiModel) + "\n";
      settingsText += chalk.yellow("OpenAI Key:       ") + chalk.white(maskKey(config.openaiApiKey)) + "\n";
    } else if (provider === "anthropic") {
      settingsText += chalk.yellow("Anthropic Model:  ") + chalk.white(config.anthropicModel) + "\n";
      settingsText += chalk.yellow("Anthropic Key:    ") + chalk.white(maskKey(config.anthropicApiKey)) + "\n";
    } else if (provider === "openrouter") {
      settingsText += chalk.yellow("OpenRouter Model: ") + chalk.white(config.openrouterModel) + "\n";
      settingsText += chalk.yellow("OpenRouter Key:   ") + chalk.white(maskKey(config.openrouterApiKey)) + "\n";
    } else if (provider === "gemini") {
      settingsText += chalk.yellow("Gemini Model:     ") + chalk.white(config.geminiModel) + "\n";
      settingsText += chalk.yellow("Gemini Key:       ") + chalk.white(maskKey(config.geminiApiKey)) + "\n";
    } else if (provider === "ollama") {
      settingsText += chalk.yellow("Ollama URL:       ") + chalk.white(config.ollamaUrl) + "\n";
      settingsText += chalk.yellow("Ollama Model:     ") + chalk.white(config.ollamaModel) + "\n";
    }

    settingsText += "\n" + chalk.gray("Config file: " + getConfigPath()) + "\n\n" + connText;

    console.log(
      boxen(settingsText, { padding: 1, borderStyle: "round", borderColor: "cyan" }),
    );

    const choices = [
      { name: chalk.blue("\ud83c\udf10 Change AI provider"), value: "provider" },
      { name: chalk.blue("\ud83e\udd16 Change model"), value: "model" },
      { name: chalk.blue("\ud83d\udd11 Change API key"), value: "apikey" },
      { name: chalk.blue("\ud83d\udd17 Change server URL"), value: "serverurl" },
      { name: chalk.blue("\ud83d\udcdd Change AI instruction"), value: "instruction" },
      { name: chalk.blue("\ud83d\udd27 Change auto settings"), value: "auto" },
      { name: chalk.yellow("\ud83d\udd0d Test connection"), value: "test" },
      { name: chalk.red("\ud83d\udd04 Reset to defaults"), value: "reset" },
      new inquirer.Separator(),
      { name: chalk.gray("\u21a9\ufe0f  Back"), value: "back" },
    ];

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "Settings operation:",
        choices,
      },
    ]);

    switch (action) {
      case "provider":
        await changeProvider();
        break;
      case "model":
        await changeModel();
        break;
      case "apikey":
        await changeApiKey();
        break;
      case "serverurl":
        await changeServerUrl();
        break;
      case "instruction":
        await changeInstruction();
        break;
      case "auto":
        await changeAutoSettings();
        break;
      case "test":
        await testConnection();
        break;
      case "reset":
        await resetSettings();
        break;
      case "back":
        running = false;
        break;
    }
  }
}

async function changeProvider() {
  const config = getConfig();
  const { provider } = await inquirer.prompt([
    {
      type: "list",
      name: "provider",
      message: "Select AI provider:",
      choices: PROVIDER_LIST.map((p) => ({
        name: PROVIDER_NAMES[p],
        value: p,
      })),
      default: config.aiProvider || "lmstudio",
    },
  ]);
  saveConfig({ aiProvider: provider });
  console.log(chalk.green("\n\u2713 AI provider updated to " + PROVIDER_NAMES[provider] + "!\n"));
}

async function changeModel() {
  const config = getConfig();
  const provider = config.aiProvider || "lmstudio";

  if (provider === "lmstudio") {
    const aiStatus = await checkAIConnection();
    let choices = [];
    if (aiStatus.connected && aiStatus.models && aiStatus.models.length > 0) {
      choices = aiStatus.models.map((m) => ({ name: m.id, value: m.id }));
      choices.push(new inquirer.Separator());
    }
    choices.push({ name: chalk.yellow("Enter manually"), value: "manual" });

    const { model } = await inquirer.prompt([
      {
        type: "list",
        name: "model",
        message: "Select model:",
        choices,
        default: config.model,
      },
    ]);

    let finalModel = model;
    if (model === "manual") {
      const { manualModel } = await inquirer.prompt([
        {
          type: "input",
          name: "manualModel",
          message: "Model name:",
          default: config.model,
        },
      ]);
      finalModel = manualModel;
    }
    saveConfig({ model: finalModel });
    console.log(chalk.green("\n\u2713 Model updated!\n"));
  } else if (provider === "openai") {
    const { model } = await inquirer.prompt([
      {
        type: "input",
        name: "model",
        message: "OpenAI model (e.g. gpt-4o, gpt-4o-mini):",
        default: config.openaiModel,
      },
    ]);
    saveConfig({ openaiModel: model });
    console.log(chalk.green("\n\u2713 OpenAI model updated!\n"));
  } else if (provider === "anthropic") {
    const { model } = await inquirer.prompt([
      {
        type: "input",
        name: "model",
        message: "Anthropic model (e.g. claude-3-5-sonnet-20240620):",
        default: config.anthropicModel,
      },
    ]);
    saveConfig({ anthropicModel: model });
    console.log(chalk.green("\n\u2713 Anthropic model updated!\n"));
  } else if (provider === "openrouter") {
    const apiKey = config.openrouterApiKey;
    let choices = [];
    if (apiKey) {
      const models = await fetchOpenRouterModels(apiKey);
      if (models.length > 0) {
        choices = models.map((m) => ({ name: m.name + " (" + m.id + ")", value: m.id }));
        choices.push(new inquirer.Separator());
      }
    }
    choices.push({ name: chalk.yellow("Enter manually"), value: "manual" });

    const { model } = await inquirer.prompt([
      {
        type: "list",
        name: "model",
        message: "Select model:",
        choices,
        default: config.openrouterModel,
      },
    ]);

    let finalModel = model;
    if (model === "manual") {
      const { manualModel } = await inquirer.prompt([
        {
          type: "input",
          name: "manualModel",
          message: "Model identifier:",
          default: config.openrouterModel,
        },
      ]);
      finalModel = manualModel;
    }
    saveConfig({ openrouterModel: finalModel });
    console.log(chalk.green("\n\u2713 OpenRouter model updated!\n"));
  } else if (provider === "gemini") {
    const { model } = await inquirer.prompt([
      {
        type: "input",
        name: "model",
        message: "Gemini model (e.g. gemini-2.0-flash):",
        default: config.geminiModel,
      },
    ]);
    saveConfig({ geminiModel: model });
    console.log(chalk.green("\n\u2713 Gemini model updated!\n"));
  } else if (provider === "ollama") {
    const aiStatus = await checkAIConnection();
    let choices = [];
    if (aiStatus.connected && aiStatus.models && aiStatus.models.length > 0) {
      choices = aiStatus.models.map((m) => ({ name: m.name, value: m.name }));
      choices.push(new inquirer.Separator());
    }
    choices.push({ name: chalk.yellow("Enter manually"), value: "manual" });

    const { model } = await inquirer.prompt([
      {
        type: "list",
        name: "model",
        message: "Select model:",
        choices,
        default: config.ollamaModel,
      },
    ]);

    let finalModel = model;
    if (model === "manual") {
      const { manualModel } = await inquirer.prompt([
        {
          type: "input",
          name: "manualModel",
          message: "Model name:",
          default: config.ollamaModel,
        },
      ]);
      finalModel = manualModel;
    }
    saveConfig({ ollamaModel: finalModel });
    console.log(chalk.green("\n\u2713 Ollama model updated!\n"));
  }
}

async function changeApiKey() {
  const config = getConfig();
  const provider = config.aiProvider || "lmstudio";

  if (provider === "lmstudio") {
    console.log(chalk.yellow("\n LM Studio does not require an API key.\n"));
    return;
  }

  const keyMap = {
    openai: { key: "openaiApiKey", label: "OpenAI API Key" },
    anthropic: { key: "anthropicApiKey", label: "Anthropic API Key" },
    openrouter: { key: "openrouterApiKey", label: "OpenRouter API Key" },
    gemini: { key: "geminiApiKey", label: "Google Gemini API Key" },
  };

  const entry = keyMap[provider];
  if (!entry) {
    console.log(chalk.yellow("\n This provider does not use an API key.\n"));
    return;
  }

  const { apiKey } = await inquirer.prompt([
    {
      type: "password",
      name: "apiKey",
      message: entry.label + ":",
      default: config[entry.key] || "",
      mask: "*",
    },
  ]);

  saveConfig({ [entry.key]: apiKey });
  console.log(chalk.green("\n\u2713 " + entry.label + " updated!\n"));
}

async function changeServerUrl() {
  const config = getConfig();
  const provider = config.aiProvider || "lmstudio";

  const urlMap = {
    lmstudio: { key: "lmStudioUrl", label: "LM Studio URL", default: "http://localhost:1234" },
    ollama: { key: "ollamaUrl", label: "Ollama URL", default: "http://localhost:11434" },
  };

  const entry = urlMap[provider];
  if (!entry) {
    console.log(chalk.yellow("\n This provider does not use a local server URL.\n"));
    return;
  }

  const { url } = await inquirer.prompt([
    {
      type: "input",
      name: "url",
      message: entry.label + ":",
      default: config[entry.key] || entry.default,
      validate: (input) => {
        if (!input.startsWith("http://") && !input.startsWith("https://")) {
          return "URL must start with http:// or https://";
        }
        return true;
      },
    },
  ]);

  saveConfig({ [entry.key]: url });
  console.log(chalk.green("\n\u2713 " + entry.label + " updated!\n"));
}

async function changeInstruction() {
  const config = getConfig();

  const { instruction } = await inquirer.prompt([
    {
      type: "input",
      name: "instruction",
      message: "Default AI Instruction (e.g., 'Use Turkish language'):",
      default: config.aiInstruction,
    },
  ]);

  saveConfig({ aiInstruction: instruction });
  console.log(chalk.green("\n\u2713 AI instruction updated!\n"));
}

async function changeAutoSettings() {
  const config = getConfig();

  const { settings } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "settings",
      message: "Select auto settings:",
      choices: [
        {
          name: "Auto Stage - Auto stage before commit",
          value: "autoStage",
          checked: config.autoStage,
        },
        {
          name: "Auto Push - Auto push after commit",
          value: "autoPush",
          checked: config.autoPush,
        },
        {
          name: "Commit Prefix - Conventional Commits format",
          value: "commitPrefix",
          checked: config.commitPrefix,
        },
      ],
    },
  ]);

  saveConfig({
    autoStage: settings.includes("autoStage"),
    autoPush: settings.includes("autoPush"),
    commitPrefix: settings.includes("commitPrefix"),
  });

  console.log(chalk.green("\n\u2713 Auto settings updated!\n"));
}

async function testConnection() {
  const config = getConfig();
  const provider = config.aiProvider || "lmstudio";
  const label = PROVIDER_NAMES[provider];

  const spinner = ora("Testing " + label + " connection...").start();

  const result = await testProviderConnection(provider, config);

  if (result.connected) {
    spinner.succeed(chalk.green(label + " connection successful!"));
  } else {
    spinner.fail(chalk.red(label + " connection failed!"));
    console.log(chalk.yellow("\n\u26a0\ufe0f  Error: ") + chalk.white(result.error));

    const tips = {
      lmstudio: [
        "Make sure LM Studio is running",
        "Start the server inside LM Studio",
        "Check the port number (default: 1234)",
        "Check firewall settings",
      ],
      ollama: [
        "Make sure Ollama is running",
        "Check the port number (default: 11434)",
      ],
      openai: ["Verify your API key is correct", "Check your OpenAI account balance"],
      anthropic: ["Verify your API key is correct"],
      openrouter: ["Verify your API key is correct"],
      gemini: ["Verify your API key is correct"],
    };

    const providerTips = tips[provider] || [];
    if (providerTips.length > 0) {
      console.log(chalk.gray("\nSuggested solutions:"));
      providerTips.forEach((tip, i) => {
        console.log(chalk.gray("  " + (i + 1) + ". " + tip));
      });
    }
  }
  console.log("");
}

async function resetSettings() {
  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: "Reset all settings to defaults?",
      default: false,
    },
  ]);

  if (confirm) {
    resetConfig();
    console.log(chalk.green("\n\u2713 Settings reset to defaults!\n"));
  }
}

module.exports = {
  configMenu,
};
