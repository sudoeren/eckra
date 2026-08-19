const {
  getGitStatus,
  stageAll,
  getStagedDiff,
  createCommit,
} = require("../../helpers/git");
const { generateCommitSuggestions } = require("../../helpers/ai");
const { copyToClipboard } = require("../../helpers/clipboard");
const { s, pause } = require("../common");
const { open, prompt, spinner, done, fail } = require("../screen");

async function pickSuggestion(suggestions) {
  console.log(s.muted("\n  AI Suggestions:\n"));
  const getSubject = (msg) => msg.split("\n")[0].substring(0, 72);

  const { selected } = await prompt([
    {
      type: "list",
      name: "selected",
      message: s.muted("Pick one:"),
      choices: suggestions.map((msg, i) => ({
        name: `  ${i + 1}. ${s.text(getSubject(msg))}`,
        value: msg,
      })),
      pageSize: 15,
    },
  ]);
  return selected;
}

async function askForManualMessage(promptMessage) {
  const { manual } = await prompt([
    {
      type: "input",
      name: "manual",
      message: s.muted(promptMessage),
    },
  ]);
  return manual ? manual.trim() : "";
}

/**
 * aicommits-style flow: generate a commit message, show it, ask for
 * confirmation, and commit on approval.
 *
 * Options:
 * - instruction: optional direction for the AI
 * - all: stage all changes first
 * - yes: skip the confirmation prompt
 * - generate: how many suggestions to produce (default 1)
 * - noCommit: only show the message, never commit
 */
async function doCommit(info, opts = {}) {
  const {
    instruction = null,
    all = false,
    yes = false,
    noCommit = false,
    type = null,
    clipboard = false,
    noVerify = false,
  } = opts;
  let generate = parseInt(opts.generate, 10);
  if (!Number.isFinite(generate) || generate < 1) generate = 1;

  open("Commit");

  let status = info?.status || (await getGitStatus());

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

  if (status.staged.length === 0) {
    if (all) {
      await stageAll();
      status = await getGitStatus();
    } else {
      const { stageFirst } = await prompt([
        {
          type: "confirm",
          name: "stageFirst",
          message: s.warning("No staged files. Stage all?"),
          default: true,
        },
      ]);
      if (!stageFirst) return;
      await stageAll();
      status = await getGitStatus();
    }
  }

  // 1. Generate the message
  let message;
  const spin = spinner("Generating AI commit message...");
  spin.start();

  try {
    const diff = await getStagedDiff();

    if (generate > 1) {
      const suggestions = await generateCommitSuggestions(
        diff,
        status.staged,
        generate,
        instruction,
        { type }
      );
      spin.stop();
      message = await pickSuggestion(suggestions);
    } else {
      const [suggestion] = await generateCommitSuggestions(
        diff,
        status.staged,
        1,
        instruction,
        { type }
      );
      spin.stop();
      message = suggestion;
    }
  } catch (err) {
    fail(spin, `AI error: ${err.message}`);
    const manual = await askForManualMessage(
      "Write your own message (empty to cancel):"
    );
    if (!manual) return;
    message = manual;
  }

  // 2. Show the message
  console.log(s.muted("\n  Commit message:\n"));
  message.split("\n").forEach((line) => console.log(s.text("    " + line)));
  console.log();

  if (noCommit) {
    console.log(s.muted("  (--no-commit: nothing committed)"));
    await pause();
    return;
  }

  if (clipboard) {
    const copied = await copyToClipboard(message);
    if (copied) {
      console.log(s.success("\n  ✓ Copied to clipboard."));
    } else {
      console.log(
        s.warning(
          "\n  ⚠ Could not copy to clipboard (no pbcopy/xclip/wl-copy found)."
        )
      );
    }
    await pause();
    return;
  }

  // 3. Confirm
  let confirmed = yes;
  if (!yes) {
    const { confirm } = await prompt([
      {
        type: "confirm",
        name: "confirm",
        message: s.muted("Commit with this message?"),
        default: true,
      },
    ]);
    confirmed = confirm;
  }

  if (!confirmed) {
    const manual = await askForManualMessage(
      "Write your own message (empty to cancel):"
    );
    if (!manual) return;
    message = manual;
  }

  // 4. Commit
  const spinCommit = spinner("Creating commit...");
  spinCommit.start();
  try {
    const result = await createCommit(message, { noVerify });
    done(spinCommit, `Commit: ${result.commit.substring(0, 7)}`);
  } catch (err) {
    fail(spinCommit, `Commit failed: ${err.message}`);
    await pause();
  }
}

module.exports = { doCommit };
