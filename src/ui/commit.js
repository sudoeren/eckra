const inquirer = require("inquirer");
const chalk = require("chalk");
const ora = require("ora");
const boxen = require("boxen");
const {
  getGitStatus,
  getStagedDiff,
  createCommit,
  stageAll,
} = require("../helpers/git");
const {
  generateCommitMessage,
  generateCommitSuggestions,
  checkAIConnection,
} = require("../helpers/ai");
const { getConfig } = require("../helpers/config");
const { pushChanges } = require("./push");

async function aiCommit(manualMessage = null) {
  const status = await getGitStatus();

  // Check if there are staged changes
  if (status.staged.length === 0) {
    // Ask to stage all if there are changes
    const hasChanges =
      status.modified.length > 0 || status.not_added.length > 0;

    if (!hasChanges) {
      console.log(
        boxen(
          chalk.yellow("⚠️  No changes to commit.\n\n") +
          chalk.gray("First modify your files and stage them."),
          { padding: 1, borderStyle: "round", borderColor: "yellow" },
        ),
      );
      return;
    }

    const { shouldStage } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldStage",
        message:
          "No staged files. Would you like to stage all changes?",
        default: true,
      },
    ]);

    if (!shouldStage) {
      console.log(chalk.yellow("Operation cancelled."));
      return;
    }

    const spinner = ora("Staging files...").start();
    await stageAll();
    spinner.succeed("All files staged.");
  }

  // Get updated status and diff
  const updatedStatus = await getGitStatus();
  const diff = await getStagedDiff();
  const stagedFiles = updatedStatus.staged;

  console.log(chalk.cyan("\n📝 Staged files:"));
  stagedFiles.forEach((file) => {
    console.log(chalk.gray("   • ") + chalk.white(file));
  });
  console.log("");

  let commitMessage = manualMessage;

  if (!commitMessage) {
    const config = getConfig();
    const provider = config.aiProvider || "lmstudio";
    const aiStatus = await checkAIConnection();

    if (!aiStatus.connected) {
      console.log(
        boxen(
          chalk.yellow("⚠️  Could not connect to " + provider + "\n\n") +
          chalk.gray(
            "Check your " + provider + " configuration.\n",
          ) +
          chalk.gray("You can write a manual commit message."),
          { padding: 1, borderStyle: "round", borderColor: "yellow" },
        ),
      );

      const { useManual } = await inquirer.prompt([
        {
          type: "confirm",
          name: "useManual",
          message: "Would you like to write a manual commit message?",
          default: true,
        },
      ]);

      if (!useManual) {
        return;
      }

      const { message } = await inquirer.prompt([
        {
          type: "input",
          name: "message",
          message: "Commit message:",
          validate: (input) => input.length > 0 || "Commit message cannot be empty",
        },
      ]);

      commitMessage = message;
    } else {
      const { instruction } = await inquirer.prompt([
        {
          type: "input",
          name: "instruction",
          message: "Optional: Add instruction for AI (Enter to skip):",
          default: config.aiInstruction || "",
        },
      ]);

      while (!commitMessage) {
        const spinner = ora("Generating AI commit messages...").start();

        try {
          const suggestions = await generateCommitSuggestions(
            diff,
            stagedFiles,
            3,
            instruction,
          );
          spinner.succeed("Commit messages generated!");

          const { selectedMessage } = await inquirer.prompt([
            {
              type: "list",
              name: "selectedMessage",
              message: "Select a commit message or write your own:",
              choices: [
                ...suggestions.map((msg, i) => ({
                  name: chalk.cyan(`${i + 1}. `) + msg,
                  value: msg,
                })),
                new inquirer.Separator(),
                {
                  name: chalk.yellow("✏️  I'll write my own message"),
                  value: "custom",
                },
                {
                  name: chalk.green("🔄 Generate new suggestions"),
                  value: "regenerate",
                },
                { name: chalk.red("❌ Cancel"), value: "cancel" },
              ],
            },
          ]);

          if (selectedMessage === "cancel") {
            console.log(chalk.yellow("Operation cancelled."));
            return;
          }

          if (selectedMessage === "regenerate") {
            continue;
          }

          if (selectedMessage === "custom") {
            const { message } = await inquirer.prompt([
              {
                type: "input",
                name: "message",
                message: "Commit message:",
                validate: (input) =>
                  input.length > 0 || "Commit message cannot be empty",
              },
            ]);
            commitMessage = message;
          } else {
            commitMessage = selectedMessage;
          }
        } catch (error) {
          spinner.fail("AI message generation failed: " + error.message);

          const { message } = await inquirer.prompt([
            {
              type: "input",
              name: "message",
              message: "Manual commit message:",
              validate: (input) => input.length > 0 || "Commit message cannot be empty",
            },
          ]);
          commitMessage = message;
        }
      }
    }
  }

  // Confirm and create commit
  console.log(
    boxen(chalk.cyan("Commit Message:\n\n") + chalk.white(commitMessage), {
      padding: 1,
      borderStyle: "round",
      borderColor: "cyan",
    }),
  );

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: "Do you want to commit with this message?",
      default: true,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow("Commit cancelled."));
    return;
  }

  const commitSpinner = ora("Creating commit...").start();

  try {
    const result = await createCommit(commitMessage);
    commitSpinner.succeed(chalk.green("Commit created successfully!"));

    console.log(chalk.gray(`   Commit: ${result.commit}`));
    console.log(chalk.gray(`   Branch: ${result.branch}`));
    console.log(chalk.gray(`   Files: ${stagedFiles.length} files\n`));

    // Ask to push
    const { shouldPush } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldPush",
        message: "Would you like to push the commit?",
        default: false,
      },
    ]);

    if (shouldPush) {
      await pushChanges();
    }
  } catch (error) {
    commitSpinner.fail(chalk.red("Commit failed: " + error.message));
  }
}

module.exports = {
  aiCommit,
};
