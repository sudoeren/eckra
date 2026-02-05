const inquirer = require("inquirer");
const ora = require("ora");
const { getGitStatus, stageAll, getStagedDiff, createCommit } = require("../../helpers/git");
const { generateCommitSuggestions, checkAIConnection } = require("../../helpers/ai");
const { s, header, clear, pause } = require("../common");
const { doPush } = require("./sync");

async function showReviewDiff() {
  const diff = await getStagedDiff();
  if (!diff) {
    console.log(s.muted("\n  No staged changes to show.\n"));
    await pause();
    return;
  }

  clear();
  console.log(s.bold("  Review Staged Diff\n"));

  diff.split("\n").forEach((line) => {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      console.log(s.success(line));
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      console.log(s.error(line));
    } else if (line.startsWith("@@")) {
      console.log(s.primary(line));
    } else {
      console.log(s.muted(line));
    }
  });

  console.log();
  await pause();
}

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

  let message;
  const ai = await checkAIConnection();

  while (!message) {
    clear();
    header();
    console.log(s.bold("  Commit\n"));
    console.log(s.muted("  Files to commit:"));
    status.staged
      .slice(0, 5)
      .forEach((f) => console.log(s.success(`    + ${f}`)));
    if (status.staged.length > 5)
      console.log(s.muted(`    ... and ${status.staged.length - 5} more files`));
    console.log();

    const choices = [];
    if (ai.connected) {
      choices.push({ name: s.primary("  🤖 Suggest message with AI"), value: "ai" });
    }
    choices.push({ name: s.white("  ✎ Write my own"), value: "custom" });
    choices.push({ name: s.success("  🔍 Review Diff"), value: "diff" });
    choices.push({ type: "separator", line: " " });
    choices.push({ name: s.muted("  ← Cancel"), value: "cancel" });

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: s.muted("Choose action:"),
        choices,
        loop: false,
      },
    ]);

    if (action === "cancel") return;
    if (action === "diff") {
      await showReviewDiff();
      continue;
    }

    if (action === "ai") {
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
            message: s.muted("Pick one:"),
            choices: [
              ...suggestions.map((msg, i) => ({
                name: `  ${i + 1}. ${s.text(msg)}`,
                value: msg,
              })),
              { type: "separator", line: " " },
              { name: s.muted("  ← Back"), value: "_back" },
            ],
            loop: false,
          },
        ]);

        if (selected === "_back") continue;

        const { aiAction } = await inquirer.prompt([
          {
            type: "list",
            name: "aiAction",
            message: s.muted("Action for: ") + s.text(selected),
            choices: [
              { name: "  ✓ Use as is", value: "use" },
              { name: "  ✎ Edit", value: "edit" },
              { name: "  ← Back", value: "back" },
            ],
          },
        ]);

        if (aiAction === "back") continue;
        if (aiAction === "use") {
          message = selected;
        } else {
          const { edited } = await inquirer.prompt([
            {
              type: "input",
              name: "edited",
              message: s.muted("Edit commit message:"),
              default: selected,
              validate: (v) => v.length > 0 || "Message cannot be empty",
            },
          ]);
          message = edited;
        }
      } catch (err) {
        spin.fail(s.error(" AI error: " + err.message));
        await pause();
      }
    }

    if (action === "custom") {
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
