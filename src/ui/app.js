const chalk = require("chalk");
const inquirer = require("inquirer");
const ora = require("ora");
const fs = require("fs");
const path = require("path");

const {
  getGitStatus,
  stageAll,
  createCommit,
} = require("../helpers/git");

const {
  s,
  icons,
  clear,
  sleep,
  cols,
  rows,
  truncate,
  timeAgo,
  box,
  header,
  pause
} = require("./common");

const { doStatus, getStatusInfo, statusLine } = require("./modules/status");
const { doStage } = require("./modules/stage");
const { doCommit } = require("./modules/commit");
const { doPush, doPull } = require("./modules/sync");
const { doMore } = require("./modules/more");
const { doConflict } = require("./modules/conflict");
const { doBranch } = require("./modules/branch");
const { doLog } = require("./modules/log");

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════

async function startApp() {
  let running = true;

  while (running) {
    clear();
    header();

    const info = await getStatusInfo();
    console.log(statusLine(info));

    if (!info) {
      console.log(s.muted("  You are not in a Git repository."));
      console.log(
        s.muted("  Navigate to a git project or run 'git init'.\n"),
      );
      await inquirer.prompt([
        { type: "input", name: "x", message: s.muted("Press Enter...") },
      ]);
      return;
    }

    // Smart menu - options based on current state
    const choices = [];

    // Conflict priority
    if (info.conflicts > 0) {
      choices.push({ name: s.error("  ⚠ Resolve Conflict"), value: "conflict" });
      choices.push({
        type: "separator",
        line: s.dim("  ─────────────────────"),
      });
    }

    // Main actions
    if (info.modified > 0 || info.untracked > 0) {
      choices.push({
        name:
          `  ${s.success("+ ")} Stage` +
          s.muted(` (${info.modified + info.untracked} files)`),
        value: "stage",
      });
    }

    if (info.staged > 0 || info.modified > 0 || info.untracked > 0) {
      choices.push({
        name:
          `  ${s.primary("◆")} Commit` +
          (info.staged > 0 ? s.muted(` (${info.staged} staged)`) : ""),
        value: "commit",
      });
    }

    choices.push({ name: `  ${s.primary("↑")} Push`, value: "push" });
    choices.push({ name: `  ${s.primary("↓")} Pull`, value: "pull" });

    choices.push({ type: "separator", line: s.dim("  ─────────────────────") });

    choices.push({ name: `  ${s.text("◎")} Status`, value: "status" });
    choices.push({ name: `  ${s.text("⎇")} Branch`, value: "branch" });
    choices.push({ name: `  ${s.text("◷")} Log`, value: "log" });
    choices.push({ name: `  ${s.text("⋯")} More`, value: "more" });

    choices.push({ type: "separator", line: s.dim("  ─────────────────────") });
    choices.push({ name: s.muted("  ✕ Exit"), value: "exit" });

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: s.muted("What would you like to do?"),
        choices,
        pageSize: 15,
        loop: false,
      },
    ]);

    switch (action) {
      case "stage":
        await doStage(info);
        break;
      case "commit":
        await doCommit(info);
        break;
      case "push":
        await doPush();
        break;
      case "pull":
        await doPull();
        break;
      case "status":
        await doStatus();
        break;
      case "branch":
        await doBranch();
        break;
      case "log":
        await doLog();
        break;
      case "more":
        await doMore();
        break;
      case "conflict":
        await doConflict();
        break;
      case "exit":
        running = false;
        break;
    }
  }

  clear();
  console.log(s.muted("\n  👋 Goodbye!\n"));
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

async function quickStatus() {
  await doStatus();
}

async function quickCommit(message) {
  if (message) {
    const status = await getGitStatus();
    if (status.staged.length === 0) await stageAll();
    await createCommit(message);
    console.log(s.success("\n  ✓ Commit done!\n"));
  } else {
    await doCommit();
  }
}

async function quickPush() {
  await doPush();
}

async function easyWorkflow() {
  const info = await getGitStatus();

  // 1. Stage all
  if (info.modified.length > 0 || info.not_added.length > 0) {
    const spin = ora({ text: s.muted(" Staging all changes..."), spinner: "dots" }).start();
    await stageAll();
    spin.succeed(s.success(" All files staged!"));
  } else if (info.staged.length === 0) {
    console.log(s.warning("\n  ⚠️  No changes to commit."));
    return;
  }

  // 2. Commit with AI (or direct commit if we have info)
  console.log(s.muted("\n  🤖 Generating AI commit message..."));
  await doCommit();

  // 3. Push is already part of doCommit logic (asks user), but let's make it automatic for easy mode
  // Actually, doCommit already has a prompt for push at the end.
  // But if the user wants true "easy" mode, we could force it.
  // Let's keep it consistent with the user's flow but make it faster.
}

module.exports = { startApp, quickStatus, quickCommit, quickPush, easyWorkflow };