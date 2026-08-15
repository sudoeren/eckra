const {
  getGitStatus,
  getStagedDiff,
  getUnstagedDiff,
} = require("../../helpers/git");
const { s, pause, clear } = require("../common");
const { open, menuItem, backItem, sep, prompt } = require("../screen");
const { renderDiff } = require("../diff-view");

async function doDiff() {
  open("Diff", "Review your changes before committing");

  const status = await getGitStatus();

  if (
    status.staged.length === 0 &&
    status.modified.length === 0 &&
    status.deleted.length === 0
  ) {
    console.log(s.muted("  No changes.\n"));
    await pause();
    return;
  }

  const { type } = await prompt([
    {
      type: "list",
      name: "type",
      message: s.muted("Which changes to show?"),
      choices: [
        menuItem("staged", `Staged (${status.staged.length})`, "success", "staged"),
        menuItem(
          "modified",
          `Unstaged (${status.modified.length + status.deleted.length})`,
          "warning",
          "unstaged",
        ),
        backItem(),
      ],
    },
  ]);

  if (type === "back") return;

  const { view } = await prompt([
    {
      type: "list",
      name: "view",
      message: s.muted("View mode:"),
      choices: [
        menuItem("diff", "Unified", "text", "unified"),
        menuItem("diff", "Side-by-side", "primary", "side"),
        backItem(),
      ],
    },
  ]);

  if (view === "back") return;

  const diff = type === "staged" ? await getStagedDiff() : await getUnstagedDiff();

  if (!diff) {
    console.log(s.muted("\n  No diff.\n"));
    await pause();
    return;
  }

  clear();
  console.log(s.bold(`\n  ${type === "staged" ? "Staged" : "Unstaged"} Diff\n`));

  const lines = renderDiff(diff, { sideBySide: view === "side" });
  if (lines.length === 0) {
    console.log(s.muted("  No diff.\n"));
  } else {
    for (const line of lines) console.log(line);
  }

  console.log();
  await pause();
}

module.exports = { doDiff };
