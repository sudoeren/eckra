const { getBranches, createBranch, switchBranch, mergeBranch, deleteBranch, compareBranches } = require("../../helpers/git");
const { s, sleep, pause } = require("../common");
const { open, emptyState, menuItem, backItem, sep, prompt, rule } = require("../screen");

async function doBranch() {
  open("Branch");

  const branches = await getBranches();
  const current = branches.current;
  const locals = branches.all.filter((b) => !b.startsWith("remotes/"));
  const remotes = branches.all.filter((b) => b.startsWith("remotes/"));

  // Branch list
  locals.forEach((b) => {
    if (b === current) {
      console.log(s.success(`  ● ${b}`));
    } else {
      console.log(s.muted(`  ○ ${b}`));
    }
  });
  console.log();

  const { action } = await prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("What should I do?"),
      choices: [
        menuItem("new", "New Branch", "success"),
        menuItem("branch", "Switch Branch"),
        menuItem("arrow", "Merge"),
        menuItem("stats", "Compare Branches"),
        menuItem("remote", "Remote Branches"),
        menuItem("remove", "Delete Branch", "danger"),
        sep(),
        backItem(),
      ],
      loop: true,
      pageSize: 20,
    },
  ]);

  if (action === "back") return;

  switch (action) {
    case "new":
      const { name } = await prompt([
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
        emptyState("No other branches.");
        await pause();
      } else {
        const { target } = await prompt([
          {
            type: "list",
            name: "target",
            message: s.muted("Which branch to switch to?"),
            choices: others,
            loop: true,
            pageSize: 15,
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

    case "compare":
      const compareTargets = branches.all.filter((b) => b !== current);
      if (compareTargets.length === 0) {
        emptyState("No other branches to compare.");
        await pause();
      } else {
        const { target } = await prompt([
          {
            type: "list",
            name: "target",
            message: s.muted("Compare with:"),
            choices: compareTargets,
            loop: true,
            pageSize: 15,
          },
        ]);
        try {
          const stats = await compareBranches(current, target);
          console.log(s.bold(`\n  Comparison: ${current} vs ${target}`));
          console.log(rule("branch comparison"));
          console.log(`  Ahead:  ${s.success(stats.ahead)} commits (commits in ${target} not in ${current})`);
          console.log(`  Behind: ${s.warning(stats.behind)} commits (commits in ${current} not in ${target})`);
          console.log(`  Diff:   ${s.text(stats.diffStat || "No file changes")}`);
          await pause();
        } catch (err) {
          console.log(s.error(`\n  ✗ ${err.message}`));
          await pause();
        }
      }
      break;

    case "remote":
      if (remotes.length === 0) {
        emptyState("No remote branches found.");
        await pause();
      } else {
        const { remoteBranch } = await prompt([
          {
            type: "list",
            name: "remoteBranch",
            message: s.muted("Select remote branch:"),
            choices: remotes,
            loop: true,
            pageSize: 15,
          },
        ]);

        const { remoteAction } = await prompt([
          {
            type: "list",
            name: "remoteAction",
            message: s.muted(`Action for ${remoteBranch}:`),
            choices: [
              menuItem("check", "Checkout (Track)", "success"),
              menuItem("cross", "Cancel", "muted"),
            ],
            loop: true,
            pageSize: 15,
          },
        ]);

        if (remoteAction === "checkout") {
          try {
            // Extract branch name (e.g., origin/feature -> feature)
            const localName = remoteBranch.split("/").slice(1).join("/");
            await switchBranch(localName); // simple-git smart checkout usually handles remote tracking
            console.log(s.success(`\n  ✓ Checked out ${localName}!`));
            await sleep(600);
          } catch (err) {
            console.log(s.error(`\n  ✗ ${err.message}`));
            await pause();
          }
        }
      }
      break;

    case "merge":
      const mergeable = locals.filter((b) => b !== current);
      if (mergeable.length === 0) {
        emptyState("No branches to merge.");
        await pause();
      } else {
        const { source } = await prompt([
          {
            type: "list",
            name: "source",
            message: s.muted("Which branch to merge?"),
            choices: mergeable,
            loop: true,
            pageSize: 15,
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
        emptyState("No branches to delete.");
        await pause();
      } else {
        const { toDelete } = await prompt([
          {
            type: "list",
            name: "toDelete",
            message: s.muted("Which branch to delete?"),
            choices: deletable,
            loop: true,
            pageSize: 15,
          },
        ]);
        const { confirm } = await prompt([
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
  }
}

module.exports = { doBranch };
