const inquirer = require("inquirer");
const { getGitStatus, listStashes, stashChanges, popStash, applyStash, dropStash } = require("../../helpers/git");
const { s, header, clear, pause, sleep } = require("../common");

async function doStash() {
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
        { name: s.primary("  ↓ Pop Stash (Apply & Drop)"), value: "pop" },
        { name: s.text("  ⟳ Apply Stash (Keep)"), value: "apply" },
        { name: s.error("  ✕ Drop Stash"), value: "drop" },
        { name: s.muted("  ← Back"), value: "back" },
      ],
      loop: false,
    },
  ]);

  if (action === "back") return;

  if (action === "save") {
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
    return;
  }

  if (stashes.all.length === 0) {
    console.log(s.muted("\n  No stashes available."));
    await pause();
    return;
  }

  // Select stash index
  const { index } = await inquirer.prompt([
    {
      type: "list",
      name: "index",
      message: s.muted("Select stash:"),
      choices: stashes.all.map((st, i) => ({
        name: `${i}: ${st.message}`,
        value: i
      }))
    }
  ]);

  try {
    if (action === "pop") {
      await popStash(index);
      console.log(s.success("\n  ✓ Stash popped!"));
    } else if (action === "apply") {
      await applyStash(index);
      console.log(s.success("\n  ✓ Stash applied!"));
    } else if (action === "drop") {
      await dropStash(index);
      console.log(s.success("\n  ✓ Stash dropped!"));
    }
    await sleep(600);
  } catch (err) {
    console.log(s.error(`\n  ✗ ${err.message}`));
    await pause();
  }
}

module.exports = { doStash };
