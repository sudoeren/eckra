const inquirer = require("inquirer");
const { getConfig, saveConfig } = require("../../helpers/config");
const { checkLMStudioConnection } = require("../../helpers/lmstudio");
const { s, header, clear, sleep, truncate } = require("../common");

async function doSettings() {
  clear();
  header();
  console.log(s.bold("  Settings\n"));

  const config = getConfig();
  const lm = await checkLMStudioConnection();

  console.log(s.muted("  LM Studio URL: ") + s.text(config.lmStudioUrl));
  console.log(s.muted("  Model: ") + s.text(config.model));
  console.log(s.muted("  AI Instruction: ") + s.text(truncate(config.aiInstruction || "", 50)));
  console.log(
    s.muted("  AI Status: ") +
    (lm.connected ? s.success("Connected ✓") : s.error("Not connected ✗")),
  );
  console.log();

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("What should I do?"),
      choices: [
        { name: s.text("  Change URL"), value: "url" },
        { name: s.text("  Change Model"), value: "model" },
        { name: s.text("  Change AI Instructions"), value: "instruction" },
        { name: s.muted("  ← Back"), value: "back" },
      ],
    },
  ]);

  if (action === "back") return;

  if (action === "url") {
    const { url } = await inquirer.prompt([
      {
        type: "input",
        name: "url",
        message: s.muted("New URL:"),
        default: config.lmStudioUrl,
      },
    ]);
    saveConfig({ ...config, lmStudioUrl: url });
    console.log(s.success("\n  ✓ Saved!"));
    await sleep(600);
  }

  if (action === "model") {
    const { model } = await inquirer.prompt([
      {
        type: "input",
        name: "model",
        message: s.muted("Model name:"),
        default: config.model,
      },
    ]);
    saveConfig({ ...config, model });
    console.log(s.success("\n  ✓ Saved!"));
    await sleep(600);
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
