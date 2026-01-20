const inquirer = require("inquirer");
const chalk = require("chalk");
const ora = require("ora");
const boxen = require("boxen");
const {
  getGitStatus,
  stageAll,
  stageFiles,
  unstageAll,
  getStagedDiff,
  pullFromRemote,
  fetchRemote,
  listStashes,
  stashChanges,
  popStash,
} = require("../helpers/git");
const { showStatus } = require("./status");
const { aiCommit } = require("./commit");
const { pushChanges } = require("./push");
const { branchMenu } = require("./branch");
const { showLog } = require("./log");
const { configMenu } = require("./config");
const { checkLMStudioConnection } = require("../helpers/lmstudio");

async function mainMenu() {
  let running = true;

  while (running) {
    const status = await getGitStatus();
    const lmStatus = await checkLMStudioConnection();

    // Status bar
    console.log("\n" + chalk.gray("─".repeat(60)));
    console.log(
      chalk.cyan("📁 Branch: ") +
        chalk.yellow(status.current) +
        chalk.gray(" | ") +
        chalk.green("✓ Staged: ") +
        chalk.white(status.staged.length) +
        chalk.gray(" | ") +
        chalk.red("● Modified: ") +
        chalk.white(status.modified.length) +
        chalk.gray(" | ") +
        chalk.blue("? Untracked: ") +
        chalk.white(status.not_added.length) +
        chalk.gray(" | ") +
        (lmStatus.connected
          ? chalk.green("🤖 AI: Online")
          : chalk.red("🤖 AI: Offline")),
    );
    console.log(chalk.gray("─".repeat(60)) + "\n");

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "Ne yapmak istiyorsunuz?",
        choices: [
          {
            name:
              chalk.green("📊 Durum Görüntüle") +
              chalk.gray(" - Git durumunu detaylı göster"),
            value: "status",
          },
          {
            name:
              chalk.yellow("➕ Dosya Ekle (Stage)") +
              chalk.gray(" - Değişiklikleri stage'e al"),
            value: "stage",
          },
          {
            name:
              chalk.magenta("➖ Stage'den Çıkar") +
              chalk.gray(" - Dosyaları unstage yap"),
            value: "unstage",
          },
          new inquirer.Separator(),
          {
            name:
              chalk.cyan("💬 AI Commit") +
              chalk.gray(" - AI ile akıllı commit mesajı oluştur"),
            value: "commit",
          },
          {
            name:
              chalk.blue("⬆️  Push") +
              chalk.gray(" - Değişiklikleri uzak repoya gönder"),
            value: "push",
          },
          {
            name:
              chalk.blue("⬇️  Pull") +
              chalk.gray(" - Uzak repodan değişiklikleri çek"),
            value: "pull",
          },
          {
            name:
              chalk.blue("🔄 Fetch") +
              chalk.gray(" - Uzak repo bilgilerini güncelle"),
            value: "fetch",
          },
          new inquirer.Separator(),
          {
            name:
              chalk.yellow("🌿 Branch Yönetimi") +
              chalk.gray(" - Branch işlemleri"),
            value: "branch",
          },
          {
            name:
              chalk.gray("📜 Commit Geçmişi") +
              chalk.gray(" - Son commitleri görüntüle"),
            value: "log",
          },
          {
            name:
              chalk.gray("📦 Stash Yönetimi") +
              chalk.gray(" - Değişiklikleri sakla/geri al"),
            value: "stash",
          },
          new inquirer.Separator(),
          {
            name:
              chalk.gray("⚙️  Ayarlar") +
              chalk.gray(" - LM Studio ve uygulama ayarları"),
            value: "config",
          },
          { name: chalk.red("🚪 Çıkış"), value: "exit" },
        ],
        pageSize: 15,
      },
    ]);

    switch (action) {
      case "status":
        await showStatus();
        break;
      case "stage":
        await stageMenu();
        break;
      case "unstage":
        await unstageMenu();
        break;
      case "commit":
        await aiCommit();
        break;
      case "push":
        await pushChanges();
        break;
      case "pull":
        await pullMenu();
        break;
      case "fetch":
        await fetchMenu();
        break;
      case "branch":
        await branchMenu();
        break;
      case "log":
        await showLog();
        break;
      case "stash":
        await stashMenu();
        break;
      case "config":
        await configMenu();
        break;
      case "exit":
        running = false;
        console.log(
          boxen(
            chalk.cyan("Güle güle! 👋\n") +
              chalk.gray("Git işlemleriniz için teşekkürler."),
            { padding: 1, borderStyle: "round", borderColor: "cyan" },
          ),
        );
        break;
    }
  }
}

