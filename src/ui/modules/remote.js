const inquirer = require("inquirer");
const { getRemotes, addRemote, removeRemote } = require("../../helpers/git");
const { s, header, clear, pause, sleep } = require("../common");

async function doRemote() {
  clear();
  header();
  console.log(s.bold("  Remote\n"));

  const remotes = await getRemotes();

  if (remotes.length > 0) {
    remotes.forEach((r) => {
      console.log(s.primary(`  ${r.name}`));
      console.log(s.muted(`    ${r.refs.fetch || "-"}\n`));
    });
  } else {
    console.log(s.muted("  No remotes.\n"));
  }

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("What should I do?"),
      choices: [
        { name: s.success("  + Add Remote"), value: "add" },
        { name: s.error("  ✕ Remove Remote"), value: "remove" },
        { name: s.muted("  ← Back"), value: "back" },
      ],
      loop: false,
    },
  ]);

  if (action === "back") return;

  if (action === "add") {
    const { name } = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: s.muted("Remote name:"),
        default: "origin",
      },
    ]);
    const { url } = await inquirer.prompt([
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
    const { toRemove } = await inquirer.prompt([
      {
        type: "list",
        name: "toRemove",
        message: s.muted("Which remote to remove?"),
        choices: remotes.map((r) => r.name),
      },
    ]);
    await removeRemote(toRemove);
    console.log(s.success(`\n  ✓ ${toRemove} removed!`));
    await sleep(600);
  }
}

module.exports = { doRemote };
