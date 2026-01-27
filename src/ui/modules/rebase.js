const inquirer = require("inquirer");
const ora = require("ora");
const { getCommitLog, squashCommits, resetToCommit } = require("../../helpers/git");
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
        { name: s.warning("  Squash last N commits"), value: "squash" },
        { name: s.muted("  ← Back"), value: "back" },
      ],
    },
  ]);

  if (action === "back") return;

  if (action === "squash") {
    await doSquash();
  }
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
