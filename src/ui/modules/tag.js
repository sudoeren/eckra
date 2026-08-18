const {
  listTagDetails,
  createTag,
  deleteTag,
  pushTags,
} = require("../../helpers/git");
const { s, pause, sleep } = require("../common");
const {
  open,
  rule,
  emptyState,
  menuItem,
  backItem,
  sep,
  prompt,
  spinner,
  done,
  fail,
  confirmAction,
} = require("../screen");

function renderTagMeta(tag) {
  console.log(s.muted("  Name:    ") + s.primary(tag.name));
  console.log(
    s.muted("  Commit:  ") +
      s.primary(tag.commit) +
      (tag.commit !== tag.object ? ` (object ${tag.object})` : "")
  );
  console.log(
    s.muted("  Type:    ") +
      s.text(tag.type === "tag" ? "Annotated" : "Lightweight")
  );
  if (tag.tagger) console.log(s.muted("  Tagger:  ") + s.text(tag.tagger));
  if (tag.date)
    console.log(
      s.muted("  Date:    ") + s.text(new Date(tag.date).toLocaleString())
    );
}

async function showTagDetails(tag) {
  open("Tag Details", tag.name);

  renderTagMeta(tag);
  if (tag.subject) {
    console.log(rule("message"));
    console.log(s.white(tag.subject));
  }
  console.log();

  const { action } = await prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("Action:"),
      choices: [
        menuItem("Delete Tag", "danger", "delete"),
        backItem("Back to Tags"),
      ],
    },
  ]);

  if (action === "delete") {
    const ok = await confirmAction(
      `Delete tag ${tag.name}? This cannot be undone.`,
      { tone: "error" }
    );
    if (!ok) {
      console.log(s.muted("  Delete cancelled."));
      await pause();
      return;
    }
    const spin = spinner("Deleting tag...");
    spin.start();
    try {
      await deleteTag(tag.name);
      done(spin, `${tag.name} deleted!`);
    } catch (err) {
      fail(spin, err.message);
    }
    await sleep(600);
  }
}

async function newTag() {
  const { name } = await prompt([
    {
      type: "input",
      name: "name",
      message: s.muted("Tag name (e.g. v1.2.0):"),
      validate: (v) => v.length > 0,
    },
  ]);
  const spin = spinner("Creating tag...");
  spin.start();
  try {
    await createTag(name);
    done(spin, `${name} created!`);
  } catch (err) {
    fail(spin, err.message);
  }
  await sleep(600);
}

async function pushAllTags() {
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

async function doTag() {
  for (;;) {
    const tags = await listTagDetails();
    open("Tag", tags.length > 0 ? `${tags.length} tags` : "No tags");

    if (tags.length === 0) {
      emptyState("No tags yet.", "Tag a release point to reference it later.");
    }

    const choices = [];
    for (const t of tags) {
      choices.push(menuItem(t.name, "primary", t));
    }
    if (tags.length > 0) choices.push(sep());
    choices.push(menuItem("New Tag", "success", "new"));
    choices.push(menuItem("Push Tags", "primary", "push"));
    choices.push(backItem());

    const { action } = await prompt([
      {
        type: "list",
        name: "action",
        message: s.muted("Select a tag or action:"),
        choices,
        pageSize: 15,
        loop: true,
      },
    ]);

    if (action === "back") return;
    if (action === "new") {
      await newTag();
      continue;
    }
    if (action === "push") {
      await pushAllTags();
      continue;
    }

    await showTagDetails(action);
  }
}

module.exports = { doTag };
