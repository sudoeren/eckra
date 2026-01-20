#!/usr/bin/env node

const { Command } = require("commander");
const { startApp, quickStatus, quickCommit, quickPush } = require("./ui/app");
const { getGitStatus } = require("./helpers/git");
const chalk = require("chalk");

const program = new Command();

async function checkGitRepo() {
  try {
    await getGitStatus();
    return true;
  } catch (error) {
    console.log(chalk.red("\n  ⚠️  Bu klasör bir Git repository değil!\n"));
    console.log(chalk.gray("  Çözüm: git init komutunu çalıştırın\n"));
    return false;
  }
}

program
  .name("eckra")
  .description("AI-powered Git management CLI")
  .version("1.0.0");

program
  .command("start")
  .alias("s")
  .description("İnteraktif arayüzü başlat")
  .action(async () => {
    if (await checkGitRepo()) {
      await startApp();
    }
  });

program
  .command("status")
  .description("Git durumunu göster")
  .action(async () => {
    if (await checkGitRepo()) {
      await quickStatus();
    }
  });

program
  .command("commit")
  .alias("c")
  .description("AI destekli commit")
  .option("-m, --message <message>", "Manuel commit mesajı")
  .action(async (options) => {
    if (await checkGitRepo()) {
      await quickCommit(options.message);
    }
  });

program
  .command("push")
  .alias("p")
  .description("Push işlemi")
  .action(async () => {
    if (await checkGitRepo()) {
      await quickPush();
    }
  });

// Default - start interactive
program.action(async () => {
  if (await checkGitRepo()) {
    await startApp();
  }
});

program.parse(process.argv);
