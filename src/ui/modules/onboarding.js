const inquirer = require("inquirer");
const chalk = require("chalk");
const boxen = require("boxen");
const { saveConfig, DEFAULT_CONFIG } = require("../../helpers/config");
const { s, header, clear, sleep } = require("../common");

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

  // Choose provider
  const { provider } = await inquirer.prompt([
    {
      type: "list",
      name: "provider",
      message: "Which AI provider would you like to use?",
      choices: [
        { name: "LM Studio (Local, no API key needed)", value: "lmstudio" },
        { name: "OpenAI (GPT-4o, etc.)", value: "openai" },
        { name: "Anthropic (Claude)", value: "anthropic" },
        { name: "Google Gemini", value: "gemini" },
        { name: "Ollama (Local)", value: "ollama" },
        { name: "OpenRouter", value: "openrouter" }
      ]
    }
  ]);

  let configData = { aiProvider: provider };

  // Setup chosen provider
  if (provider === "openai") {
    const answers = await inquirer.prompt([
      { type: "input", name: "openaiApiKey", message: "Enter your OpenAI API Key:", validate: v => v.length > 0 },
      { type: "input", name: "openaiModel", message: "Model name:", default: "gpt-4o" }
    ]);
    configData = { ...configData, ...answers };
  } else if (provider === "anthropic") {
    const answers = await inquirer.prompt([
      { type: "input", name: "anthropicApiKey", message: "Enter your Anthropic API Key:", validate: v => v.length > 0 },
      { type: "input", name: "anthropicModel", message: "Model name:", default: "claude-3-5-sonnet-20240620" }
    ]);
    configData = { ...configData, ...answers };
  } else if (provider === "gemini") {
    const answers = await inquirer.prompt([
      { type: "input", name: "geminiApiKey", message: "Enter your Google Gemini API Key:", validate: v => v.length > 0 },
      { type: "input", name: "geminiModel", message: "Model name:", default: "gemini-2.0-flash" }
    ]);
    configData = { ...configData, ...answers };
  } else if (provider === "ollama") {
    const answers = await inquirer.prompt([
      { type: "input", name: "ollamaUrl", message: "Ollama URL:", default: "http://localhost:11434" },
      { type: "input", name: "ollamaModel", message: "Model name:", default: "llama3" }
    ]);
    configData = { ...configData, ...answers };
  } else if (provider === "lmstudio") {
    const answers = await inquirer.prompt([
      { type: "input", name: "lmStudioUrl", message: "LM Studio URL:", default: "http://localhost:1234" }
    ]);
    configData = { ...configData, ...answers };
  }

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
