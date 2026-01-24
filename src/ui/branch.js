const inquirer = require("inquirer");
const chalk = require("chalk");
const ora = require("ora");
const Table = require("cli-table3");
const {
  getBranches,
  getCurrentBranch,
  createBranch,
  switchBranch,
  deleteBranch,
  mergeBranch,
} = require("../helpers/git");

async function branchMenu() {
  let running = true;

  while (running) {
    const branches = await getBranches();
    const current = branches.current;

    // Show branches
    console.log(chalk.cyan("\n🌿 Branches:"));

    const table = new Table({
      head: [chalk.cyan("Branch"), chalk.cyan("Status")],
      colWidths: [40, 20],
      style: { head: [], border: ["gray"] },
    });

    // Local branches
    branches.all
      .filter((b) => !b.startsWith("remotes/"))
      .forEach((branch) => {
        const isCurrent = branch === current;
        table.push([
          isCurrent ? chalk.green("* " + branch) : chalk.white("  " + branch),
          isCurrent ? chalk.green("active") : "",
        ]);
      });

    console.log(table.toString());

    // Remote branches (simplified)
    const remoteBranches = branches.all.filter((b) => b.startsWith("remotes/"));
    if (remoteBranches.length > 0) {
      console.log(
        chalk.gray(`\n   📡 ${remoteBranches.length} remote branches available\n`),
      );
    }

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "Branch operation:",
        choices: [
          { name: chalk.green("➕ Create new branch"), value: "create" },
          { name: chalk.blue("🔄 Switch branch"), value: "switch" },
          { name: chalk.yellow("🔀 Merge branch"), value: "merge" },
          { name: chalk.red("🗑️  Delete branch"), value: "delete" },
          new inquirer.Separator(),
          { name: chalk.gray("↩️  Return to main menu"), value: "back" },
        ],
      },
    ]);

    switch (action) {
      case "create":
        await createNewBranch();
        break;
      case "switch":
        await switchToBranch();
        break;
      case "merge":
        await mergeBranchMenu();
        break;
      case "delete":
        await deleteBranchMenu();
        break;
      case "back":
        running = false;
        break;
    }
  }
}

async function createNewBranch() {
  const { branchName } = await inquirer.prompt([
    {
      type: "input",
      name: "branchName",
      message: "New branch name:",
      validate: (input) => {
        if (!input) return "Branch name cannot be empty";
        if (input.includes(" ")) return "Branch name cannot contain spaces";
        return true;
      },
    },
  ]);

  const spinner = ora(`Creating branch "${branchName}"...`).start();

  try {
    await createBranch(branchName);
    spinner.succeed(
      chalk.green(`Branch "${branchName}" created and switched to!`),
    );
  } catch (error) {
    spinner.fail(chalk.red("Failed to create branch: " + error.message));
  }
}

async function switchToBranch() {
  const branches = await getBranches();
  const current = branches.current;

  const localBranches = branches.all.filter(
    (b) => !b.startsWith("remotes/") && b !== current,
  );

  if (localBranches.length === 0) {
    console.log(chalk.yellow("\n⚠️  No other branch to switch to.\n"));
    return;
  }

  const { targetBranch } = await inquirer.prompt([
    {
      type: "list",
      name: "targetBranch",
      message: "Branch to switch to:",
      choices: [
        ...localBranches.map((b) => ({ name: b, value: b })),
        new inquirer.Separator(),
        { name: chalk.gray("Cancel"), value: null },
      ],
    },
  ]);

  if (!targetBranch) return;

  const spinner = ora(`Switching to "${targetBranch}" branch...`).start();

  try {
    await switchBranch(targetBranch);
    spinner.succeed(chalk.green(`Switched to "${targetBranch}" branch!`));
  } catch (error) {
    spinner.fail(chalk.red("Failed to switch: " + error.message));

    if (error.message.includes("uncommitted")) {
      console.log(
        chalk.yellow(
          "\n⚠️  You have uncommitted changes. Please commit or stash them first.\n",
        ),
      );
    }
  }
}

async function mergeBranchMenu() {
  const branches = await getBranches();
  const current = branches.current;

  const localBranches = branches.all.filter(
    (b) => !b.startsWith("remotes/") && b !== current,
  );

  if (localBranches.length === 0) {
    console.log(chalk.yellow("\n⚠️  No other branch to merge.\n"));
    return;
  }

  const { sourceBranch } = await inquirer.prompt([
    {
      type: "list",
      name: "sourceBranch",
      message: `Which branch do you want to merge with "${current}"?`,
      choices: [
        ...localBranches.map((b) => ({ name: b, value: b })),
        new inquirer.Separator(),
        { name: chalk.gray("Cancel"), value: null },
      ],
    },
  ]);

  if (!sourceBranch) return;

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: `Do you want to merge "${sourceBranch}" → "${current}"?`,
      default: true,
    },
  ]);

  if (!confirm) return;

  const spinner = ora(`Merging "${sourceBranch}"...`).start();

  try {
    await mergeBranch(sourceBranch);
    spinner.succeed(chalk.green(`"${sourceBranch}" merged successfully!`));
  } catch (error) {
    spinner.fail(chalk.red("Merge failed: " + error.message));

    if (
      error.message.includes("conflict") ||
      error.message.includes("CONFLICT")
    ) {
      console.log(
        chalk.yellow(
          "\n⚠️  Merge conflict occurred. You need to resolve conflicts manually.\n",
        ),
      );
    }
  }
}

async function deleteBranchMenu() {
  const branches = await getBranches();
  const current = branches.current;

  const localBranches = branches.all.filter(
    (b) => !b.startsWith("remotes/") && b !== current,
  );

  if (localBranches.length === 0) {
    console.log(chalk.yellow("\n⚠️  No other branch to delete.\n"));
    return;
  }

  const { targetBranch } = await inquirer.prompt([
    {
      type: "list",
      name: "targetBranch",
      message: "Branch to delete:",
      choices: [
        ...localBranches.map((b) => ({ name: chalk.red(b), value: b })),
        new inquirer.Separator(),
        { name: chalk.gray("Cancel"), value: null },
      ],
    },
  ]);

  if (!targetBranch) return;

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: `Are you sure you want to delete "${targetBranch}" branch?`,
      default: false,
    },
  ]);

  if (!confirm) return;

  const spinner = ora(`Deleting "${targetBranch}"...`).start();

  try {
    await deleteBranch(targetBranch);
    spinner.succeed(chalk.green(`"${targetBranch}" deleted!`));
  } catch (error) {
    if (error.message.includes("not fully merged")) {
      spinner.warn(chalk.yellow("Branch is not fully merged yet."));

      const { forceDelete } = await inquirer.prompt([
        {
          type: "confirm",
          name: "forceDelete",
          message: "Do you want to force delete? (changes may be lost)",
          default: false,
        },
      ]);

      if (forceDelete) {
        const forceSpinner = ora("Force deleting...").start();
        try {
          await deleteBranch(targetBranch, true);
          forceSpinner.succeed(chalk.green(`"${targetBranch}" force deleted!`));
        } catch (forceError) {
          forceSpinner.fail(
            chalk.red("Delete failed: " + forceError.message),
          );
        }
      }
    } else {
      spinner.fail(chalk.red("Delete failed: " + error.message));
    }
  }
}

module.exports = {
  branchMenu,
};
