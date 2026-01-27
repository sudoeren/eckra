const inquirer = require("inquirer");
const ora = require("ora");
const { getGitStatus, stageAll, getStagedDiff, createCommit } = require("../../helpers/git");
const { generateCommitSuggestions, checkAIConnection } = require("../../helpers/ai");
const { s, header, clear, pause } = require("../common");
const { doPush } = require("./sync");

async function doCommit(info) {
  clear();
  header();
  console.log(s.bold("  Commit\n"));

  let status = info?.status || (await getGitStatus());

  // No changes at all
  if (
    status.staged.length === 0 &&
    status.modified.length === 0 &&
    status.not_added.length === 0
  ) {
    console.log(s.muted("  No changes to commit.\n"));
    await pause();
    return;
  }

  // No staged files - stage first
  if (status.staged.length === 0) {
    const { doStageFirst } = await inquirer.prompt([
      {
        type: "confirm",
        name: "doStageFirst",
        message: s.warning("No staged files. Should I stage all?"),
        default: true,
      },
    ]);

    if (!doStageFirst) return;
    await stageAll();
    status = await getGitStatus();
  }

  // Show staged files
  console.log(s.muted("  Files to commit:"));
  status.staged
    .slice(0, 5)
    .forEach((f) => console.log(s.success(`    + ${f}`)));
  if (status.staged.length > 5)
    console.log(s.muted(`    ... and ${status.staged.length - 5} more files`));
  console.log();

  // AI message suggestion
  let message;
  const ai = await checkAIConnection();

  if (ai.connected) {
    const { useAI } = await inquirer.prompt([
      {
        type: "confirm",
        name: "useAI",
        message: s.primary("Should I suggest a commit message with AI?"),
        default: true,
      },
    ]);

    if (useAI) {
      const spin = ora({
        text: s.muted(" AI is thinking..."),
        spinner: "dots",
      }).start();

      try {
        const diff = await getStagedDiff();
        const suggestions = await generateCommitSuggestions(
          diff,
          status.staged,
          3,
        );
        spin.stop();

        console.log(s.muted("\n  AI Suggestions:\n"));

        const { selected } = await inquirer.prompt([
          {
            type: "list",
            name: "selected",
            message: s.muted("Pick one or write your own:"),
            choices: [
              ...suggestions.map((msg, i) => ({
                name: `  ${i + 1}. ${s.text(msg)}`,
                value: msg,
              })),
              { type: "separator", line: " " },
              { name: s.primary("  ✎ I'll write my own"), value: "_custom" },
              { name: s.muted("  ← Cancel"), value: "_cancel" },
            ],
          },
        ]);

        if (selected === "_cancel") return;
        if (selected !== "_custom") message = selected;
      } catch (err) {
        spin.fail(s.error(" AI error: " + err.message));
      }
    }
  } else {
    console.log(s.warning("  AI connection not available: " + (ai.error || "Unknown error")));
  }

  // Manual message
  if (!message) {
    const { custom } = await inquirer.prompt([
      {
        type: "input",
        name: "custom",
        message: s.muted("Commit message:"),
        validate: (v) => v.length > 0 || "Message cannot be empty",
      },
    ]);
    message = custom;
  }

  // Confirm
  console.log(s.muted("\n  Message: ") + s.text(message));

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: s.muted("Should I commit?"),
      default: true,
    },
  ]);

  if (!confirm) return;

  const spin = ora({
    text: s.muted(" Creating commit..."),
    spinner: "dots",
  }).start();

  try {
    const result = await createCommit(message);
    spin.succeed(s.success(` Commit: ${result.commit.substring(0, 7)}`));

    // Suggest push
    const { doPushNow } = await inquirer.prompt([
      {
        type: "confirm",
        name: "doPushNow",
        message: s.muted("Would you like to push?"),
        default: false,
      },
    ]);

    if (doPushNow) await doPush();
  } catch (err) {
    spin.fail(s.error(` Error: ${err.message}`));
    await pause();
  }
}

module.exports = { doCommit };
