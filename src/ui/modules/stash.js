const { getGitStatus, listStashes, stashChanges, popStash, applyStash, dropStash } = require("../../helpers/git");
const { s, pause, sleep } = require("../common");
const { open, emptyState, menuItem, backItem, prompt } = require("../screen");

async function doStash() {
  open("Stash");

  const stashes = await listStashes();

  if (stashes.all.length > 0) {
    stashes.all.slice(0, 5).forEach((st, i) => {
      console.log(s.muted(`  ${i}: `) + s.text(st.message));
    });
    console.log();
  } else {
    emptyState("No stashes.", "Stash changes to work on something else.");
  }

  const { action } = await prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("What should I do?"),
      choices: [
        menuItem("Save Stash", "success", "save"),
        menuItem("Pop Stash (Apply & Drop)", "primary", "pop"),
        menuItem("Apply Stash (Keep)", "text", "apply"),
        menuItem("Drop Stash", "danger", "drop"),
        backItem(),
      ],
      loop: true,
      pageSize: 20,
    },
  ]);

  if (action === "back") return;

  if (action === "save") {
    const status = await getGitStatus();
    if (status.modified.length === 0 && status.not_added.length === 0) {
      emptyState("No changes to stash.");
      await pause();
    } else {
      const { message } = await prompt([
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
    emptyState("No stashes available.");
    await pause();
    return;
  }

  // Select stash index
  const { index } = await prompt([
    {
      type: "list",
      name: "index",
      message: s.muted("Select stash:"),
      choices: stashes.all.map((st, i) => ({
        name: `${i}: ${st.message}`,
        value: i,
      })),
      loop: true,
      pageSize: 15,
    },
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
