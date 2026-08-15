const { getLastCommit, undoLastCommit } = require("../../helpers/git");
const { s, pause, timeAgo } = require("../common");
const { open, emptyState, prompt, spinner, done } = require("../screen");

async function doUndo() {
  open("Undo", "Revert the most recent commit (changes are preserved)");

  const lastCommit = await getLastCommit();

  if (!lastCommit) {
    emptyState("No commit to undo.");
    await pause();
    return;
  }

  console.log(s.muted("  Last commit:"));
  console.log(
    s.text(`  ${lastCommit.hash.substring(0, 7)} - ${lastCommit.message}`)
  );
  console.log(
    s.muted(`  ${lastCommit.author_name} · ${timeAgo(lastCommit.date)}\n`)
  );

  const { confirm } = await prompt([
    {
      type: "confirm",
      name: "confirm",
      message: s.warning("Undo this commit? (changes will be preserved)"),
      default: false,
    },
  ]);

  if (confirm) {
    const spin = spinner("Undoing...");
    spin.start();
    await undoLastCommit();
    done(spin, "Commit undone! Changes are still staged.");
    await pause();
  }
}

module.exports = { doUndo };
