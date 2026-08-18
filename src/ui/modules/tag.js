const {
  listTags,
  createTag,
  deleteTag,
  pushTags,
} = require("../../helpers/git");
const { s, pause, sleep } = require("../common");
const {
  open,
  emptyState,
  menuItem,
  backItem,
  prompt,
  spinner,
  done,
  fail,
  confirmAction,
} = require("../screen");

async function doTag() {
  open("Tag");

  const tags = await listTags();

  if (tags.all.length > 0) {
    tags.all.slice(0, 10).forEach((t) => console.log(s.primary(`  ${t}`)));
    console.log();
  } else {
    emptyState("No tags.", "Tag a release point to reference it later.");
  }

  const { action } = await prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("What should I do?"),
      choices: [
        menuItem("New Tag", "success", "new"),
        menuItem("Push Tags", "primary", "push"),
        menuItem("Delete Tag", "danger", "delete"),
        backItem(),
      ],
      loop: true,
      pageSize: 15,
    },
  ]);

  if (action === "back") return;

  if (action === "new") {
    const { name } = await prompt([
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
    const ok = await confirmAction("Push all tags to origin?");
    if (!ok) {
      console.log(s.muted("  Push cancelled."));
      await pause();
      return;
    }

    const spin = spinner("Pushing tags...");
    spin.start();
    try {
      await pushTags();
      done(spin, "Tags pushed!");
    } catch (err) {
      fail(spin, err.message);
    }
    await pause();
  }

  if (action === "delete") {
    if (tags.all.length === 0) {
      emptyState("No tags to delete.");
      await pause();
    } else {
      const { toDelete } = await prompt([
        {
          type: "list",
          name: "toDelete",
          message: s.muted("Which tag to delete?"),
          choices: tags.all,
          loop: true,
          pageSize: 15,
        },
      ]);
      const ok = await confirmAction(
        `Delete tag ${toDelete}? This cannot be undone.`,
        { tone: "error" }
      );
      if (!ok) {
        console.log(s.muted("  Delete cancelled."));
        await pause();
        return;
      }
      await deleteTag(toDelete);
      console.log(s.success(`\n  ✓ ${toDelete} deleted!`));
      await sleep(600);
    }
  }
}

module.exports = { doTag };
