const inquirer = require("inquirer");
const ora = require("ora").default;
const { getCommitLog, squashCommits, rebase, abortRebase, continueRebase, getBranches, getCurrentBranch } = require("../../helpers/git");
const { s, header, clear, pause } = require("../common");

async function doRebase() {
  clear();
  header();
  console.log(s.bold("  Advanced Git Operations (Rebase)\n"));

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("Select operation:"),
      choices: [
        { name: s.primary("  Rebase onto branch"), value: "rebase_onto" },
        { name: s.warning("  Squash last N commits"), value: "squash" },
        { type: "separator", line: " " },
        { name: s.error("  Abort Rebase"), value: "abort" },
        { name: s.success("  Continue Rebase"), value: "continue" },
        { type: "separator", line: " " },
        { name: s.muted("  ← Back"), value: "back" },
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
  const otherBranches = branches.all.filter(b => b !== current);

  if (otherBranches.length === 0) {
    console.log(s.warning("  No other branches to rebase onto."));
    await pause();
    return;
  }

  const { target } = await inquirer.prompt([
    {
      type: "list",
      name: "target",
      message: `Rebase ${s.primary(current)} onto:`,
      choices: otherBranches,
      loop: true,
      pageSize: 15,
    }
  ]);

  const spin = ora({ text: s.muted(` Rebasing onto ${target}...`), spinner: "dots" }).start();
  
  try {
    await rebase(target);
    spin.succeed(s.success(` Successfully rebased onto ${target}`));
  } catch (error) {
    spin.fail(s.error(` Rebase failed: ${error.message}`));
    console.log(s.muted("\n  You may need to resolve conflicts and then 'Continue Rebase'."));
  }
  
  await pause();
}

async function doAbortRebase() {
  const spin = ora({ text: s.muted(" Aborting rebase..."), spinner: "dots" }).start();
  try {
    await abortRebase();
    spin.succeed(s.success(" Rebase aborted."));
  } catch (error) {
    spin.fail(s.error(` Failed to abort: ${error.message}`));
  }
  await pause();
}

async function doContinueRebase() {
  const spin = ora({ text: s.muted(" Continuing rebase..."), spinner: "dots" }).start();
  try {
    await continueRebase();
    spin.succeed(s.success(" Rebase continued."));
  } catch (error) {
    spin.fail(s.error(` Failed to continue: ${error.message}`));
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

  const { count } = await inquirer.prompt([
    {
      type: "number",
      name: "count",
      message: "How many commits to squash (from HEAD)?",
      default: 2,
      validate: (val) => val > 1 && val <= log.all.length ? true : `Enter a number between 2 and ${log.all.length}`
    }
  ]);

  const { message } = await inquirer.prompt([
    {
      type: "input",
      name: "message",
      message: "New commit message for squashed commit:",
      default: `Squashed ${count} commits`
    }
  ]);

  const spin = ora({ text: s.muted(" Squashing..."), spinner: "dots" }).start();
  
  try {
    // Soft reset to HEAD~count
    await squashCommits(count, message);
    spin.succeed(s.success(" Commits squashed successfully!"));
  } catch (error) {
    spin.fail(s.error(" Squash failed: " + error.message));
  }
  
  await pause();
}

module.exports = { doRebase };
