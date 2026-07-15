const inquirer = require("inquirer");
const ora = require("ora").default;
const {
  getGitStatus,
  stageAll,
  stageFiles,
  getFileDiff,
  applyPatchString,
} = require("../../helpers/git");
const { parseDiff, generatePatch } = require("../../helpers/patch");
const { s, header, clear, sleep, rows, pause } = require("../common");
const { doCommit } = require("./commit");

async function doStage(info) {
  clear();
  header();
  console.log(s.bold("  Stage\n"));

  const status = info?.status || (await getGitStatus());
  const files = [...status.modified, ...status.deleted, ...status.not_added];

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

  const deletedFiles = status.deleted.map((f) => ({
    name: `  ${s.error("-")} ${f}`,
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
        { name: s.warning("  ✂ Partial Stage (Beta)"), value: "partial" },
        { name: s.muted("  ← Back"), value: "back" },
      ],
      loop: true,
      pageSize: 20,
    },
  ]);

  if (action === "back") return;
  if (action === "partial") return doPartialStage(status);

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
        ...(deletedFiles.length > 0
          ? [{ type: "separator", line: s.muted("  Deleted") }]
          : []),
        ...deletedFiles,
        ...(untrackedFiles.length > 0
          ? [{ type: "separator", line: s.muted("  Untracked") }]
          : []),
        ...untrackedFiles,
      ],
      pageSize: 20,
      loop: true,
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

async function doPartialStage(status) {
  if (status.modified.length === 0) {
    console.log(
      s.warning("\n  No modified files suitable for partial staging."),
    );
    console.log(s.muted("  (Untracked files cannot be partially staged)"));
    await pause();
    return;
  }

  // Select a file
  const { file } = await inquirer.prompt([
    {
      type: "list",
      name: "file",
      message: s.muted("Select file to split:"),
      choices: status.modified.map((f) => ({ name: f, value: f })),
      loop: true,
      pageSize: 20,
    },
  ]);

  const diff = await getFileDiff(file);
  const parsedFiles = parseDiff(diff);

  if (parsedFiles.length === 0 || !parsedFiles[0].hunks.length) {
    console.log(s.warning("  No hunks found to split."));
    await pause();
    return;
  }

  const targetFile = parsedFiles[0];
  const hunks = targetFile.hunks;

  const { selectedIndices } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selectedIndices",
      message: s.muted("Select hunks to stage:"),
      choices: hunks.map((hunk, idx) => {
        // Create a preview of the hunk
        const preview = hunk.lines.slice(0, 4).join("\n      ");
        const more =
          hunk.lines.length > 4 ? `... (+${hunk.lines.length - 4} lines)` : "";
        return {
          name: `${s.primary(`Hunk ${idx + 1}`)}\n      ${s.dim(preview)} ${s.dim(more)}`,
          value: idx,
        };
      }),
      pageSize: 20,
      loop: true,
    },
  ]);

  if (selectedIndices.length === 0) return;

  const spin = ora({
    text: s.muted(" Applying partial patch..."),
    spinner: "dots",
  }).start();

  try {
    const patchContent = generatePatch(targetFile, selectedIndices);
    await applyPatchString(patchContent);
    spin.succeed(s.success(" Selected hunks staged!"));
  } catch (error) {
    spin.fail(s.error(" Failed to stage hunks: " + error.message));
  }

  await sleep(1000);
}

module.exports = { doStage };
