const chalk = require("chalk");
const inquirer = require("inquirer");
const ora = require("ora");
const fs = require("fs");
const path = require("path");

const {
  getGitStatus,
  stageFiles,
  stageAll,
  createCommit,
  getStagedDiff,
  pushToRemote,
  pullFromRemote,
  getBranches,
  getCurrentBranch,
  createBranch,
  switchBranch,
  deleteBranch,
  mergeBranch,
  getCommitLog,
  getRemotes,
  stashChanges,
  popStash,
  listStashes,
  addRemote,
  undoLastCommit,
  getLastCommit,
  amendCommit,
  getUnstagedDiff,
  getFileDiff,
  listTags,
  createTag,
  deleteTag,
  pushTags,
  searchCommits,
  cherryPick,
  getOtherBranchCommits,
  removeRemote,
  setRemoteUrl,
  getRepoStats,
  squashCommits,
  dropLastCommit,
  getConflictDetails,
  acceptOurs,
  acceptTheirs,
  abortMerge,
  getBlame,
  getTrackedFiles,
  listWorktrees,
  addWorktree,
  addWorktreeNewBranch,
  removeWorktree,
} = require("../helpers/git");

const {
  generateCommitSuggestions,
  checkLMStudioConnection,
} = require("../helpers/lmstudio");

const { getConfig, saveConfig } = require("../helpers/config");

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

const { doSettings } = require("./modules/settings");
const { doWorktree } = require("./modules/worktree");
const { doBranch } = require("./modules/branch");
const { doLog } = require("./modules/log");
const { doStatus, getStatusInfo, statusLine } = require("./modules/status");
const { doStage } = require("./modules/stage");
const { doCommit } = require("./modules/commit");
const { doPush, doPull } = require("./modules/sync");

// ═══════════════════════════════════════════════════════════════
// HEADER & STATUS
// ═══════════════════════════════════════════════════════════════

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
          `  ${s.success("+")} Stage` +
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
// MORE (Advanced Features)
// ═══════════════════════════════════════════════════════════════

async function doMore() {
  let inMenu = true;

  while (inMenu) {
    clear();
    header();
    console.log(s.bold("  More Options\n"));

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: s.muted("What would you like to do?"),
        choices: [
          { name: s.warning("  ↩ Undo (Revert last commit)"), value: "undo" },
          {
            name: s.primary("  ✎ Amend (Fix commit message)"),
            value: "amend",
          },
          { name: s.text("  ≋ Diff (View changes)"), value: "diff" },
          { type: "separator", line: " " },
          { name: s.text("  📦 Stash"), value: "stash" },
          { name: s.text("  🏷 Tag"), value: "tag" },
          { name: s.text("  🔗 Remote"), value: "remote" },
          { type: "separator", line: " " },
          { name: s.text("  📊 Statistics"), value: "stats" },
          { name: s.text("  🔍 Search Commits"), value: "search" },
          { name: s.text("  📋 Blame"), value: "blame" },
          { name: s.text("  🌳 Worktrees"), value: "worktree" },
          { type: "separator", line: " " },
          { name: s.text("  ⚙ Settings"), value: "settings" },
          { name: s.muted("  ← Main Menu"), value: "back" },
        ],
        pageSize: 15,
      },
    ]);

    switch (action) {
      case "undo":
        await doUndo();
        break;
      case "amend":
        await doAmend();
        break;
      case "diff":
        await doDiff();
        break;
      case "stash":
        await doStash();
        break;
      case "tag":
        await doTag();
        break;
      case "remote":
        await doRemote();
        break;
      case "stats":
        await doStats();
        break;
      case "search":
        await doSearch();
        break;
      case "blame":
        await doBlame();
        break;
      case "worktree":
        await doWorktree();
        break;
      case "settings":
        await doSettings();
        break;
      case "back":
        inMenu = false;
        break;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// UNDO
// ═══════════════════════════════════════════════════════════════

async function doUndo() {
  clear();
  header();
  console.log(s.bold("  Undo\n"));

  const lastCommit = await getLastCommit();

  if (!lastCommit) {
    console.log(s.muted("  No commit to undo.\n"));
    await pause();
    return;
  }

  console.log(s.muted("  Last commit:"));
  console.log(
    s.text(`  ${lastCommit.hash.substring(0, 7)} - ${lastCommit.message}`),
  );
  console.log(
    s.muted(`  ${lastCommit.author_name} · ${timeAgo(lastCommit.date)}\n`),
  );

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: s.warning("Undo this commit? (changes will be preserved)"),
      default: false,
    },
  ]);

  if (confirm) {
    const spin = ora({
      text: s.muted(" Undoing..."),
      spinner: "dots",
    }).start();
    await undoLastCommit();
    spin.succeed(
      s.success(" Commit undone! Changes are still staged."),
    );
    await pause();
  }
}

