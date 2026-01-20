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
        chalk.cyan.bold("⚙️  Mevcut Ayarlar\n\n") +
          chalk.yellow("LM Studio URL: ") +
          chalk.white(config.lmStudioUrl) +
          "\n" +
          chalk.yellow("Model: ") +
          chalk.white(config.model) +
          "\n" +
          chalk.yellow("Dil: ") +
          chalk.white(config.language) +
          "\n" +
          chalk.yellow("Otomatik Stage: ") +
          (config.autoStage ? chalk.green("Açık") : chalk.gray("Kapalı")) +
          "\n" +
          chalk.yellow("Otomatik Push: ") +
          (config.autoPush ? chalk.green("Açık") : chalk.gray("Kapalı")) +
          "\n\n" +
          chalk.gray("Config dosyası: " + getConfigPath()) +
          "\n\n" +
          (lmStatus.connected
            ? chalk.green("✓ LM Studio bağlantısı aktif")
            : chalk.red("✗ LM Studio bağlantısı yok")),
        { padding: 1, borderStyle: "round", borderColor: "cyan" },
      ),
    );

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "Ayar işlemi:",
        choices: [
          { name: chalk.blue("🌐 LM Studio URL değiştir"), value: "url" },
          { name: chalk.blue("🤖 Model değiştir"), value: "model" },
          { name: chalk.blue("🔧 Otomatik ayarları değiştir"), value: "auto" },
          {
            name: chalk.yellow("🔍 LM Studio bağlantısını test et"),
            value: "test",
          },
          { name: chalk.red("🔄 Varsayılana sıfırla"), value: "reset" },
          new inquirer.Separator(),
          { name: chalk.gray("↩️  Geri"), value: "back" },
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
          return "URL http:// veya https:// ile başlamalı";
        }
        return true;
      },
    },
  ]);

  saveConfig({ lmStudioUrl: url });
  console.log(chalk.green("\n✓ LM Studio URL güncellendi!\n"));
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
    choices.push({ name: chalk.yellow("Manuel gir"), value: "manual" });
  } else {
    choices = [{ name: "Manuel gir", value: "manual" }];
  }

  const { model } = await inquirer.prompt([
    {
      type: "list",
      name: "model",
      message: "Model seçin:",
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
        message: "Model adı:",
        default: config.model,
      },
    ]);
    finalModel = manualModel;
  }

  saveConfig({ model: finalModel });
  console.log(chalk.green("\n✓ Model güncellendi!\n"));
}

async function changeAutoSettings() {
  const config = getConfig();

  const { settings } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "settings",
      message: "Otomatik ayarları seçin:",
      choices: [
        {
          name: "Otomatik Stage - Commit öncesi otomatik stage",
          value: "autoStage",
          checked: config.autoStage,
        },
        {
          name: "Otomatik Push - Commit sonrası otomatik push",
          value: "autoPush",
          checked: config.autoPush,
        },
        {
          name: "Commit Prefix - Conventional Commits formatı",
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

  console.log(chalk.green("\n✓ Otomatik ayarlar güncellendi!\n"));
}

async function testConnection() {
  const spinner = ora("LM Studio bağlantısı test ediliyor...").start();

  const lmStatus = await checkLMStudioConnection();

  if (lmStatus.connected) {
    spinner.succeed(chalk.green("LM Studio bağlantısı başarılı!"));

    if (lmStatus.models && lmStatus.models.length > 0) {
      console.log(chalk.cyan("\n📋 Mevcut modeller:"));
      lmStatus.models.forEach((model) => {
        console.log(chalk.gray("   • ") + chalk.white(model.id));
      });
    }
  } else {
    spinner.fail(chalk.red("LM Studio bağlantısı başarısız!"));
    console.log(chalk.yellow("\n⚠️  Hata: ") + chalk.white(lmStatus.error));
    console.log(chalk.gray("\nÇözüm önerileri:"));
    console.log(chalk.gray("  1. LM Studio'nun çalıştığından emin olun"));
    console.log(
      chalk.gray(
        "  2. Server'ın başlatıldığından emin olun (LM Studio içinde)",
      ),
    );
    console.log(
      chalk.gray("  3. Port numarasını kontrol edin (varsayılan: 1234)"),
    );
    console.log(chalk.gray("  4. Firewall ayarlarını kontrol edin"));
  }
  console.log("");
}

async function resetSettings() {
  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: "Tüm ayarlar varsayılana sıfırlansın mı?",
      default: false,
    },
  ]);

  if (confirm) {
    resetConfig();
    console.log(chalk.green("\n✓ Ayarlar varsayılana sıfırlandı!\n"));
  }
}

module.exports = {
  configMenu,
};
