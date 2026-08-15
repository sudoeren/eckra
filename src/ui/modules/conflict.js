const { execFile } = require("child_process");
const {
  getConflictDetails,
  acceptOurs,
  acceptTheirs,
  acceptBoth,
  abortMerge,
  stageFiles,
} = require("../../helpers/git");
const { s, pause, sleep, clear, header } = require("../common");
const { open, menuItem, backItem, sep, prompt } = require("../screen");

async function doConflict() {
  open("Conflict Resolver");

  const conflicts = await getConflictDetails();

  if (conflicts.length === 0) {
    console.log(s.success(`  ${s.text("✓")} No conflicts!\n`));
    await pause();
    return;
  }

  const { action } = await prompt([
    {
      type: "list",
      name: "action",
      message: s.muted(`Found ${conflicts.length} conflicted files:`),
      choices: [
        menuItem("Resolve file by file", "text", "each"),
        menuItem("Accept all 'ours'", "success", "ours"),
        menuItem("Accept all 'theirs'", "primary", "theirs"),
        sep(),
        menuItem("Abort merge", "danger", "abort"),
        backItem(),
      ],
      loop: true,
      pageSize: 20,
    },
  ]);

  if (action === "back") return;

  if (action === "each") {
    for (const file of conflicts) {
      await resolveFile(file);
    }
  } else if (action === "ours") {
    for (const file of conflicts) await acceptOurs(file);
    console.log(s.success("\n  ✓ All conflicts resolved as 'ours'!"));
  } else if (action === "theirs") {
    for (const file of conflicts) await acceptTheirs(file);
    console.log(s.success("\n  ✓ All conflicts resolved as 'theirs'!"));
  } else if (action === "abort") {
    await abortMerge();
    console.log(s.warning("\n  Merge aborted."));
  }

  await sleep(600);
}

async function resolveFile(file) {
  clear();
  header();
  console.log(s.bold(`  Resolving: ${file}\n`));

  const { choice } = await prompt([
    {
      type: "list",
      name: "choice",
      message: s.muted(`How to resolve ${file}?`),
      choices: [
        menuItem("Accept 'Ours' (Current Branch)", "success", "ours"),
        menuItem("Accept 'Theirs' (Incoming Branch)", "primary", "theirs"),
        menuItem(
          "Accept Both (Keep markers for manual merge)",
          "warning",
          "both"
        ),
        menuItem("Edit manually (Opens default editor)", "warning", "manual"),
        menuItem("Skip for now", "muted", "skip"),
      ],
      loop: true,
      pageSize: 15,
    },
  ]);

  if (choice === "ours") await acceptOurs(file);
  if (choice === "theirs") await acceptTheirs(file);
  if (choice === "both") await acceptBoth(file);
  if (choice === "manual") {
    const editor =
      process.env.EDITOR || (process.platform === "win32" ? "notepad" : "code");
    console.log(s.muted(`  Opening ${editor}...`));
    try {
      await new Promise((resolve, reject) => {
        const child = execFile(editor, [file], { stdio: "inherit" });
        child.on("close", resolve);
        child.on("error", reject);
      });
    } catch (err) {
      console.log(s.danger(`  Could not launch ${editor}: ${err.message}`));
      console.log(
        s.muted(
          `  Resolve the conflicts in ${file} manually, then run: git add ${file}`
        )
      );
      await stageFiles([file]);
      return;
    }

    await prompt([
      {
        type: "input",
        name: "done",
        message: s.success(
          "  Press Enter once you saved the file and resolved conflicts..."
        ),
      },
    ]);

    // After manual edit, we should add the file to mark as resolved
    await stageFiles([file]);
  }
}

module.exports = { doConflict };