// ═══════════════════════════════════════════════════════════════
// AMEND
// ═══════════════════════════════════════════════════════════════

async function doAmend() {
  clear();
  header();
  console.log(s.bold("  Amend\n"));

  const lastCommit = await getLastCommit();

  if (!lastCommit) {
    console.log(s.muted("  No commit to amend.\n"));
    await pause();
    return;
  }

  console.log(s.muted("  Current message:"));
  console.log(s.text(`  "${lastCommit.message}"\n`));

  const { newMessage } = await inquirer.prompt([
    {
      type: "input",
      name: "newMessage",
      message: s.muted("New message:"),
      default: lastCommit.message,
      validate: (v) => v.length > 0,
    },
  ]);

  if (newMessage !== lastCommit.message) {
    const spin = ora({
      text: s.muted(" Updating..."),
      spinner: "dots",
    }).start();
    await amendCommit(newMessage);
    spin.succeed(s.success(" Commit message updated!"));
    await sleep(600);
  }
}

// ═══════════════════════════════════════════════════════════════
// DIFF
// ═══════════════════════════════════════════════════════════════

async function doDiff() {
  clear();
  header();
  console.log(s.bold("  Diff\n"));

  const status = await getGitStatus();

  if (status.staged.length === 0 && status.modified.length === 0) {
    console.log(s.muted("  No changes.\n"));
    await pause();
    return;
  }

  const { type } = await inquirer.prompt([
    {
      type: "list",
      name: "type",
      message: s.muted("Which changes to show?"),
      choices: [
        {
          name: s.success(`  Staged (${status.staged.length})`),
          value: "staged",
        },
        {
          name: s.warning(`  Unstaged (${status.modified.length})`),
          value: "unstaged",
        },
        { name: s.muted("  ← Back"), value: "back" },
      ],
    },
  ]);

  if (type === "back") return;

  const diff =
    type === "staged" ? await getStagedDiff() : await getUnstagedDiff();

  if (!diff) {
    console.log(s.muted("\n  No diff.\n"));
    await pause();
    return;
  }

  clear();
  console.log();

  // Colored diff
  diff.split("\n").forEach((line) => {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      console.log(s.success(line));
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      console.log(s.error(line));
    } else if (line.startsWith("@@")) {
      console.log(s.primary(line));
    } else {
      console.log(s.muted(line));
    }
  });

  console.log();
  await pause();
}

// ═══════════════════════════════════════════════════════════════
// STASH
// ═══════════════════════════════════════════════════════════════

