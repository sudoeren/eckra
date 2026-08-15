const {
  getCommitLog,
  squashCommits,
  rebase,
  abortRebase,
  continueRebase,
  getBranches,
  getCurrentBranch,
} = require("../../helpers/git");
const { s, pause } = require("../common");
const {
  open,
  menuItem,
  backItem,
  sep,
  prompt,
  spinner,
  done,
  fail,
} = require("../screen");

async function doRebase() {
  open("Advanced Git Operations (Rebase)");

  const { action } = await prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("Select operation:"),
      choices: [
        menuItem("Rebase onto branch", "primary", "rebase_onto"),
        menuItem("Squash last N commits", "warning", "squash"),
        sep(),
        menuItem("Abort Rebase", "danger", "abort"),
        menuItem("Continue Rebase", "success", "continue"),
        sep(),
        backItem(),
      ],
      loop: true,
      pageSize: 20,
    },
  ]);

  if (action === "back") return;

  if (action === "squash") {
    await doSquash();
  } else if (action === "rebase_onto") {
    await doRebaseOnto();
  } else if (action === "abort") {
    await doAbortRebase();
  } else if (action === "continue") {
    await doContinueRebase();
  }
}

async function doRebaseOnto() {
  const branches = await getBranches();
  const current = await getCurrentBranch();
  const otherBranches = branches.all.filter((b) => b !== current);

  if (otherBranches.length === 0) {
    console.log(s.warning("  No other branches to rebase onto."));
    await pause();
    return;
  }

  const { target } = await prompt([
    {
      type: "list",
      name: "target",
      message: `Rebase ${s.primary(current)} onto:`,
      choices: otherBranches,
      loop: true,
      pageSize: 15,
    },
  ]);

  const spin = spinner(`Rebasing onto ${target}...`);
  spin.start();

  try {
    await rebase(target);
    done(spin, `Successfully rebased onto ${target}`);
  } catch (error) {
    fail(spin, `Rebase failed: ${error.message}`);
    console.log(
      s.muted(
        "\n  You may need to resolve conflicts and then 'Continue Rebase'."
      )
    );
  }

  await pause();
}

async function doAbortRebase() {
  const spin = spinner("Aborting rebase...");
  spin.start();
  try {
    await abortRebase();
    done(spin, "Rebase aborted.");
  } catch (error) {
    fail(spin, `Failed to abort: ${error.message}`);
  }
  await pause();
}

async function doContinueRebase() {
  const spin = spinner("Continuing rebase...");
  spin.start();
  try {
    await continueRebase();
    done(spin, "Rebase continued.");
  } catch (error) {
    fail(spin, `Failed to continue: ${error.message}`);
    console.log(s.muted("\n  Are all conflicts resolved and staged?"));
  }
  await pause();
}

async function doSquash() {
  const log = await getCommitLog(10);

  if (log.all.length < 2) {
    console.log(s.warning("  Not enough commits to squash."));
    await pause();
    return;
  }

  const { count } = await prompt([
    {
      type: "number",
      name: "count",
      message: "How many commits to squash (from HEAD)?",
      default: 2,
      validate: (val) =>
        val > 1 && val <= log.all.length
          ? true
          : `Enter a number between 2 and ${log.all.length}`,
    },
  ]);

  const { message } = await prompt([
    {
      type: "input",
      name: "message",
      message: "New commit message for squashed commit:",
      default: `Squashed ${count} commits`,
    },
  ]);

  const spin = spinner("Squashing...");
  spin.start();

  try {
    // Soft reset to HEAD~count
    await squashCommits(count, message);
    done(spin, "Commits squashed successfully!");
  } catch (error) {
    fail(spin, "Squash failed: " + error.message);
  }

  await pause();
}

module.exports = { doRebase };
