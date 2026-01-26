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
const { checkLMStudioConnection } = require("../helpers/lmstudio");

async function configMenu() {
  let running = true;

  while (running) {
    const config = getConfig();
    const lmStatus = await checkLMStudioConnection();

    // Show current config
    console.log(
      boxen(
        chalk.cyan.bold("⚙️  Current Settings\n\n") +
        chalk.yellow("LM Studio URL: ") +
        chalk.white(config.lmStudioUrl) +
        "\n" +
        chalk.yellow("Model: ") +
        chalk.white(config.model) +
        "\n" +
        chalk.yellow("AI Instruction: ") +
        chalk.white(config.aiInstruction ? (config.aiInstruction.length > 50 ? config.aiInstruction.substring(0, 47) + "..." : config.aiInstruction) : "Default") +
        "\n" +
        chalk.yellow("Language: ") +
        chalk.white(config.language) +
        "\n" +
        chalk.yellow("Auto Stage: ") +
        (config.autoStage ? chalk.green("On") : chalk.gray("Off")) +
        "\n" +
        chalk.yellow("Auto Push: ") +
        (config.autoPush ? chalk.green("On") : chalk.gray("Off")) +
        "\n\n" +
        chalk.gray("Config file: " + getConfigPath()) +
        "\n\n" +
        (lmStatus.connected
          ? chalk.green("✓ LM Studio connection active")
          : chalk.red("✗ No LM Studio connection")),
        { padding: 1, borderStyle: "round", borderColor: "cyan" },
      ),
    );

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "Settings operation:",
        choices: [
          { name: chalk.blue("🌐 Change LM Studio URL"), value: "url" },
          { name: chalk.blue("🤖 Change model"), value: "model" },
          { name: chalk.blue("📝 Change AI instruction"), value: "instruction" },
          { name: chalk.blue("🔧 Change auto settings"), value: "auto" },
          {
            name: chalk.yellow("🔍 Test LM Studio connection"),
            value: "test",
          },
          { name: chalk.red("🔄 Reset to defaults"), value: "reset" },
          new inquirer.Separator(),
          { name: chalk.gray("↩️  Back"), value: "back" },
        ],
      },
    ]);

    switch (action) {
      case "url":
        await changeUrl();
        break;
      case "model":
        await changeModel();
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

async function changeUrl() {
  const config = getConfig();

  const { url } = await inquirer.prompt([
    {
      type: "input",
      name: "url",
      message: "LM Studio URL:",
      default: config.lmStudioUrl,
      validate: (input) => {
        if (!input.startsWith("http://") && !input.startsWith("https://")) {
          return "URL must start with http:// or https://";
        }
        return true;
      },
    },
  ]);

  saveConfig({ lmStudioUrl: url });
  console.log(chalk.green("\n✓ LM Studio URL updated!\n"));
}

async function changeModel() {
  const config = getConfig();
  const lmStatus = await checkLMStudioConnection();

  let choices = [];

  if (lmStatus.connected && lmStatus.models && lmStatus.models.length > 0) {
    choices = lmStatus.models.map((m) => ({
      name: m.id,
      value: m.id,
    }));
    choices.push(new inquirer.Separator());
    choices.push({ name: chalk.yellow("Enter manually"), value: "manual" });
  } else {
    choices = [{ name: "Enter manually", value: "manual" }];
  }

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
  console.log(chalk.green("\n✓ Model updated!\n"));
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
  console.log(chalk.green("\n✓ AI instruction updated!\n"));
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

  console.log(chalk.green("\n✓ Auto settings updated!\n"));
}

async function testConnection() {
  const spinner = ora("Testing LM Studio connection...").start();

  const lmStatus = await checkLMStudioConnection();

  if (lmStatus.connected) {
    spinner.succeed(chalk.green("LM Studio connection successful!"));

    if (lmStatus.models && lmStatus.models.length > 0) {
      console.log(chalk.cyan("\n📋 Available models:"));
      lmStatus.models.forEach((model) => {
        console.log(chalk.gray("   • ") + chalk.white(model.id));
      });
    }
  } else {
    spinner.fail(chalk.red("LM Studio connection failed!"));
    console.log(chalk.yellow("\n⚠️  Error: ") + chalk.white(lmStatus.error));
    console.log(chalk.gray("\nSuggested solutions:"));
    console.log(chalk.gray("  1. Make sure LM Studio is running"));
    console.log(
      chalk.gray(
        "  2. Make sure the server is started (inside LM Studio)",
      ),
    );
    console.log(
      chalk.gray("  3. Check the port number (default: 1234)"),
    );
    console.log(chalk.gray("  4. Check firewall settings"));
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
    console.log(chalk.green("\n✓ Settings reset to defaults!\n"));
  }
}

module.exports = {
  configMenu,
};
