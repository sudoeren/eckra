const inquirer = require("inquirer");
const { getGitStatus, getStagedDiff, getUnstagedDiff } = require("../../helpers/git");
const { s, header, clear, pause } = require("../common");

async function doDiff() {
  clear();
  header();
  console.log(s.bold("  Diff\n"));

  const status = await getGitStatus();

  if (status.staged.length === 0 && status.modified.length === 0) {
    console.log(s.muted("  No changes.\n"));
    await pause();
    return;
  }

  const { type } = await inquirer.prompt([
    {
      type: "list",
      name: "type",
      message: s.muted("Which changes to show?"),
      choices: [
        {
          name: s.success(`  Staged (${status.staged.length})`),
          value: "staged",
        },
        {
          name: s.warning(`  Unstaged (${status.modified.length})`),
          value: "unstaged",
        },
        { name: s.muted("  ← Back"), value: "back" },
      ],
    },
  ]);

  if (type === "back") return;

  const diff =
    type === "staged" ? await getStagedDiff() : await getUnstagedDiff();

  if (!diff) {
    console.log(s.muted("\n  No diff.\n"));
    await pause();
    return;
  }

  clear();
  console.log();

  // Colored diff
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

module.exports = { doDiff };
