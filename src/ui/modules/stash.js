const inquirer = require("inquirer");
const { getGitStatus, listStashes, stashChanges, popStash } = require("../../helpers/git");
const { s, header, clear, pause, sleep } = require("../common");

async function doStash() {
  let inMenu = true;

  while (inMenu) {
    clear();
    header();
    console.log(s.bold("  Stash\n"));

    const stashes = await listStashes();

    if (stashes.all.length > 0) {
      stashes.all.slice(0, 5).forEach((st, i) => {
        console.log(s.muted(`  ${i}: `) + s.text(st.message));
      });
      console.log();
    } else {
      console.log(s.muted("  No stashes.\n"));
    }

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: s.muted("What should I do?"),
        choices: [
          { name: s.success("  + Save Stash"), value: "save" },
          { name: s.primary("  ↓ Apply Stash (pop)"), value: "pop" },
          { name: s.muted("  ← Back"), value: "back" },
        ],
      },
    ]);

    switch (action) {
      case "save":
        const status = await getGitStatus();
        if (status.modified.length === 0 && status.not_added.length === 0) {
          console.log(s.muted("\n  No changes to stash."));
          await pause();
        } else {
          const { message } = await inquirer.prompt([
            {
              type: "input",
              name: "message",
              message: s.muted("Stash message (optional):"),
            },
          ]);
          await stashChanges(message || null);
          console.log(s.success("\n  ✓ Changes stashed!"));
          await sleep(600);
        }
        break;

      case "pop":
        if (stashes.all.length === 0) {
          console.log(s.muted("\n  No stash to pop."));
          await pause();
        } else {
          try {
            await popStash();
            console.log(s.success("\n  ✓ Stash applied!"));
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

module.exports = { doStash };
