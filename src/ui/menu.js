const inquirer = require("inquirer");
const chalk = require("chalk");
const ora = require("ora");
const boxen = require("boxen");
const {
  getGitStatus,
  stageAll,
  stageFiles,
  unstageAll,
  getStagedDiff,
  pullFromRemote,
  fetchRemote,
  listStashes,
  stashChanges,
  popStash,
} = require("../helpers/git");
const { showStatus } = require("./status");
const { aiCommit } = require("./commit");
const { pushChanges } = require("./push");
const { branchMenu } = require("./branch");
const { showLog } = require("./log");
const { configMenu } = require("./config");
const { checkLMStudioConnection } = require("../helpers/lmstudio");

async function mainMenu() {
  let running = true;

  while (running) {
    const status = await getGitStatus();
    const lmStatus = await checkLMStudioConnection();

    // Status bar
    console.log("\n" + chalk.gray("─".repeat(60)));
    console.log(
      chalk.cyan("📁 Branch: ") +
      chalk.yellow(status.current) +
      chalk.gray(" | ") +
      chalk.green("✓ Staged: ") +
      chalk.white(status.staged.length) +
      chalk.gray(" | ") +
      chalk.red("● Modified: ") +
      chalk.white(status.modified.length) +
      chalk.gray(" | ") +
      chalk.blue("? Untracked: ") +
      chalk.white(status.not_added.length) +
      chalk.gray(" | ") +
      (lmStatus.connected
        ? chalk.green("🤖 AI: Online")
        : chalk.red("🤖 AI: Offline")),
    );
    console.log(chalk.gray("─".repeat(60)) + "\n");

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What would you like to do?",
        choices: [
          {
            name:
              chalk.green("📊 View Status") +
              chalk.gray(" - Show detailed Git status"),
            value: "status",
          },
          {
            name:
              chalk.yellow("➕ Add Files (Stage)") +
              chalk.gray(" - Add changes to stage"),
            value: "stage",
          },
          {
            name:
              chalk.magenta("➖ Unstage") +
              chalk.gray(" - Remove files from stage"),
            value: "unstage",
          },
          new inquirer.Separator(),
          {
            name:
              chalk.cyan("💬 AI Commit") +
              chalk.gray(" - Create smart commit message with AI"),
            value: "commit",
          },
          {
            name:
              chalk.blue("⬆️  Push") +
              chalk.gray(" - Push changes to remote repo"),
            value: "push",
          },
          {
            name:
              chalk.blue("⬇️  Pull") +
              chalk.gray(" - Pull changes from remote repo"),
            value: "pull",
          },
          {
            name:
              chalk.blue("🔄 Fetch") +
              chalk.gray(" - Update remote repo info"),
            value: "fetch",
          },
          new inquirer.Separator(),
          {
            name:
              chalk.yellow("🌿 Branch Management") +
              chalk.gray(" - Branch operations"),
            value: "branch",
          },
          {
            name:
              chalk.gray("📜 Commit History") +
              chalk.gray(" - View recent commits"),
            value: "log",
          },
          {
            name:
              chalk.gray("📦 Stash Management") +
              chalk.gray(" - Save/restore changes"),
            value: "stash",
          },
          new inquirer.Separator(),
          {
            name:
              chalk.gray("⚙️  Settings") +
              chalk.gray(" - LM Studio and app settings"),
            value: "config",
          },
          { name: chalk.red("🚪 Exit"), value: "exit" },
        ],
        pageSize: 15,
      },
    ]);

    switch (action) {
      case "status":
        await showStatus();
        break;
      case "stage":
        await stageMenu();
        break;
      case "unstage":
        await unstageMenu();
        break;
      case "commit":
        await aiCommit();
        break;
      case "push":
        await pushChanges();
        break;
      case "pull":
        await pullMenu();
        break;
      case "fetch":
        await fetchMenu();
        break;
      case "branch":
        await branchMenu();
        break;
      case "log":
        await showLog();
        break;
      case "stash":
        await stashMenu();
        break;
      case "config":
        await configMenu();
        break;
      case "exit":
        running = false;
        console.log(
          boxen(
            chalk.cyan("Goodbye! 👋\n") +
            chalk.gray("Thanks for using our Git tool."),
            { padding: 1, borderStyle: "round", borderColor: "cyan" },
          ),
        );
        break;
    }
  }
}

