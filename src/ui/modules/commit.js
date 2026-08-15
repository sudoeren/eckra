const {
  getGitStatus,
  stageAll,
  getStagedDiff,
  createCommit,
} = require("../../helpers/git");
const {
  generateCommitSuggestions,
  checkAIConnection,
} = require("../../helpers/ai");
const { s, pause, clear, header } = require("../common");
const {
  open,
  menuItem,
  backItem,
  sep,
  prompt,
  spinner,
  done,
  fail,
} = require("../screen");
const { renderDiff } = require("../diff-view");
const { doPush } = require("./sync");

async function showReviewDiff() {
  const diff = await getStagedDiff();
  if (!diff) {
    console.log(s.muted("\n  No staged changes to show.\n"));
    await pause();
    return;
  }

  clear();
  console.log(s.bold("\n  Review Staged Diff\n"));

  const lines = renderDiff(diff);
  if (lines.length === 0) {
    console.log(s.muted("  No staged changes.\n"));
  } else {
    for (const line of lines) console.log(line);
  }

  console.log();
  await pause();
}

async function doCommit(info) {
  open("Commit");

  let status = info?.status || (await getGitStatus());

  // No changes at all
  if (
    status.staged.length === 0 &&
    status.modified.length === 0 &&
    status.not_added.length === 0 &&
    status.deleted.length === 0
  ) {
    console.log(s.muted("  No changes to commit.\n"));
    await pause();
    return;
  }

  // No staged files - stage first
  if (status.staged.length === 0) {
    const { doStageFirst } = await prompt([
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
      console.log(
        s.muted(`    ... and ${status.staged.length - 5} more files`)
      );
    console.log();

    const choices = [];
    if (ai.connected) {
      choices.push(menuItem("Suggest message with AI", "ai", "ai"));
    }
    choices.push(menuItem("Write my own", "text", "custom"));
    choices.push(menuItem("Review Diff", "success", "diff"));
    choices.push(sep());
    choices.push(backItem());

    const { action } = await prompt([
      {
        type: "list",
        name: "action",
        message: s.muted("Choose action:"),
        choices,
        loop: true,
        pageSize: 20,
      },
    ]);
    if (action === "back") return;
    if (action === "diff") {
      await showReviewDiff();
      continue;
    }

    if (action === "ai") {
      const spin = spinner("AI is thinking...");
      spin.start();

      try {
        const diff = await getStagedDiff();
        const suggestions = await generateCommitSuggestions(
          diff,
          status.staged,
          3
        );
        spin.stop();

        console.log(s.muted("\n  AI Suggestions:\n"));

        const getSubject = (msg) => msg.split("\n")[0].substring(0, 72);

        const { selected } = await prompt([
          {
            type: "list",
            name: "selected",
            message: s.muted("Pick one:"),
            choices: [
              ...suggestions.map((msg, i) => ({
                name: `  ${i + 1}. ${s.text(getSubject(msg))}`,
                value: msg,
              })),
              sep(),
              backItem("Back"),
            ],
            loop: true,
            pageSize: 20,
          },
        ]);

        if (selected === "back") continue;

        console.log(s.muted("\n  Selected message:\n"));
        selected
          .split("\n")
          .forEach((line) => console.log(s.text("    " + line)));
        console.log();

        const { aiAction } = await prompt([
          {
            type: "list",
            name: "aiAction",
            message: s.muted("Action:"),
            choices: [
              menuItem("Use as is", "success", "use"),
              menuItem("Edit subject line", "text", "edit"),
              menuItem("Regenerate", "primary", "regenerate"),
              backItem("Back"),
            ],
            loop: true,
            pageSize: 20,
          },
        ]);

        if (aiAction === "back" || aiAction === "regenerate") continue;
        if (aiAction === "use") {
          message = selected;
        } else {
          const subject = getSubject(selected);
          const body = selected.split("\n").slice(1).join("\n");

          const { editedSubject } = await prompt([
            {
              type: "input",
              name: "editedSubject",
              message: s.muted("Edit subject line:"),
              default: subject,
              validate: (v) => v.length > 0 || "Subject cannot be empty",
            },
          ]);

          message = body ? `${editedSubject}\n\n${body.trim()}` : editedSubject;
        }
      } catch (err) {
        fail(spin, "AI error: " + err.message);
        await pause();
      }
    }

    if (action === "custom") {
      const { custom } = await prompt([
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
  console.log(s.muted("\n  Commit message:\n"));
  message.split("\n").forEach((line) => console.log(s.text("    " + line)));
  console.log();

  const { confirm } = await prompt([
    {
      type: "confirm",
      name: "confirm",
      message: s.muted("Should I commit?"),
      default: true,
    },
  ]);

  if (!confirm) return;

  const spin = spinner("Creating commit...");
  spin.start();

  try {
    const result = await createCommit(message);
    done(spin, `Commit: ${result.commit.substring(0, 7)}`);

    // Suggest push
    const { doPushNow } = await prompt([
      {
        type: "confirm",
        name: "doPushNow",
        message: s.muted("Would you like to push?"),
        default: false,
      },
    ]);

    if (doPushNow) await doPush();
  } catch (err) {
    fail(spin, `Error: ${err.message}`);
    await pause();
  }
}

module.exports = { doCommit };
