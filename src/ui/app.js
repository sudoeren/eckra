const {
  getGitStatus,
  getStagedDiff,
  stageAll,
  createCommit,
} = require("../helpers/git");
const { generateCommitMessage } = require("../helpers/ai");

const configHelper = require("../helpers/config");

const { s, clear, header } = require("./common");
const { menuItem, sep, prompt, spinner, done, fail } = require("./screen");

// Lazy load modules
const status = () => require("./modules/status");
const stage = () => require("./modules/stage");
const commit = () => require("./modules/commit");
const sync = () => require("./modules/sync");
const more = () => require("./modules/more");
const conflict = () => require("./modules/conflict");
const branch = () => require("./modules/branch");
const log = () => require("./modules/log");
const graph = () => require("./modules/graph");
const onboarding = () => require("./modules/onboarding");

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════

/**
 * Ensure the user has completed onboarding before using eckra.
 * Runs the onboarding flow when no config exists yet and only returns
 * true once a config file has been written. Returns false (blocking the
 * caller) if onboarding was not completed.
 */
async function ensureOnboarding() {
  if (configHelper.isConfigured()) return true;
  await onboarding().doOnboarding();
  return configHelper.isConfigured();
}

async function startApp() {
  // Onboarding check
  if (!(await ensureOnboarding())) return;

  let running = true;

  while (running) {
    clear();
    header();

    const info = await status().getStatusInfo();

    if (!info) {
      console.log(s.error("  ✗ not a git repository\n"));
      console.log(s.muted("  Navigate to a git project or run 'git init'.\n"));
      await prompt([
        { type: "input", name: "x", message: s.muted("Press Enter...") },
      ]);
      return;
    }

    console.log(status().statusLine(info));

    // Smart menu - options based on current state
    const choices = [];

    // Conflict priority
    if (info.conflicts > 0) {
      choices.push(menuItem("Resolve Conflict", "danger", "conflict"));
      choices.push(sep());
    }

    // Main actions
    if (info.modified > 0 || info.untracked > 0 || info.deleted > 0) {
      choices.push(
        menuItem(
          "Stage" +
            s.muted(
              ` (${info.modified + info.untracked + info.deleted} files)`
            ),
          "success",
          "stage"
        )
      );
    }

    if (
      info.staged > 0 ||
      info.modified > 0 ||
      info.untracked > 0 ||
      info.deleted > 0
    ) {
      choices.push(
        menuItem(
          "Commit" +
            (info.staged > 0 ? s.muted(` (${info.staged} staged)`) : ""),
          "primary",
          "commit"
        )
      );
    }

    choices.push(menuItem("Push", "primary", "push"));
    choices.push(menuItem("Pull", "primary", "pull"));

    choices.push(sep());

    choices.push(menuItem("Status", "text", "status"));
    choices.push(menuItem("Branch", "text", "branch"));
    choices.push(menuItem("Git Graph", "text", "graph"));
    choices.push(menuItem("Log", "text", "log"));
    choices.push(menuItem("More", "text", "more"));

    choices.push(sep());
    choices.push(menuItem("Exit", "muted", "exit"));

    const { action } = await prompt([
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
      case "graph":
        await graph().doGraph();
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

async function quickCommit(message, opts = {}) {
  if (message) {
    try {
      const statusResult = await getGitStatus();
      if (statusResult.staged.length === 0) await stageAll();
      await createCommit(message);
      console.log(s.success("\n  ✓ Commit done!\n"));
    } catch (err) {
      console.log(s.error(`\n  ✗ ${err.message}`));
      process.exitCode = 1;
    }
  } else {
    await commit().doCommit(null, opts);
  }
}

async function quickPush(yes) {
  await sync().doPush(false, { yes });
}

async function quickGraph() {
  await graph().doGraph();
}

async function easyWorkflow() {
  const info = await getGitStatus();

  // 1. Stage all
  if (
    info.modified.length > 0 ||
    info.not_added.length > 0 ||
    info.deleted.length > 0
  ) {
    const spin = spinner("Staging all changes...");
    spin.start();
    await stageAll();
    done(spin, "All files staged!");
  } else if (info.staged.length === 0) {
    console.log(s.warning("\n  No changes to commit."));
    return;
  }

  // 2. Generate the AI message
  let message;
  const spinAi = spinner("Generating AI commit message...");
  spinAi.start();

  try {
    const diff = await getStagedDiff();
    const status = await getGitStatus();
    message = await generateCommitMessage(diff, status.staged);
    spinAi.stop();

    console.log(`\n  ${s.ai("AI Suggestion:")}\n`);
    message.split("\n").forEach((line) => console.log(s.text("    " + line)));
    console.log();
  } catch (err) {
    fail(spinAi, `AI Error: ${err.message}`);
    const { manual } = await prompt([
      {
        type: "input",
        name: "manual",
        message: s.muted("Enter commit message manually:"),
        validate: (v) => v.length > 0 || "Message cannot be empty",
      },
    ]);
    message = manual;
  }

  // 3. Confirm the message
  if (message) {
    const { confirmCommit } = await prompt([
      {
        type: "confirm",
        name: "confirmCommit",
        message: s.muted("Commit with this message?"),
        default: true,
      },
    ]);
    if (!confirmCommit) {
      const { manual } = await prompt([
        {
          type: "input",
          name: "manual",
          message: s.muted("Enter commit message manually:"),
          validate: (v) => v.length > 0 || "Message cannot be empty",
        },
      ]);
      message = manual;
    }
  }

  if (!message) return;

  // 4. Commit
  try {
    const spinCommit = spinner("Creating commit...");
    spinCommit.start();
    const result = await createCommit(message);
    done(spinCommit, `Commit: ${result.commit.substring(0, 7)}`);

    // 5. Confirm push
    const { pushNow } = await prompt([
      {
        type: "confirm",
        name: "pushNow",
        message: s.muted("Push to remote?"),
        default: true,
      },
    ]);

    if (pushNow) {
      await sync().doPush(true);
    }

    console.log(
      s.success(`\n  ✓ Workflow complete!${pushNow ? "" : " (push skipped)"}\n`)
    );
  } catch (err) {
    console.log(s.error(`\n  ✗ Error: ${err.message}`));
  }
}

async function quickTimeline(count) {
  const timelineMod = require("./modules/timeline");
  if (count) {
    const { getCommitHistory } = require("../helpers/git");
    const { generateTimeline } = require("../helpers/ai");
    const { s, pause } = require("./common");

    const n = parseInt(count, 10);
    if (isNaN(n) || n < 1) {
      console.log(
        s.error("  Invalid count. Please provide a number greater than 0.\n")
      );
      return;
    }

    const spin = spinner(`Fetching ${n} commits...`);
    spin.start();
    let commits;
    try {
      commits = (await getCommitHistory(n)).all;
      if (commits.length === 0) {
        fail(spin, "No commits found.");
        return;
      }
      spin.text = s.muted(`  Analyzing ${commits.length} commits with AI...`);
    } catch (err) {
      fail(spin, `Failed to fetch commits: ${err.message}`);
      return;
    }

    try {
      const story = await generateTimeline(commits);
      spin.stop();
      timelineMod.renderStory(story, commits.length, commits);
    } catch (err) {
      fail(spin, `AI Error: ${err.message}`);
    }
    await pause();
  } else {
    await timelineMod.doTimeline();
  }
}

module.exports = {
  ensureOnboarding,
  startApp,
  quickStatus,
  quickCommit,
  quickPush,
  quickGraph,
  quickTimeline,
  easyWorkflow,
};