async function stageMenu() {
  const status = await getGitStatus();
  const unstaged = [...status.modified, ...status.not_added, ...status.deleted];

  if (unstaged.length === 0) {
    console.log(chalk.yellow("\n⚠️  Stage edilecek değişiklik yok.\n"));
    return;
  }

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "Stage işlemi:",
      choices: [
        { name: "📁 Tüm dosyaları stage'e al", value: "all" },
        { name: "📄 Dosya seç", value: "select" },
        { name: "↩️  Geri", value: "back" },
      ],
    },
  ]);

  if (action === "back") return;

  const spinner = ora();

  if (action === "all") {
    spinner.start("Tüm dosyalar stage ediliyor...");
    await stageAll();
    spinner.succeed(chalk.green("Tüm dosyalar stage edildi!"));
  } else {
    const { files } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "files",
        message: "Stage edilecek dosyaları seçin:",
        choices: unstaged.map((file) => ({
          name: file,
          value: file,
          checked: false,
        })),
      },
    ]);

    if (files.length > 0) {
      spinner.start("Dosyalar stage ediliyor...");
      await stageFiles(files);
      spinner.succeed(chalk.green(`${files.length} dosya stage edildi!`));
    }
  }
}

async function unstageMenu() {
  const status = await getGitStatus();

  if (status.staged.length === 0) {
    console.log(chalk.yellow("\n⚠️  Stage'de dosya yok.\n"));
    return;
  }

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "Unstage işlemi:",
      choices: [
        { name: "📁 Tüm dosyaları unstage yap", value: "all" },
        { name: "📄 Dosya seç", value: "select" },
        { name: "↩️  Geri", value: "back" },
      ],
    },
  ]);

  if (action === "back") return;

  const spinner = ora();

  if (action === "all") {
    spinner.start("Tüm dosyalar unstage ediliyor...");
    await unstageAll();
    spinner.succeed(chalk.green("Tüm dosyalar unstage edildi!"));
  } else {
    const { files } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "files",
        message: "Unstage edilecek dosyaları seçin:",
        choices: status.staged.map((file) => ({
          name: file,
          value: file,
          checked: false,
        })),
      },
    ]);

    if (files.length > 0) {
      spinner.start("Dosyalar unstage ediliyor...");
      const { unstageFiles } = require("../helpers/git");
      await unstageFiles(files);
      spinner.succeed(chalk.green(`${files.length} dosya unstage edildi!`));
    }
  }
}

async function pullMenu() {
  const spinner = ora("Pull işlemi yapılıyor...").start();

  try {
    const result = await pullFromRemote();
    spinner.succeed(chalk.green("Pull başarılı!"));

    if (result.summary) {
      console.log(
        chalk.gray(
          `  Değişiklikler: ${result.summary.changes} dosya, +${result.summary.insertions} -${result.summary.deletions}`,
        ),
      );
    }
  } catch (error) {
    spinner.fail(chalk.red("Pull başarısız: " + error.message));
  }
}

async function fetchMenu() {
  const spinner = ora("Fetch işlemi yapılıyor...").start();

  try {
    await fetchRemote();
    spinner.succeed(chalk.green("Fetch başarılı!"));
  } catch (error) {
    spinner.fail(chalk.red("Fetch başarısız: " + error.message));
  }
}

async function stashMenu() {
  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "Stash işlemi:",
      choices: [
        { name: "📦 Değişiklikleri stash'e al", value: "save" },
        { name: "📤 Son stash'i geri al", value: "pop" },
        { name: "📋 Stash listesi", value: "list" },
        { name: "↩️  Geri", value: "back" },
      ],
    },
  ]);

  if (action === "back") return;

  const spinner = ora();

  if (action === "save") {
    const { message } = await inquirer.prompt([
      {
        type: "input",
        name: "message",
        message: "Stash mesajı (opsiyonel):",
        default: "",
      },
    ]);

    spinner.start("Değişiklikler stash ediliyor...");
    try {
      await stashChanges(message || null);
      spinner.succeed(chalk.green("Değişiklikler stash edildi!"));
    } catch (error) {
      spinner.fail(chalk.red("Stash başarısız: " + error.message));
    }
  } else if (action === "pop") {
    spinner.start("Stash geri alınıyor...");
    try {
      await popStash();
      spinner.succeed(chalk.green("Stash geri alındı!"));
    } catch (error) {
      spinner.fail(chalk.red("Stash pop başarısız: " + error.message));
    }
  } else if (action === "list") {
    try {
      const stashes = await listStashes();
      if (stashes.all.length === 0) {
        console.log(chalk.yellow("\n⚠️  Stash listesi boş.\n"));
      } else {
        console.log(chalk.cyan("\n📦 Stash Listesi:"));
        stashes.all.forEach((stash, index) => {
          console.log(chalk.gray(`  ${index}: `) + chalk.white(stash.message));
        });
        console.log("");
      }
    } catch (error) {
      console.log(chalk.red("Stash listesi alınamadı: " + error.message));
    }
  }
}

module.exports = {
  mainMenu,
};
