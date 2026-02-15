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
    console.log(chalk.red("\n  ⚠️  This folder is not a Git repository!\n"));
    console.log(chalk.gray("  Solution: Run git init command\n"));
    return false;
  }
}

program
  .name("eckra")
  .description("AI-powered Git management CLI")
  .version("1.0.5");

program
  .command("start")
  .alias("s")
  .description("Start interactive interface")
  .action(async () => {
    if (await checkGitRepo()) {
      await startApp();
    }
  });

program
  .command("status")
  .description("Show Git status")
  .action(async () => {
    if (await checkGitRepo()) {
      await quickStatus();
    }
  });

program
  .command("commit")
  .alias("c")
  .description("AI-powered commit")
  .option("-m, --message <message>", "Manual commit message")
  .action(async (options) => {
    if (await checkGitRepo()) {
      await quickCommit(options.message);
    }
  });

program
  .command("push")
  .alias("p")
  .description("Push operation")
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