async function doStash() {
  let inMenu = true;

  while (inMenu) {
    clear();
    header();
    console.log(s.bold("  Stash\n"));

    const stashes = await listStashes();

    if (stashes.all.length > 0) {
      stashes.all.slice(0, 5).forEach((st, i) => {
        console.log(s.muted(`  ${i}: `) + s.text(st.message));
      });
      console.log();
    } else {
      console.log(s.muted("  No stashes.\n"));
    }

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: s.muted("What should I do?"),
        choices: [
          { name: s.success("  + Save Stash"), value: "save" },
          { name: s.primary("  ↓ Apply Stash (pop)"), value: "pop" },
          { name: s.muted("  ← Back"), value: "back" },
        ],
      },
    ]);

    switch (action) {
      case "save":
        const status = await getGitStatus();
        if (status.modified.length === 0 && status.not_added.length === 0) {
          console.log(s.muted("\n  No changes to stash."));
          await pause();
        } else {
          const { message } = await inquirer.prompt([
            {
              type: "input",
              name: "message",
              message: s.muted("Stash message (optional):"),
            },
          ]);
          await stashChanges(message || null);
          console.log(s.success("\n  ✓ Changes stashed!"));
          await sleep(600);
        }
        break;

      case "pop":
        if (stashes.all.length === 0) {
          console.log(s.muted("\n  No stash to pop."));
          await pause();
        } else {
          try {
            await popStash();
            console.log(s.success("\n  ✓ Stash applied!"));
            await sleep(600);
          } catch (err) {
            console.log(s.error(`\n  ✗ ${err.message}`));
            await pause();
          }
        }
        break;

      case "back":
        inMenu = false;
        break;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// TAG
// ═══════════════════════════════════════════════════════════════

async function doTag() {
  clear();
  header();
  console.log(s.bold("  Tag\n"));

  const tags = await listTags();

  if (tags.all.length > 0) {
    tags.all.slice(0, 10).forEach((t) => console.log(s.primary(`  🏷 ${t}`)));
    console.log();
  } else {
    console.log(s.muted("  No tags.\n"));
  }

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("What should I do?"),
      choices: [
        { name: s.success("  + New Tag"), value: "new" },
        { name: s.primary("  ↑ Push Tags"), value: "push" },
        { name: s.error("  ✕ Delete Tag"), value: "delete" },
        { name: s.muted("  ← Back"), value: "back" },
      ],
    },
  ]);

  if (action === "back") return;

  if (action === "new") {
    const { name } = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: s.muted("Tag name (e.g. v1.0.0):"),
        validate: (v) => v.length > 0,
      },
    ]);
    await createTag(name);
    console.log(s.success(`\n  ✓ ${name} created!`));
    await sleep(600);
  }

  if (action === "push") {
    const spin = ora({
      text: s.muted(" Pushing tags..."),
      spinner: "dots",
    }).start();
    try {
      await pushTags();
      spin.succeed(s.success(" Tags pushed!"));
    } catch (err) {
      spin.fail(s.error(` ${err.message}`));
    }
    await pause();
  }

  if (action === "delete") {
    if (tags.all.length === 0) {
      console.log(s.muted("\n  No tags to delete."));
      await pause();
    } else {
      const { toDelete } = await inquirer.prompt([
        {
          type: "list",
          name: "toDelete",
          message: s.muted("Which tag to delete?"),
          choices: tags.all,
        },
      ]);
      await deleteTag(toDelete);
      console.log(s.success(`\n  ✓ ${toDelete} deleted!`));
      await sleep(600);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// REMOTE
// ═══════════════════════════════════════════════════════════════

async function doRemote() {
  clear();
  header();
  console.log(s.bold("  Remote\n"));

  const remotes = await getRemotes();

  if (remotes.length > 0) {
    remotes.forEach((r) => {
      console.log(s.primary(`  ${r.name}`));
      console.log(s.muted(`    ${r.refs.fetch || "-"}\n`));
    });
  } else {
    console.log(s.muted("  No remotes.\n"));
  }

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("What should I do?"),
      choices: [
        { name: s.success("  + Add Remote"), value: "add" },
        { name: s.error("  ✕ Remove Remote"), value: "remove" },
        { name: s.muted("  ← Back"), value: "back" },
      ],
    },
  ]);

  if (action === "back") return;

  if (action === "add") {
    const { name } = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: s.muted("Remote name:"),
        default: "origin",
      },
    ]);
    const { url } = await inquirer.prompt([
      {
        type: "input",
        name: "url",
        message: s.muted("URL:"),
        validate: (v) => v.length > 0,
      },
    ]);
    await addRemote(name, url);
    console.log(s.success(`\n  ✓ ${name} added!`));
    await sleep(600);
  }

  if (action === "remove" && remotes.length > 0) {
    const { toRemove } = await inquirer.prompt([
      {
        type: "list",
        name: "toRemove",
        message: s.muted("Which remote to remove?"),
        choices: remotes.map((r) => r.name),
      },
    ]);
    await removeRemote(toRemove);
    console.log(s.success(`\n  ✓ ${toRemove} removed!`));
    await sleep(600);
  }
}

// ═══════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════

