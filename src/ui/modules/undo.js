const inquirer = require("inquirer");
const ora = require("ora");
const { getLastCommit, undoLastCommit } = require("../../helpers/git");
const { s, header, clear, pause, timeAgo } = require("../common");

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

module.exports = { doUndo };
