const inquirer = require("inquirer");
const { execFile } = require("child_process");
const { getConflictDetails, acceptOurs, acceptTheirs, acceptBoth, abortMerge, stageFiles } = require("../../helpers/git");
const { s, header, clear, pause, sleep } = require("../common");

async function doConflict() {
  clear();
  header();
  console.log(s.bold("  Conflict Resolver\n"));

  const conflicts = await getConflictDetails();

  if (conflicts.length === 0) {
    console.log(s.success("  ✓ No conflicts!\n"));
    await pause();
    return;
  }

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: s.muted(`Found ${conflicts.length} conflicted files:`),
      choices: [
        { name: s.text("  ◉ Resolve file by file"), value: "each" },
        { name: s.success("  ✓ Accept all 'ours'"), value: "ours" },
        { name: s.primary("  ✓ Accept all 'theirs'"), value: "theirs" },
        { type: "separator" },
        { name: s.error("  ⚠ Abort merge"), value: "abort" },
        { name: s.muted("  ← Back"), value: "back" },
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

  const { choice } = await inquirer.prompt([
    {
      type: "list",
      name: "choice",
      message: s.muted(`How to resolve ${file}?`),
      choices: [
        { name: s.success("  Accept 'Ours' (Current Branch)"), value: "ours" },
        { name: s.primary("  Accept 'Theirs' (Incoming Branch)"), value: "theirs" },
        { name: s.warning("  Accept Both (Keep markers for manual merge)"), value: "both" },
        { name: s.warning("  Edit manually (Opens default editor)"), value: "manual" },
        { name: s.muted("  Skip for now"), value: "skip" },
      ],
      loop: true,
      pageSize: 15,
    },
  ]);

  if (choice === "ours") await acceptOurs(file);
  if (choice === "theirs") await acceptTheirs(file);
  if (choice === "both") await acceptBoth(file);
  if (choice === "manual") {
    const editor = process.env.EDITOR || (process.platform === "win32" ? "notepad" : "code");
    console.log(s.muted(`  Opening ${editor}...`));
    await new Promise((resolve, reject) => {
      const child = execFile(editor, [file], { stdio: "inherit" });
      child.on("close", resolve);
      child.on("error", reject);
    });
    
    await inquirer.prompt([
      { type: "input", name: "done", message: s.success("  Press Enter once you saved the file and resolved conflicts...") }
    ]);
    
    // After manual edit, we should add the file to mark as resolved
    await stageFiles([file]);
  }
}

module.exports = { doConflict };
