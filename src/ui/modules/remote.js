const { getRemotes, addRemote, removeRemote } = require("../../helpers/git");
const { s, pause, sleep } = require("../common");
const { open, emptyState, menuItem, backItem, prompt } = require("../screen");

async function doRemote() {
  open("Remote");

  const remotes = await getRemotes();

  if (remotes.length > 0) {
    remotes.forEach((r) => {
      console.log(s.primary(`  ${r.name}`));
      console.log(s.muted(`    ${r.refs.fetch || "-"}\n`));
    });
  } else {
    emptyState("No remotes.", "Add one to sync with a hosted repository.");
  }

  const { action } = await prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("What should I do?"),
      choices: [
        menuItem("new", "Add Remote", "success", "add"),
        menuItem("remove", "Remove Remote", "danger", "remove"),
        backItem(),
      ],
      loop: true,
      pageSize: 15,
    },
  ]);

  if (action === "back") return;

  if (action === "add") {
    const { name } = await prompt([
      {
        type: "input",
        name: "name",
        message: s.muted("Remote name:"),
        default: "origin",
      },
    ]);
    const { url } = await prompt([
      {
        type: "input",
        name: "url",
        message: s.muted("URL:"),
        validate: (v) => v.length > 0,
      },
    ]);
    await addRemote(name, url);
    console.log(s.success(`\n  ✓ ${name} added!`));
    await sleep(600);
  }

  if (action === "remove" && remotes.length > 0) {
    const { toRemove } = await prompt([
      {
        type: "list",
        name: "toRemove",
        message: s.muted("Which remote to remove?"),
        choices: remotes.map((r) => r.name),
        loop: true,
        pageSize: 15,
      },
    ]);
    await removeRemote(toRemove);
    console.log(s.success(`\n  ✓ ${toRemove} removed!`));
    await sleep(600);
  }
}

module.exports = { doRemote };