async function stageMenu() {
  const status = await getGitStatus();
  const unstaged = [...status.modified, ...status.not_added, ...status.deleted];

  if (unstaged.length === 0) {
    console.log(chalk.yellow("\n⚠️  No changes to stage.\n"));
    return;
  }

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "Stage operation:",
      choices: [
        { name: "📁 Stage all files", value: "all" },
        { name: "📄 Select files", value: "select" },
        { name: "↩️  Back", value: "back" },
      ],
    },
  ]);

  if (action === "back") return;

  const spinner = ora();

  if (action === "all") {
    spinner.start("Staging all files...");
    await stageAll();
    spinner.succeed(chalk.green("All files staged!"));
  } else {
    const { files } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "files",
        message: "Select files to stage:",
        choices: unstaged.map((file) => ({
          name: file,
          value: file,
          checked: false,
        })),
      },
    ]);

    if (files.length > 0) {
      spinner.start("Staging files...");
      await stageFiles(files);
      spinner.succeed(chalk.green(`${files.length} files staged!`));
    }
  }
}

async function unstageMenu() {
  const status = await getGitStatus();

  if (status.staged.length === 0) {
    console.log(chalk.yellow("\n⚠️  No files in stage.\n"));
    return;
  }

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "Unstage operation:",
      choices: [
        { name: "📁 Unstage all files", value: "all" },
        { name: "📄 Select files", value: "select" },
        { name: "↩️  Back", value: "back" },
      ],
    },
  ]);

  if (action === "back") return;

  const spinner = ora();

  if (action === "all") {
    spinner.start("Unstaging all files...");
    await unstageAll();
    spinner.succeed(chalk.green("All files unstaged!"));
  } else {
    const { files } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "files",
        message: "Select files to unstage:",
        choices: status.staged.map((file) => ({
          name: file,
          value: file,
          checked: false,
        })),
      },
    ]);

    if (files.length > 0) {
      spinner.start("Unstaging files...");
      const { unstageFiles } = require("../helpers/git");
      await unstageFiles(files);
      spinner.succeed(chalk.green(`${files.length} files unstaged!`));
    }
  }
}

async function waitForKey() {
  await inquirer.prompt([
    {
      type: "input",
      name: "continue",
      message: chalk.gray("Press Enter to continue..."),
      prefix: "",
    },
  ]);
}

async function pullMenu() {
  const spinner = ora("Pulling changes...").start();

  try {
    const result = await pullFromRemote();
    spinner.succeed(chalk.green("Pull successful!"));

    if (result.summary) {
      console.log(
        chalk.gray(
          `  Changes: ${result.summary.changes} files, +${result.summary.insertions} -${result.summary.deletions}`,
        ),
      );
    }
  } catch (error) {
    spinner.fail(chalk.red("Pull failed: " + error.message));
  }
  await waitForKey();
}

async function fetchMenu() {
  const spinner = ora("Fetching...").start();

  try {
    await fetchRemote();
    spinner.succeed(chalk.green("Fetch successful!"));
  } catch (error) {
    spinner.fail(chalk.red("Fetch failed: " + error.message));
  }
  await waitForKey();
}

async function stashMenu() {
  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "Stash operation:",
      choices: [
        { name: "📦 Stash changes", value: "save" },
        { name: "📤 Pop last stash", value: "pop" },
        { name: "📋 Stash list", value: "list" },
        { name: "↩️  Back", value: "back" },
      ],
    },
  ]);

  if (action === "back") return;

  const spinner = ora();

  if (action === "save") {
    const { message } = await inquirer.prompt([
      {
        type: "input",
        name: "message",
        message: "Stash message (optional):",
        default: "",
      },
    ]);

    spinner.start("Stashing changes...");
    try {
      await stashChanges(message || null);
      spinner.succeed(chalk.green("Changes stashed!"));
    } catch (error) {
      spinner.fail(chalk.red("Stash failed: " + error.message));
    }
  } else if (action === "pop") {
    spinner.start("Popping stash...");
    try {
      await popStash();
      spinner.succeed(chalk.green("Stash popped!"));
    } catch (error) {
      spinner.fail(chalk.red("Stash pop failed: " + error.message));
    }
  } else if (action === "list") {
    try {
      const stashes = await listStashes();
      if (stashes.all.length === 0) {
        console.log(chalk.yellow("\n⚠️  Stash list is empty.\n"));
      } else {
        console.log(chalk.cyan("\n📦 Stash List:"));
        stashes.all.forEach((stash, index) => {
          console.log(chalk.gray(`  ${index}: `) + chalk.white(stash.message));
        });
        console.log("");
      }
    } catch (error) {
      console.log(chalk.red("Could not get stash list: " + error.message));
    }
  }
}

module.exports = {
  mainMenu,
};
