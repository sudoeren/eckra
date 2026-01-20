#!/usr/bin/env node

const { Command } = require("commander");
const chalk = require("chalk");
const boxen = require("boxen");
const { mainMenu } = require("./ui/menu");
const { getGitStatus } = require("./helpers/git");

const program = new Command();

// ASCII Art Banner
const banner = `
  ███████╗ ██████╗██╗  ██╗██████╗  █████╗ 
  ██╔════╝██╔════╝██║ ██╔╝██╔══██╗██╔══██╗
  █████╗  ██║     █████╔╝ ██████╔╝███████║
  ██╔══╝  ██║     ██╔═██╗ ██╔══██╗██╔══██║
  ███████╗╚██████╗██║  ██╗██║  ██║██║  ██║
  ╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝
`;

async function showWelcome() {
  console.clear();
  console.log(chalk.cyan(banner));
  console.log(
    boxen(
      chalk.white("AI-Powered Git Management Tool\n") +
        chalk.gray("LM Studio entegrasyonu ile akıllı commit mesajları"),
      {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "cyan",
      },
    ),
  );
}

async function checkGitRepo() {
  try {
    await getGitStatus();
    return true;
  } catch (error) {
    console.log(
      boxen(
        chalk.red("⚠️  Bu klasör bir Git repository değil!\n\n") +
          chalk.yellow("Çözüm: ") +
          chalk.white("git init komutunu çalıştırın veya\n") +
          chalk.white("bir Git repository içinde bu komutu kullanın."),
        {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "red",
        },
      ),
    );
    return false;
  }
}

program
  .name("eckra")
  .description("AI-powered Git management CLI with LM Studio integration")
  .version("1.0.0");

program
  .command("start")
  .alias("s")
  .description("İnteraktif Git yönetim menüsünü başlat")
  .action(async () => {
    await showWelcome();
    if (await checkGitRepo()) {
      await mainMenu();
    }
  });

program
  .command("status")
  .description("Git durumunu göster")
  .action(async () => {
    const { showStatus } = require("./ui/status");
    if (await checkGitRepo()) {
      await showStatus();
    }
  });

program
  .command("commit")
  .alias("c")
  .description("AI destekli commit yap")
  .option("-m, --message <message>", "Manuel commit mesajı")
  .action(async (options) => {
    const { aiCommit } = require("./ui/commit");
    if (await checkGitRepo()) {
      await aiCommit(options.message);
    }
  });

program
  .command("push")
  .alias("p")
  .description("Değişiklikleri push et")
  .action(async () => {
    const { pushChanges } = require("./ui/push");
    if (await checkGitRepo()) {
      await pushChanges();
    }
  });

program
  .command("branch")
  .alias("b")
  .description("Branch yönetimi")
  .action(async () => {
    const { branchMenu } = require("./ui/branch");
    if (await checkGitRepo()) {
      await branchMenu();
    }
  });

program
  .command("log")
  .alias("l")
  .description("Commit geçmişini göster")
  .option("-n, --number <count>", "Gösterilecek commit sayısı", "10")
  .action(async (options) => {
    const { showLog } = require("./ui/log");
    if (await checkGitRepo()) {
      await showLog(parseInt(options.number));
    }
  });

program
  .command("config")
  .description("LM Studio ayarlarını yapılandır")
  .action(async () => {
    const { configMenu } = require("./ui/config");
    await configMenu();
  });

// Default action - show menu
program.action(async () => {
  await showWelcome();
  if (await checkGitRepo()) {
    await mainMenu();
  }
});

program.parse(process.argv);
