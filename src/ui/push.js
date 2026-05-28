const inquirer = require("inquirer");
const chalk = require("chalk");
const ora = require("ora");
const {
  pushToRemote,
  getRemotes,
  getCurrentBranch,
  getGitStatus,
  addRemote,
  pullFromRemote,
  getGit,
} = require("../helpers/git");

async function pushChanges() {
  const status = await getGitStatus();
  const currentBranch = await getCurrentBranch();
  const remotes = await getRemotes();

  // Check if there are commits to push
  if (status.ahead === 0 && status.tracking) {
    console.log(
      chalk.yellow("\n⚠️  No commits to push. Already up to date.\n"),
    );
    return;
  }

  // Check for remotes
  if (remotes.length === 0) {
    console.log(chalk.red("\n⚠️  No remote repository defined.\n"));

    const { addRemote: shouldAddRemote } = await inquirer.prompt([
      {
        type: "confirm",
        name: "addRemote",
        message: "Would you like to add a remote?",
        default: true,
      },
    ]);

    if (shouldAddRemote) {
      const { remoteName, remoteUrl } = await inquirer.prompt([
        {
          type: "input",
          name: "remoteName",
          message: "Remote name:",
          default: "origin",
        },
        {
          type: "input",
          name: "remoteUrl",
          message: "Remote URL:",
          validate: (input) => input.length > 0 || "URL cannot be empty",
        },
      ]);

      try {
        await addRemote(remoteName, remoteUrl);
        console.log(chalk.green(`\n✓ Remote "${remoteName}" added.\n`));
      } catch (error) {
        console.log(chalk.red("Could not add remote: " + error.message));
        return;
      }
    } else {
      return;
    }
  }

  // Select remote if multiple
  let selectedRemote = "origin";
  const updatedRemotes = await getRemotes();

  if (updatedRemotes.length > 1) {
    const { remote } = await inquirer.prompt([
      {
        type: "list",
        name: "remote",
        message: "Select remote:",
        choices: updatedRemotes.map((r) => ({
          name: `${r.name} (${r.refs.push})`,
          value: r.name,
        })),
      },
    ]);
    selectedRemote = remote;
  }

  // Confirm push
  console.log(chalk.cyan(`\n📤 Push info:`));
  console.log(chalk.gray(`   Remote: `) + chalk.white(selectedRemote));
  console.log(chalk.gray(`   Branch: `) + chalk.white(currentBranch));
  if (status.ahead) {
    console.log(
      chalk.gray(`   Commit count: `) + chalk.green(`${status.ahead} commits`),
    );
  }
  console.log("");

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: `Do you want to push?`,
      default: true,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow("Push cancelled."));
    return;
  }

  const spinner = ora(
    `Pushing to ${selectedRemote}/${currentBranch}...`,
  ).start();

  try {
    await pushToRemote(selectedRemote, currentBranch);
    spinner.succeed(chalk.green("Push successful!"));
  } catch (error) {
    spinner.fail(chalk.red("Push failed!"));

    if (error.message.includes("rejected")) {
      console.log(
        chalk.yellow("\n⚠️  Push rejected. You may need to pull first."),
      );

      const { shouldPull } = await inquirer.prompt([
        {
          type: "confirm",
          name: "shouldPull",
          message: "Would you like to pull?",
          default: true,
        },
      ]);

      if (shouldPull) {
        const pullSpinner = ora("Pulling...").start();
        try {
          await pullFromRemote(selectedRemote, currentBranch);
          pullSpinner.succeed("Pull successful!");

          // Try push again
          const retrySpinner = ora("Retrying push...").start();
          await pushToRemote(selectedRemote, currentBranch);
          retrySpinner.succeed(chalk.green("Push successful!"));
        } catch (pullError) {
          pullSpinner.fail("Pull failed: " + pullError.message);
        }
      }
    } else if (error.message.includes("no upstream")) {
      // Set upstream and push
      console.log(chalk.yellow("\n⚠️  Upstream branch not set."));

      const { setUpstream } = await inquirer.prompt([
        {
          type: "confirm",
          name: "setUpstream",
          message: `Set upstream to ${selectedRemote}/${currentBranch}?`,
          default: true,
        },
      ]);

      if (setUpstream) {
        const upstreamSpinner = ora(
          "Setting upstream and pushing...",
        ).start();
        try {
          await getGit().push(["-u", selectedRemote, currentBranch]);
          upstreamSpinner.succeed(
            chalk.green("Upstream set and push successful!"),
          );
        } catch (upstreamError) {
          upstreamSpinner.fail("Operation failed: " + upstreamError.message);
        }
      }
    } else {
      console.log(chalk.red("Error: " + error.message));
    }
  }
}

module.exports = {
  pushChanges,
};
