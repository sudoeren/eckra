const inquirer = require("inquirer");
const { getConflictDetails, acceptOurs, acceptTheirs, abortMerge } = require("../../helpers/git");
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

  console.log(s.error(`  ${conflicts.length} files with conflicts:\n`));
  conflicts.forEach((f) => console.log(s.warning(`  ⚠ ${f}`)));
  console.log();

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("What should I do?"),
      choices: [
        {
          name: s.success("  Accept all 'ours' (our version)"),
          value: "ours",
        },
        {
          name: s.primary("  Accept all 'theirs' (their version)"),
          value: "theirs",
        },
        { name: s.error("  Abort merge"), value: "abort" },
        { name: s.muted("  ← Back"), value: "back" },
      ],
    },
  ]);

  if (action === "back") return;

  if (action === "ours") {
    for (const file of conflicts) await acceptOurs(file);
    console.log(s.success("\n  ✓ All conflicts resolved as 'ours'!"));
    await sleep(600);
  }

  if (action === "theirs") {
    for (const file of conflicts) await acceptTheirs(file);
    console.log(s.success("\n  ✓ All conflicts resolved as 'theirs'!"));
    await sleep(600);
  }

  if (action === "abort") {
    await abortMerge();
    console.log(s.warning("\n  Merge aborted."));
    await sleep(600);
  }
}

module.exports = { doConflict };
