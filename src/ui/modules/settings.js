const inquirer = require("inquirer");
const { getConfig, saveConfig } = require("../../helpers/config");
const { checkAIConnection } = require("../../helpers/ai");
const { s, header, clear, sleep, truncate } = require("../common");

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
  } else {
    console.log(s.muted("  LM Studio URL: ") + s.text(config.lmStudioUrl));
    console.log(s.muted("  Model: ") + s.text(config.model));
  }

  console.log(s.muted("  AI Instruction: ") + s.text(truncate(config.aiInstruction || "", 50)));
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
        { name: s.muted("  ← Back"), value: "back" },
      ],
      loop: false,
    },
  ]);

  if (action === "back") return;

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
        ],
        default: config.aiProvider,
      },
    ]);
    saveConfig({ ...config, aiProvider: provider });
    console.log(s.success("\n  ✓ Provider changed to " + provider));
    await sleep(600);
    return;
  }

  if (action === "configure") {
    const provider = config.aiProvider || "lmstudio";
    let questions = [];

    if (provider === "openai") {
      questions = [
        { type: "input", name: "openaiApiKey", message: "OpenAI API Key:", default: config.openaiApiKey },
        { type: "input", name: "openaiModel", message: "Model (e.g. gpt-4o, gpt-3.5-turbo):", default: config.openaiModel }
      ];
    } else if (provider === "anthropic") {
      questions = [
        { type: "input", name: "anthropicApiKey", message: "Anthropic API Key:", default: config.anthropicApiKey },
        { type: "input", name: "anthropicModel", message: "Model (e.g. claude-3-5-sonnet-20240620):", default: config.anthropicModel }
      ];
    } else if (provider === "ollama") {
      questions = [
        { type: "input", name: "ollamaUrl", message: "Ollama URL:", default: config.ollamaUrl },
        { type: "input", name: "ollamaModel", message: "Model (e.g. llama3):", default: config.ollamaModel }
      ];
    } else {
      questions = [
        { type: "input", name: "lmStudioUrl", message: "LM Studio URL:", default: config.lmStudioUrl },
        { type: "input", name: "model", message: "Model:", default: config.model }
      ];
    }

    const answers = await inquirer.prompt(questions);
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
}

module.exports = { doSettings };
