const autocomplete = require("inquirer-autocomplete-prompt");
const inquirer = require("inquirer");
const boxen = require("boxen");
const { saveConfig, DEFAULT_CONFIG } = require("../../helpers/config");
const { s, clear, sleep } = require("../common");
const { prompt } = require("../screen");

inquirer.registerPrompt("autocomplete", autocomplete);

/**
 * Onboarding workflow for new users
 */
async function doOnboarding() {
  clear();

  const welcome = boxen(
    s.brand("Welcome to Eckra! 🚀\n\n") +
      s.text("Your AI-powered Git management companion.\n") +
      s.muted("Let's get you set up in less than a minute."),
    {
      padding: 1,
      borderStyle: "round",
      borderColor: "cyan",
      textAlign: "center",
    }
  );

  console.log("\n" + welcome + "\n");

  // Choose provider
  const providerChoices = [
    { name: "Ollama (Local, no API key needed)", value: "ollama" },
    { name: "Ollama Cloud", value: "ollamacloud" },
    { name: "LM Studio (Local, no API key needed)", value: "lmstudio" },
    { name: "OpenAI (GPT-4o, etc.)", value: "openai" },
    { name: "Anthropic (Claude)", value: "anthropic" },
    { name: "Google Gemini", value: "gemini" },
    { name: "OpenRouter", value: "openrouter" },
    { name: "OpenCode Go", value: "opencodego" },
    { name: "DeepSeek", value: "deepseek" },
    { name: "Amazon Bedrock", value: "bedrock" },
    { name: "Amazon Bedrock Mantle", value: "bedrockmantle" },
  ];

  const { provider } = await prompt([
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
            c.value.toLowerCase().includes(term)
        );
      },
    },
  ]);

  let configData = { aiProvider: provider, theme: "auto" };
  let answers = {};

  if (provider === "openai") {
    answers = await prompt([
      {
        type: "input",
        name: "openaiApiKey",
        message: "Enter your OpenAI API Key:",
        validate: (v) => v.length > 0,
      },
    ]);
  } else if (provider === "anthropic") {
    answers = await prompt([
      {
        type: "input",
        name: "anthropicApiKey",
        message: "Enter your Anthropic API Key:",
        validate: (v) => v.length > 0,
      },
    ]);
  } else if (provider === "gemini") {
    answers = await prompt([
      {
        type: "input",
        name: "geminiApiKey",
        message: "Enter your Google Gemini API Key:",
        validate: (v) => v.length > 0,
      },
    ]);
  } else if (provider === "ollama") {
    answers = await prompt([
      {
        type: "input",
        name: "ollamaUrl",
        message: "Ollama URL:",
        default: "http://localhost:11434",
      },
    ]);
  } else if (provider === "openrouter") {
    answers = await prompt([
      {
        type: "input",
        name: "openrouterApiKey",
        message: "Enter your OpenRouter API Key:",
        validate: (v) => v.length > 0,
      },
    ]);
  } else if (provider === "lmstudio") {
    answers = await prompt([
      {
        type: "input",
        name: "lmStudioUrl",
        message: "LM Studio URL:",
        default: "http://localhost:1234",
      },
    ]);
  } else if (provider === "opencodego") {
    answers = await prompt([
      {
        type: "input",
        name: "opencodeGoApiKey",
        message: "Enter your OpenCode Go API Key:",
        validate: (v) => v.length > 0,
      },
    ]);
  } else if (provider === "deepseek") {
    answers = await prompt([
      {
        type: "input",
        name: "deepseekApiKey",
        message: "Enter your DeepSeek API Key:",
        validate: (v) => v.length > 0,
      },
    ]);
  } else if (provider === "bedrock") {
    answers = await prompt([
      {
        type: "input",
        name: "bedrockApiKey",
        message: "Enter your Amazon Bedrock API Key:",
        validate: (v) => v.length > 0,
      },
      {
        type: "input",
        name: "bedrockRegion",
        message: "AWS Region:",
        default: "us-east-1",
      },
    ]);
  } else if (provider === "bedrockmantle") {
    answers = await prompt([
      {
        type: "input",
        name: "bedrockMantleApiKey",
        message: "Enter your Amazon Bedrock Mantle API Key:",
        validate: (v) => v.length > 0,
      },
      {
        type: "input",
        name: "bedrockMantleRegion",
        message: "AWS Region:",
        default: "us-east-1",
      },
    ]);
  } else if (provider === "ollamacloud") {
    answers = await prompt([
      {
        type: "input",
        name: "ollamaCloudApiKey",
        message: "Enter your Ollama Cloud API Key:",
        validate: (v) => v.length > 0,
      },
    ]);
  }

  configData = { ...configData, ...answers };

  const modelAnswers = await require("./settings").promptModelSearch(
    provider,
    answers,
    DEFAULT_CONFIG
  );
  configData = { ...configData, ...modelAnswers, onboarded: true };

  // Save the config
  saveConfig(configData);

  clear();
  console.log(
    boxen(
      s.success("Configuration complete! ✓\n\n") +
        s.text("You can always change these settings in: ") +
        s.primary("More > Settings"),
      { padding: 1, borderStyle: "round", borderColor: "green" }
    )
  );

  await sleep(1500);
}

module.exports = { doOnboarding };
