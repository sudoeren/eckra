const inquirer = require("inquirer");
const ora = require("ora").default;
const {
  listTags,
  createTag,
  deleteTag,
  pushTags,
} = require("../../helpers/git");
const { s, header, clear, pause, sleep } = require("../common");

async function doTag() {
  clear();
  header();
  console.log(s.bold("  Tag\n"));

  const tags = await listTags();

  if (tags.all.length > 0) {
    tags.all.slice(0, 10).forEach((t) => console.log(s.primary(`  🏷 ${t}`)));
    console.log();
  } else {
    console.log(s.muted("  No tags.\n"));
  }

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("What should I do?"),
      choices: [
        { name: s.success("  + New Tag"), value: "new" },
        { name: s.primary("  ↑ Push Tags"), value: "push" },
        { name: s.error("  ✕ Delete Tag"), value: "delete" },
        { name: s.muted("  ← Back"), value: "back" },
      ],
      loop: true,
      pageSize: 15,
    },
  ]);

  if (action === "back") return;

  if (action === "new") {
    const { name } = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: s.muted("Tag name (e.g. v1.2.0):"),
        validate: (v) => v.length > 0,
      },
    ]);
    await createTag(name);
    console.log(s.success(`\n  ✓ ${name} created!`));
    await sleep(600);
  }

  if (action === "push") {
    const spin = ora({
      text: s.muted(" Pushing tags..."),
      spinner: "dots",
    }).start();
    try {
      await pushTags();
      spin.succeed(s.success(" Tags pushed!"));
    } catch (err) {
      spin.fail(s.error(` ${err.message}`));
    }
    await pause();
  }

  if (action === "delete") {
    if (tags.all.length === 0) {
      console.log(s.muted("\n  No tags to delete."));
      await pause();
    } else {
      const { toDelete } = await inquirer.prompt([
        {
          type: "list",
          name: "toDelete",
          message: s.muted("Which tag to delete?"),
          choices: tags.all,
          loop: true,
          pageSize: 15,
        },
      ]);
      await deleteTag(toDelete);
      console.log(s.success(`\n  ✓ ${toDelete} deleted!`));
      await sleep(600);
    }
  }
}

module.exports = { doTag };
