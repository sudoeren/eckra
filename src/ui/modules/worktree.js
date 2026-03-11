const inquirer = require("inquirer");
const { listWorktrees, addWorktree, addWorktreeNewBranch, removeWorktree, getBranches } = require("../../helpers/git");
const { s, header, clear, sleep, pause } = require("../common");

async function doWorktree() {
  let inMenu = true;

  while (inMenu) {
    clear();
    header();
    console.log(s.bold("  Worktrees\n"));

    const worktrees = await listWorktrees();

    if (worktrees.length > 0) {
      worktrees.forEach((wt) => {
        console.log(s.primary(`  ${wt.path}`));
        if (wt.branch) console.log(s.muted(`    Branch: ${wt.branch}`));
        if (wt.head) console.log(s.muted(`    HEAD: ${wt.head}`));
        console.log();
      });
    } else {
      console.log(s.muted("  No worktrees found.\n"));
    }

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: s.muted("What should I do?"),
        choices: [
          { name: s.success("  + Add Worktree"), value: "add" },
          { name: s.error("  ✕ Remove Worktree"), value: "remove" },
          { name: s.muted("  ← Back"), value: "back" },
        ],
        loop: true,
        pageSize: 15,
      },
    ]);

    switch (action) {
      case "add":
        const { path: wtPath } = await inquirer.prompt([
          {
            type: "input",
            name: "path",
            message: s.muted("Worktree path:"),
            validate: (v) => v.length > 0,
          },
        ]);

        const { type } = await inquirer.prompt([
          {
            type: "list",
            name: "type",
            message: s.muted("Branch type:"),
            choices: [
              { name: "Existing Branch", value: "existing" },
              { name: "New Branch", value: "new" },
            ],
            loop: true,
            pageSize: 15,
          },
        ]);

        if (type === "existing") {
          const branches = await getBranches();
          const { branch } = await inquirer.prompt([
            {
              type: "list",
              name: "branch",
              message: s.muted("Select branch:"),
              choices: branches.all,
              loop: true,
              pageSize: 15,
            },
          ]);
           try {
            await addWorktree(wtPath, branch);
            console.log(s.success(`\n  ✓ Worktree added at ${wtPath}`));
            await sleep(600);
          } catch (err) {
             console.log(s.error(`\n  ✗ ${err.message}`));
             await pause();
          }
        } else {
           const { newBranch } = await inquirer.prompt([
            {
              type: "input",
              name: "newBranch",
              message: s.muted("New branch name:"),
               validate: (v) => v.length > 0,
            },
          ]);
          try {
            await addWorktreeNewBranch(wtPath, newBranch);
            console.log(s.success(`\n  ✓ Worktree created with branch ${newBranch}`));
            await sleep(600);
          } catch (err) {
             console.log(s.error(`\n  ✗ ${err.message}`));
             await pause();
          }
        }
        break;

      case "remove":
        if (worktrees.length === 0) {
           console.log(s.muted("\n  No worktrees to remove."));
           await pause();
        } else {
           const { toRemove } = await inquirer.prompt([
            {
              type: "list",
              name: "toRemove",
              message: s.muted("Select worktree to remove:"),
              choices: worktrees.map(wt => wt.path),
              loop: true,
              pageSize: 15,
            },
          ]);
           try {
            await removeWorktree(toRemove);
            console.log(s.success(`\n  ✓ Worktree removed!`));
            await sleep(600);
          } catch (err) {
             console.log(s.error(`\n  ✗ ${err.message}`));
             await pause();
          }
        }
        break;

      case "back":
        inMenu = false;
        break;
    }
  }
}

module.exports = { doWorktree };
