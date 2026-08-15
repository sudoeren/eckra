const {
  getGitStatus,
  stageAll,
  stageFiles,
  getFileDiff,
  applyPatchString,
} = require("../../helpers/git");
const { parseDiff, generatePatch } = require("../../helpers/patch");
const { s, sleep, pause } = require("../common");
const { open, emptyState, menuItem, backItem, prompt, spinner, done, fail } = require("../screen");
const { doCommit } = require("./commit");

async function doStage(info) {
  open("Stage");

  const status = info?.status || (await getGitStatus());
  const files = [...status.modified, ...status.deleted, ...status.not_added];

  if (files.length === 0) {
    emptyState("No changes.");
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

  const { action } = await prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("What should I do?"),
      choices: [
        menuItem("check", "Stage All", "success", "all"),
        menuItem("select", "Select Files", "text", "select"),
        menuItem("diff", "Partial Stage", "warning", "partial"),
        backItem(),
      ],
      loop: true,
      pageSize: 20,
    },
  ]);

  if (action === "back") return;
  if (action === "partial") return doPartialStage(status);

  if (action === "all") {
    const spin = spinner("Staging...");
    spin.start();
    await stageAll();
    done(spin, "All staged!");
    await sleep(500);

    // Redirect to commit
    const { goCommit } = await prompt([
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
  const { selected } = await prompt([
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

    const { goCommit } = await prompt([
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
  const { file } = await prompt([
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

  const { selectedIndices } = await prompt([
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

  const spin = spinner("Applying partial patch...");
  spin.start();

  try {
    const patchContent = generatePatch(targetFile, selectedIndices);
    await applyPatchString(patchContent);
    done(spin, "Selected hunks staged!");
  } catch (error) {
    fail(spin, "Failed to stage hunks: " + error.message);
  }

  await sleep(1000);
}

module.exports = { doStage };
