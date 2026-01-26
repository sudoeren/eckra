const inquirer = require("inquirer");
const { getBranches, createBranch, switchBranch, mergeBranch, deleteBranch } = require("../../helpers/git");
const { s, header, clear, sleep, pause } = require("../common");

async function doBranch() {
  let inMenu = true;

  while (inMenu) {
    clear();
    header();
    console.log(s.bold("  Branch\n"));

    const branches = await getBranches();
    const current = branches.current;
    const locals = branches.all.filter((b) => !b.startsWith("remotes/"));

    // Branch list
    locals.forEach((b) => {
      if (b === current) {
        console.log(s.success(`  ● ${b}`));
      } else {
        console.log(s.muted(`  ○ ${b}`));
      }
    });
    console.log();

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: s.muted("What should I do?"),
        choices: [
          { name: s.success("  + New Branch"), value: "new" },
          { name: s.text("  ↔ Switch Branch"), value: "switch" },
          { name: s.text("  ⎇ Merge"), value: "merge" },
          { name: s.error("  ✕ Delete Branch"), value: "delete" },
          { type: "separator", line: " " },
          { name: s.muted("  ← Back"), value: "back" },
        ],
      },
    ]);

    switch (action) {
      case "new":
        const { name } = await inquirer.prompt([
          {
            type: "input",
            name: "name",
            message: s.muted("Branch name:"),
            validate: (v) => v.length > 0 && !v.includes(" "),
          },
        ]);
        try {
          await createBranch(name);
          console.log(s.success(`\n  ✓ ${name} created and switched!`));
          await sleep(600);
        } catch (err) {
          console.log(s.error(`\n  ✗ ${err.message}`));
          await pause();
        }
        break;

      case "switch":
        const others = locals.filter((b) => b !== current);
        if (others.length === 0) {
          console.log(s.muted("\n  No other branches."));
          await pause();
        } else {
          const { target } = await inquirer.prompt([
            {
              type: "list",
              name: "target",
              message: s.muted("Which branch to switch to?"),
              choices: others,
            },
          ]);
          try {
            await switchBranch(target);
            console.log(s.success(`\n  ✓ Switched to ${target} branch!`));
            await sleep(600);
          } catch (err) {
            console.log(s.error(`\n  ✗ ${err.message}`));
            await pause();
          }
        }
        break;

      case "merge":
        const mergeable = locals.filter((b) => b !== current);
        if (mergeable.length === 0) {
          console.log(s.muted("\n  No branches to merge."));
          await pause();
        } else {
          const { source } = await inquirer.prompt([
            {
              type: "list",
              name: "source",
              message: s.muted("Which branch to merge?"),
              choices: mergeable,
            },
          ]);
          try {
            await mergeBranch(source);
            console.log(s.success(`\n  ✓ ${source} merged!`));
            await sleep(600);
          } catch (err) {
            console.log(s.error(`\n  ✗ ${err.message}`));
            await pause();
          }
        }
        break;

      case "delete":
        const deletable = locals.filter((b) => b !== current);
        if (deletable.length === 0) {
          console.log(s.muted("\n  No branches to delete."));
          await pause();
        } else {
          const { toDelete } = await inquirer.prompt([
            {
              type: "list",
              name: "toDelete",
              message: s.muted("Which branch to delete?"),
              choices: deletable,
            },
          ]);
          const { confirm } = await inquirer.prompt([
            {
              type: "confirm",
              name: "confirm",
              message: s.error(`Delete ${toDelete}?`),
              default: false,
            },
          ]);
          if (confirm) {
            try {
              await deleteBranch(toDelete);
              console.log(s.success(`\n  ✓ ${toDelete} deleted!`));
              await sleep(600);
            } catch (err) {
              console.log(s.error(`\n  ✗ ${err.message}`));
              await pause();
            }
          }
        }
        break;

      case "back":
        inMenu = false;
        break;
    }
  }
}

module.exports = { doBranch };
