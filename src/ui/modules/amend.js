const { getLastCommit, amendCommit } = require("../../helpers/git");
const { s, sleep, pause } = require("../common");
const {
  open,
  emptyState,
  prompt,
  spinner,
  done,
  confirmAction,
} = require("../screen");

async function doAmend() {
  open("Amend", "Rewrite the most recent commit message");

  const lastCommit = await getLastCommit();

  if (!lastCommit) {
    emptyState("No commit to amend.");
    await pause();
    return;
  }

  console.log(s.muted("  Current message:"));
  console.log(s.text(`  "${lastCommit.message}"\n`));

  const { newMessage } = await prompt([
    {
      type: "input",
      name: "newMessage",
      message: s.muted("New message:"),
      default: lastCommit.message,
      validate: (v) => v.length > 0,
    },
  ]);

  if (newMessage !== lastCommit.message) {
    const ok = await confirmAction("Rewrite the commit message?");
    if (!ok) {
      console.log(s.muted("  Amend cancelled."));
      await sleep(600);
      return;
    }

    const spin = spinner("Updating...");
    spin.start();
    await amendCommit(newMessage);
    done(spin, "Commit message updated!");
    await sleep(600);
  }
}

module.exports = { doAmend };
