const inquirer = require("inquirer");
const ora = require("ora");
const { pushToRemote, pullFromRemote, getCurrentBranch } = require("../../helpers/git");
const { s, clear, sleep, pause } = require("../common");

async function doPush() {
  const spin = ora({
    text: s.muted(" Pushing..."),
    spinner: "dots",
  }).start();

  try {
    await pushToRemote();
    spin.succeed(s.success(" Push successful!"));
    await sleep(800);
  } catch (err) {
    spin.fail(s.error(" Push error"));

    if (err.message.includes("no upstream")) {
      const branch = await getCurrentBranch();
      const { setUpstream } = await inquirer.prompt([
        {
          type: "confirm",
          name: "setUpstream",
          message: s.warning(`Set upstream? (-u origin ${branch})`),
          default: true,
        },
      ]);

      if (setUpstream) {
        const spin2 = ora({
          text: s.muted(" Setting upstream..."),
          spinner: "dots",
        }).start();
        try {
          const simpleGit = require("simple-git")();
          await simpleGit.push(["-u", "origin", branch]);
          spin2.succeed(s.success(" Push successful!"));
        } catch (e) {
          spin2.fail(s.error(` ${e.message}`));
        }
      }
    } else {
      console.log(s.error(`
  ${err.message}
`));
    }
    await pause();
  }
}

async function doPull() {
  const spin = ora({
    text: s.muted(" Pulling..."),
    spinner: "dots",
  }).start();

  try {
    const result = await pullFromRemote();

    if (result.summary?.changes > 0) {
      spin.succeed(s.success(` ${result.summary.changes} files updated`));
    } else {
      spin.succeed(s.success(" Already up to date!"));
    }
    await sleep(800);
  } catch (err) {
    spin.fail(s.error(` ${err.message}`));
    await pause();
  }
}

module.exports = { doPush, doPull };
