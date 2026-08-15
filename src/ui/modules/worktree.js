const { listWorktrees, addWorktree, addWorktreeNewBranch, removeWorktree, getBranches } = require("../../helpers/git");
const { s, sleep, pause } = require("../common");
const { open, emptyState, menuItem, backItem, prompt } = require("../screen");

async function doWorktree() {
  let inMenu = true;

  while (inMenu) {
    open("Worktrees");

    const worktrees = await listWorktrees();

    if (worktrees.length > 0) {
      worktrees.forEach((wt) => {
        console.log(s.primary(`  ${wt.path}`));
        if (wt.branch) console.log(s.muted(`    Branch: ${wt.branch}`));
        if (wt.head) console.log(s.muted(`    HEAD: ${wt.head}`));
        console.log();
      });
    } else {
      emptyState("No worktrees found.", "Worktrees let you check out branches in parallel.");
    }

    const { action } = await prompt([
      {
        type: "list",
        name: "action",
        message: s.muted("What should I do?"),
        choices: [
          menuItem("new", "Add Worktree", "success", "add"),
          menuItem("remove", "Remove Worktree", "danger", "remove"),
          backItem(),
        ],
        loop: true,
        pageSize: 15,
      },
    ]);

    switch (action) {
      case "add":
        const { path: wtPath } = await prompt([
          {
            type: "input",
            name: "path",
            message: s.muted("Worktree path:"),
            validate: (v) => v.length > 0,
          },
        ]);

        const { type } = await prompt([
          {
            type: "list",
            name: "type",
            message: s.muted("Branch type:"),
            choices: [
              menuItem("branch", "Existing Branch", "text", "existing"),
              menuItem("new", "New Branch", "primary", "new"),
            ],
            loop: true,
            pageSize: 15,
          },
        ]);

        if (type === "existing") {
          const branches = await getBranches();
          const { branch } = await prompt([
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
          const { newBranch } = await prompt([
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
          emptyState("No worktrees to remove.");
          await pause();
        } else {
          const { toRemove } = await prompt([
            {
              type: "list",
              name: "toRemove",
              message: s.muted("Select worktree to remove:"),
              choices: worktrees.map((wt) => wt.path),
              loop: true,
              pageSize: 15,
            },
          ]);
          try {
            await removeWorktree(toRemove);
            console.log(s.success("\n  ✓ Worktree removed!"));
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
