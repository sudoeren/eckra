const chalk = require("chalk");
const inquirer = require("inquirer");
const ora = require("ora");
const fs = require("fs");
const path = require("path");

const {
  getGitStatus,
  getStagedDiff,
  stageAll,
  createCommit,
} = require("../helpers/git");
const { generateCommitMessage } = require("../helpers/ai");

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
  pause,
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
      console.log(s.muted("  Navigate to a git project or run 'git init'.\n"));
      await inquirer.prompt([
        { type: "input", name: "x", message: s.muted("Press Enter...") },
      ]);
      return;
    }

    // Smart menu - options based on current state
    const choices = [];

    // Conflict priority
    if (info.conflicts > 0) {
      choices.push({
        name: s.error("  ⚠ Resolve Conflict"),
        value: "conflict",
      });
      choices.push({
        type: "separator",
        line: s.dim("  ─────────────────────"),
      });
    }

    // Main actions
    if (info.modified > 0 || info.untracked > 0 || info.deleted > 0) {
      choices.push({
        name:
          `  ${s.success("+ ")} Stage` +
          s.muted(` (${info.modified + info.untracked + info.deleted} files)`),
        value: "stage",
      });
    }

    if (
      info.staged > 0 ||
      info.modified > 0 ||
      info.untracked > 0 ||
      info.deleted > 0
    ) {
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
  if (
    info.modified.length > 0 ||
    info.not_added.length > 0 ||
    info.deleted.length > 0
  ) {
    const spin = ora({
      text: s.muted(" Staging all changes..."),
      spinner: "dots",
    }).start();
    await stageAll();
    spin.succeed(s.success(" All files staged!"));
  } else if (info.staged.length === 0) {
    console.log(s.warning("\n  ⚠️  No changes to commit."));
    return;
  }

  let finalMessage = null;
  let shouldPush = true;

  while (!finalMessage) {
    const spinAi = ora({
      text: s.muted(" 🤖 Generating AI commit message..."),
      spinner: "dots",
    }).start();
    let aiMessage = "";

    try {
      const diff = await getStagedDiff();
      const status = await getGitStatus();
      aiMessage = await generateCommitMessage(diff, status.staged);
      spinAi.stop();

      console.log(`\n  ${s.primary("🤖 AI Suggestion:")}\n`);
      aiMessage
        .split("\n")
        .forEach((line) => console.log(s.text("    " + line)));
      console.log();

      const { choice } = await inquirer.prompt([
        {
          type: "list",
          name: "choice",
          message: s.muted("Action:"),
          choices: [
            {
              name: s.success("  ✓ Looks good (Commit & Push)"),
              value: "commit-push",
            },
            {
              name: s.primary("  ✓ Looks good (Commit Only)"),
              value: "commit-only",
            },
            { name: s.primary("  ↻ Regenerate"), value: "retry" },
            { name: s.white("  ✎ Edit subject line"), value: "edit" },
            { name: s.muted("  ✕ Cancel"), value: "cancel" },
          ],
          loop: true,
        },
      ]);

      if (choice === "commit-push" || choice === "commit-only") {
        finalMessage = aiMessage;
        shouldPush = choice === "commit-push";
      } else if (choice === "edit") {
        const subject = aiMessage.split("\n")[0];
        const body = aiMessage.split("\n").slice(1).join("\n");

        const { editedSubject } = await inquirer.prompt([
          {
            type: "input",
            name: "editedSubject",
            message: s.muted("Edit subject line:"),
            default: subject,
            validate: (v) => v.length > 0 || "Subject cannot be empty",
          },
        ]);
        finalMessage = body
          ? `${editedSubject}\n\n${body.trim()}`
          : editedSubject;
        shouldPush = false;
      } else if (choice === "cancel") {
        return;
      }
      // If retry, loop continues to generate a new message
    } catch (err) {
      spinAi.fail(s.error(` AI Error: ${err.message}`));
      const { manual } = await inquirer.prompt([
        {
          type: "input",
          name: "manual",
          message: s.muted("Enter commit message manually:"),
          validate: (v) => v.length > 0 || "Message cannot be empty",
        },
      ]);
      finalMessage = manual;
      shouldPush = false;
    }
  }

  // 3. Commit
  try {
    const spinCommit = ora({
      text: s.muted(" Creating commit..."),
      spinner: "dots",
    }).start();
    const result = await createCommit(finalMessage);
    spinCommit.succeed(s.success(` Commit: ${result.commit.substring(0, 7)}`));

    // 4. Push (optional)
    if (shouldPush) {
      await sync().doPush(true);
    }

    console.log(
      s.success(
        `\n  ✨ Workflow complete!${shouldPush ? "" : " (push skipped)"}\n`,
      ),
    );
  } catch (err) {
    console.log(s.error(`\n  ❌ Error: ${err.message}`));
  }
}

async function quickTimeline(count) {
  const timelineMod = require("./modules/timeline");
  if (count) {
    const { getCommitHistory } = require("../helpers/git");
    const { generateTimeline } = require("../helpers/ai");
    const { s, header, clear, pause, box } = require("./common");

    clear();
    header();
    const n = parseInt(count, 10);
    if (isNaN(n) || n < 1) {
      console.log(s.error("  Invalid count. Please provide a number greater than 0.\n"));
      return;
    }

    const ora = require("ora");
    const spin = ora({ text: s.muted(` Fetching ${n} commits...`), spinner: "dots" }).start();
    let commits;
    try {
      commits = (await getCommitHistory(n)).all;
      if (commits.length === 0) {
        spin.fail(s.warning(" No commits found."));
        return;
      }
      spin.text = s.muted(` Analyzing ${commits.length} commits with AI...`);
    } catch (err) {
      spin.fail(s.error(` Failed to fetch commits: ${err.message}`));
      return;
    }

    try {
      const story = await generateTimeline(commits);
      spin.stop();
      console.log(s.bold(`  Project Story (${commits.length} commits analyzed)\n`));
      console.log(box(story, s.primary("AI-Generated Timeline")));
      console.log();
    } catch (err) {
      spin.fail(s.error(` AI Error: ${err.message}`));
    }
    await pause();
  } else {
    await timelineMod.doTimeline();
  }
}

module.exports = {
  startApp,
  quickStatus,
  quickCommit,
  quickPush,
  quickTimeline,
  easyWorkflow,
};