async function doStats() {
  clear();
  header();
  console.log(s.bold("  Statistics\n"));

  const spin = ora({
    text: s.muted(" Calculating..."),
    spinner: "dots",
  }).start();

  try {
    const stats = await getRepoStats();
    spin.stop();

    console.log(s.primary(`  ${stats.totalCommits}`) + s.text(" commits"));
    console.log(s.primary(`  ${stats.branches}`) + s.text(" branches"));
    console.log(s.primary(`  ${stats.tags}`) + s.text(" tags"));
    console.log();

    if (stats.firstCommit) {
      console.log(
        s.muted("  First commit: ") +
        s.text(new Date(stats.firstCommit.date).toLocaleDateString("en-US")),
      );
      console.log(
        s.muted("  Last commit: ") +
        s.text(new Date(stats.lastCommit.date).toLocaleDateString("en-US")),
      );
      console.log();
    }

    // Top contributors
    const authors = Object.entries(stats.authors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    if (authors.length > 0) {
      console.log(s.muted("  Top contributors:"));
      authors.forEach(([name, count]) => {
        const bar = "█".repeat(
          Math.min(Math.round((count / stats.totalCommits) * 15), 15),
        );
        console.log(`  ${s.primary(bar)} ${name} (${count})`);
      });
    }
  } catch (err) {
    spin.fail(s.error(` ${err.message}`));
  }

  console.log();
  await pause();
}

// ═══════════════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════════════

async function doSearch() {
  clear();
  header();
  console.log(s.bold("  Search Commits\n"));

  const { query } = await inquirer.prompt([
    {
      type: "input",
      name: "query",
      message: s.muted("Search term:"),
      validate: (v) => v.length > 0,
    },
  ]);

  const spin = ora({ text: s.muted(" Searching..."), spinner: "dots" }).start();

  try {
    const results = await searchCommits(query);
    spin.stop();

    if (results.all.length === 0) {
      console.log(s.muted("\n  No results found.\n"));
    } else {
      console.log(s.muted(`\n  ${results.all.length} results:\n`));
      results.all.slice(0, 10).forEach((commit) => {
        console.log(
          `  ${s.primary(commit.hash.substring(0, 7))} ${s.text(truncate(commit.message, 50))}`,
        );
        console.log(
          s.muted(`         ${commit.author_name} · ${timeAgo(commit.date)}\n`),
        );
      });
    }
  } catch (err) {
    spin.fail(s.error(` ${err.message}`));
  }

  await pause();
}

// ═══════════════════════════════════════════════════════════════
// BLAME
// ═══════════════════════════════════════════════════════════════

async function doBlame() {
  clear();
  header();
  console.log(s.bold("  Blame\n"));

  const files = await getTrackedFiles();

  if (files.length === 0) {
    console.log(s.muted("  No tracked files.\n"));
    await pause();
    return;
  }

  const { file } = await inquirer.prompt([
    {
      type: "list",
      name: "file",
      message: s.muted("Select file:"),
      choices: files.slice(0, 30),
      pageSize: 15,
    },
  ]);

  const spin = ora({
    text: s.muted(" Loading..."),
    spinner: "dots",
  }).start();

  try {
    const blame = await getBlame(file);
    spin.stop();

    clear();
    console.log(s.bold(`\n  ${file}\n`));

    blame.slice(0, rows() - 5).forEach((b, i) => {
      const lineNum = s.muted(String(i + 1).padStart(4));
      const hash = s.primary((b.hash || "").substring(0, 7));
      const author = s.muted(truncate(b.author || "", 10).padEnd(10));
      const code = truncate(b.line || "", cols() - 30);
      console.log(`${lineNum} ${hash} ${author} ${code}`);
    });
  } catch (err) {
    spin.fail(s.error(` ${err.message}`));
  }

  console.log();
  await pause();
}

// ═══════════════════════════════════════════════════════════════
// CONFLICT
// ═══════════════════════════════════════════════════════════════

async function doConflict() {
  clear();
  header();
  console.log(s.bold("  Conflict Resolver\n"));

  const conflicts = await getConflictDetails();

  if (conflicts.length === 0) {
    console.log(s.success("  ✓ No conflicts!\n"));
    await pause();
    return;
  }

  console.log(s.error(`  ${conflicts.length} files with conflicts:\n`));
  conflicts.forEach((f) => console.log(s.warning(`  ⚠ ${f}`)));
  console.log();

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("What should I do?"),
      choices: [
        {
          name: s.success("  Accept all 'ours' (our version)"),
          value: "ours",
        },
        {
          name: s.primary("  Accept all 'theirs' (their version)"),
          value: "theirs",
        },
        { name: s.error("  Abort merge"), value: "abort" },
        { name: s.muted("  ← Back"), value: "back" },
      ],
    },
  ]);

  if (action === "back") return;

  if (action === "ours") {
    for (const file of conflicts) await acceptOurs(file);
    console.log(s.success("\n  ✓ All conflicts resolved as 'ours'!"));
    await sleep(600);
  }

  if (action === "theirs") {
    for (const file of conflicts) await acceptTheirs(file);
    console.log(s.success("\n  ✓ All conflicts resolved as 'theirs'!"));
    await sleep(600);
  }

  if (action === "abort") {
    await abortMerge();
    console.log(s.warning("\n  Merge aborted."));
    await sleep(600);
  }
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

module.exports = { startApp, quickStatus, quickCommit, quickPush };
