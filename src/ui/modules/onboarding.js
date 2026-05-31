const inquirer = require("inquirer");
const autocomplete = require("inquirer-autocomplete-prompt");
const chalk = require("chalk");
const boxen = require("boxen");
const ora = require("ora");
const { saveConfig, DEFAULT_CONFIG } = require("../../helpers/config");
const { s, header, clear, sleep } = require("../common");

inquirer.registerPrompt("autocomplete", autocomplete);

/**
 * Onboarding workflow for new users
 */
async function doOnboarding() {
  clear();
  
  const welcome = boxen(
    chalk.bold.cyan("Welcome to Eckra! 🚀\n\n") +
    chalk.white("Your AI-powered Git management companion.\n") +
    chalk.gray("Let's get you set up in less than a minute."),
    { padding: 1, borderStyle: "round", borderColor: "cyan", textAlign: "center" }
  );
  
  console.log("\n" + welcome + "\n");
  
  const { start } = await inquirer.prompt([
    {
      type: "confirm",
      name: "start",
      message: "Ready to configure your AI provider?",
      default: true
    }
  ]);

  if (!start) {
    console.log(s.muted("\n  No problem! We'll use the default settings (LM Studio)."));
    saveConfig(DEFAULT_CONFIG);
    await sleep(1000);
    return;
  }

  // 1. Choose Theme
  const { theme } = await inquirer.prompt([
    {
      type: "list",
      name: "theme",
      message: "Select your preferred theme:",
      choices: [
        { name: "Auto (Detect terminal theme)", value: "auto" },
        { name: "Dark", value: "dark" },
        { name: "Light", value: "light" }
      ],
      default: "auto"
    }
  ]);

  // 2. Choose provider
  const providerChoices = [
    { name: "LM Studio (Local, no API key needed)", value: "lmstudio" },
    { name: "OpenAI (GPT-4o, etc.)", value: "openai" },
    { name: "Anthropic (Claude)", value: "anthropic" },
    { name: "Google Gemini", value: "gemini" },
    { name: "Ollama (Local)", value: "ollama" },
    { name: "OpenRouter", value: "openrouter" }
  ];

  const { provider } = await inquirer.prompt([
    {
      type: "autocomplete",
      name: "provider",
      message: "Which AI provider would you like to use? (type to search)",
      source: (_answers, input) => {
        if (!input) return providerChoices;
        const term = input.toLowerCase();
        return providerChoices.filter(
          (c) =>
            c.name.toLowerCase().includes(term) ||
            c.value.toLowerCase().includes(term),
        );
      },
    }
  ]);

  let configData = { aiProvider: provider, theme };
  let answers = {};

  if (provider === "openai") {
    answers = await inquirer.prompt([
      { type: "input", name: "openaiApiKey", message: "Enter your OpenAI API Key:", validate: v => v.length > 0 }
    ]);
  } else if (provider === "anthropic") {
    answers = await inquirer.prompt([
      { type: "input", name: "anthropicApiKey", message: "Enter your Anthropic API Key:", validate: v => v.length > 0 }
    ]);
  } else if (provider === "gemini") {
    answers = await inquirer.prompt([
      { type: "input", name: "geminiApiKey", message: "Enter your Google Gemini API Key:", validate: v => v.length > 0 }
    ]);
  } else if (provider === "ollama") {
    answers = await inquirer.prompt([
      { type: "input", name: "ollamaUrl", message: "Ollama URL:", default: "http://localhost:11434" }
    ]);
  } else if (provider === "openrouter") {
    answers = await inquirer.prompt([
      { type: "input", name: "openrouterApiKey", message: "Enter your OpenRouter API Key:", validate: v => v.length > 0 }
    ]);
  } else if (provider === "lmstudio") {
    answers = await inquirer.prompt([
      { type: "input", name: "lmStudioUrl", message: "LM Studio URL:", default: "http://localhost:1234" }
    ]);
  }

  configData = { ...configData, ...answers };

  const modelAnswers = await require("./settings").promptModelSearch(provider, answers, DEFAULT_CONFIG);
  configData = { ...configData, ...modelAnswers };

  // Save the config
  saveConfig(configData);

  clear();
  console.log(boxen(
    s.success("Configuration complete! ✓\n\n") +
    s.text("You can always change these settings in: ") + s.primary("More > Settings"),
    { padding: 1, borderStyle: "round", borderColor: "green" }
  ));
  
  await sleep(1500);
}

module.exports = { doOnboarding };
