const inquirer = require("inquirer");
const ora = require("ora");
const { getLastCommit, amendCommit } = require("../../helpers/git");
const { s, header, clear, sleep, pause } = require("../common");

async function doAmend() {
  clear();
  header();
  console.log(s.bold("  Amend\n"));

  const lastCommit = await getLastCommit();

  if (!lastCommit) {
    console.log(s.muted("  No commit to amend.\n"));
    await pause(); // pause wasn't in imports in my thought, but likely needed if return early
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

module.exports = { doAmend };
