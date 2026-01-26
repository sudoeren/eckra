const inquirer = require("inquirer");
const ora = require("ora");
const { getGitStatus, stageAll, stageFiles } = require("../../helpers/git");
const { s, header, clear, sleep, rows, pause } = require("../common");
const { doCommit } = require("./commit");

async function doStage(info) {
  clear();
  header();
  console.log(s.bold("  Stage\n"));

  const status = info?.status || (await getGitStatus());
  const files = [...status.modified, ...status.not_added];

  if (files.length === 0) {
    console.log(s.muted("  No changes.\n"));
    await pause();
    return;
  }

  // Categorize files
  const modifiedFiles = status.modified.map((f) => ({
    name: `  ${s.warning("~")} ${f}`,
    value: f,
    short: f,
  }));

  const untrackedFiles = status.not_added.map((f) => ({
    name: `  ${s.muted("+")} ${f}`,
    value: f,
    short: f,
  }));

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("What should I do?"),
      choices: [
        { name: s.success("  ✓ Stage All"), value: "all" },
        { name: s.text("  ◉ Select Files"), value: "select" },
        { name: s.muted("  ← Back"), value: "back" },
      ],
    },
  ]);

  if (action === "back") return;

  if (action === "all") {
    const spin = ora({ text: s.muted(" Staging..."), spinner: "dots" }).start();
    await stageAll();
    spin.succeed(s.success(" All staged!"));
    await sleep(500);

    // Redirect to commit
    const { goCommit } = await inquirer.prompt([
      {
        type: "confirm",
        name: "goCommit",
        message: s.muted("Would you like to commit?"),
        default: true,
      },
    ]);

    if (goCommit) await doCommit();
    return;
  }

  // Select files
  const { selected } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selected",
      message: s.muted("Select files (use space):"),
      choices: [
        ...(modifiedFiles.length > 0
          ? [{ type: "separator", line: s.muted("  Modified") }]
          : []),
        ...modifiedFiles,
        ...(untrackedFiles.length > 0
          ? [{ type: "separator", line: s.muted("  Untracked") }]
          : []),
        ...untrackedFiles,
      ],
      pageSize: rows() - 10,
    },
  ]);

  if (selected.length > 0) {
    await stageFiles(selected);
    console.log(s.success(`\n  ✓ ${selected.length} files staged!`));

    const { goCommit } = await inquirer.prompt([
      {
        type: "confirm",
        name: "goCommit",
        message: s.muted("Would you like to commit?"),
        default: true,
      },
    ]);

    if (goCommit) await doCommit();
  }
}

module.exports = { doStage };
