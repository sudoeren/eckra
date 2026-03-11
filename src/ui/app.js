const chalk = require("chalk");
const inquirer = require("inquirer");
const ora = require("ora");
const fs = require("fs");
const path = require("path");

const {
  getGitStatus,
  stageAll,
  createCommit,
  isConfigured, // Import isConfigured
} = require("../helpers/git");

const configHelper = require("../helpers/config"); // Import config helper

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

// Lazy load modules
const status = () => require("./modules/status");
const stage = () => require("./modules/stage");
const commit = () => require("./modules/commit");
const sync = () => require("./modules/sync");
const more = () => require("./modules/more");
const conflict = () => require("./modules/conflict");
const branch = () => require("./modules/branch");
const log = () => require("./modules/log");
const onboarding = () => require("./modules/onboarding");

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════

async function startApp() {
  // Onboarding check
  if (!configHelper.isConfigured()) {
    await onboarding().doOnboarding();
  }

  let running = true;

  while (running) {
    clear();
    header();

    const info = await status().getStatusInfo();
    console.log(status().statusLine(info));

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
        pageSize: 20,
        loop: true,
        },
        ]);

    switch (action) {
      case "stage":
        await stage().doStage(info);
        break;
      case "commit":
        await commit().doCommit(info);
        break;
      case "push":
        await sync().doPush();
        break;
      case "pull":
        await sync().doPull();
        break;
      case "status":
        await status().doStatus();
        break;
      case "branch":
        await branch().doBranch();
        break;
      case "log":
        await log().doLog();
        break;
      case "more":
        await more().doMore();
        break;
      case "conflict":
        await conflict().doConflict();
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
  await status().doStatus();
}

async function quickCommit(message) {
  if (message) {
    const statusResult = await getGitStatus();
    if (statusResult.staged.length === 0) await stageAll();
    await createCommit(message);
    console.log(s.success("\n  ✓ Commit done!\n"));
  } else {
    await commit().doCommit();
  }
}

async function quickPush() {
  await sync().doPush();
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

  // 2. Generate AI Commit Message
  const spinAi = ora({ text: s.muted(" 🤖 Generating AI commit message..."), spinner: "dots" }).start();
  try {
    const { getStagedDiff } = require("../helpers/git");
    const { generateCommitMessage } = require("../helpers/ai");
    
    const diff = await getStagedDiff();
    const status = await getGitStatus();
    const message = await generateCommitMessage(diff, status.staged);
    
    spinAi.succeed(s.success(` 🤖 AI Message: ${s.text(message)}`));

    // 3. Commit
    const spinCommit = ora({ text: s.muted(" Creating commit..."), spinner: "dots" }).start();
    const result = await createCommit(message);
    spinCommit.succeed(s.success(` Commit: ${result.commit.substring(0, 7)}`));

    // 4. Push
    const spinPush = ora({ text: s.muted(" Pushing to remote..."), spinner: "dots" }).start();
    await sync().doPush(true); // Added true for silent/auto mode if supported, or just call it
    spinPush.succeed(s.success(" Successfully pushed to remote!"));
    
    console.log(s.success("\n  ✨ Workflow complete!\n"));
  } catch (err) {
    spinAi.stop();
    console.log(s.error(`\n  ❌ Error: ${err.message}`));
    
    // Fallback to manual commit if AI fails but we have staged files
    console.log(s.muted("  Falling back to interactive commit...\n"));
    await commit().doCommit();
  }
}

module.exports = { startApp, quickStatus, quickCommit, quickPush, easyWorkflow };