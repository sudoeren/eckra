#!/usr/bin/env node

const { Command } = require("commander");
const { getGitStatus } = require("./helpers/git");
const { version } = require("../package.json");
const { s } = require("./ui/common");

// Lazy load app functions
const app = () => require("./ui/app");

const program = new Command();

async function checkGitRepo() {
  try {
    await getGitStatus();
    return true;
  } catch {
    console.log(s.error("\n  ⚠️  This folder is not a Git repository!\n"));
    console.log(s.muted("  Solution: Run git init command\n"));
    return false;
  }
}

program
  .name("eckra")
  .description("AI-powered Git management CLI")
  .version(version, "-v, --version");

program
  .command("easy")
  .alias("e")
  .description("Full workflow: Stage all, AI commit, and Push")
  .action(async () => {
    if (await checkGitRepo()) {
      await app().easyWorkflow();
    }
  });

program
  .command("start")
  .alias("s")
  .description("Start interactive interface")
  .action(async () => {
    if (await checkGitRepo()) {
      await app().startApp();
    }
  });

program
  .command("status")
  .alias("st")
  .description("Show Git status")
  .action(async () => {
    if (await checkGitRepo()) {
      await app().quickStatus();
    }
  });

program
  .command("commit")
  .alias("c")
  .description("AI-powered commit")
  .option("-m, --message <message>", "Manual commit message")
  .action(async (options) => {
    if (await checkGitRepo()) {
      await app().quickCommit(options.message);
    }
  });

program
  .command("push")
  .alias("p")
  .description("Push operation")
  .action(async () => {
    if (await checkGitRepo()) {
      await app().quickPush();
    }
  });

program
  .command("story")
  .alias("t")
  .description("AI-generated project story from commit history")
  .option("-n, --count <number>", "Number of commits to analyze (default: 50)")
  .action(async (options) => {
    if (await checkGitRepo()) {
      await app().quickTimeline(options.count);
    }
  });

// Default - start interactive
program.action(async () => {
  if (await checkGitRepo()) {
    await app().startApp();
  }
});

program.parse(process.argv);
