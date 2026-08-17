const { s } = require("../common");
const { open, menuItem, backItem, sep, prompt } = require("../screen");
const { doUndo } = require("./undo");
const { doAmend } = require("./amend");
const { doDiff } = require("./diff");
const { doStash } = require("./stash");
const { doTag } = require("./tag");
const { doRemote } = require("./remote");
const { doStats } = require("./stats");
const { doSearch } = require("./search");
const { doBlame } = require("./blame");
const { doWorktree } = require("./worktree");
const { doSubmodule } = require("./submodule");
const { doSettings } = require("./settings");
const { doRebase } = require("./rebase");
const { doTimeline } = require("./timeline");
const { doAbout } = require("./about");

async function doMore() {
  open("More Options");

  const { action } = await prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("What would you like to do?"),
      choices: [
        menuItem("Undo (Revert last commit)", "warning", "undo"),
        menuItem("Amend (Fix commit message)", "primary", "amend"),
        menuItem("Rebase / Squash", "warning", "rebase"),
        menuItem("Diff (View changes)", "text", "diff"),
        sep(),
        menuItem("Stash", "text", "stash"),
        menuItem("Tag", "text", "tag"),
        menuItem("Remote", "text", "remote"),
        sep(),
        menuItem("Statistics", "text", "stats"),
        menuItem("Search Commits", "text", "search"),
        menuItem("Blame", "text", "blame"),
        menuItem("Worktrees", "text", "worktree"),
        menuItem("Submodules", "text", "submodule"),
        menuItem("Project Story", "text", "timeline"),
        sep(),
        menuItem("Settings", "text", "settings"),
        menuItem("About", "text", "about"),
        backItem("Main Menu"),
      ],
      pageSize: 20,
      loop: true,
    },
  ]);

  if (action === "back") return;

  switch (action) {
    case "undo":
      await doUndo();
      break;
    case "amend":
      await doAmend();
      break;
    case "rebase":
      await doRebase();
      break;
    case "diff":
      await doDiff();
      break;
    case "stash":
      await doStash();
      break;
    case "tag":
      await doTag();
      break;
    case "remote":
      await doRemote();
      break;
    case "stats":
      await doStats();
      break;
    case "search":
      await doSearch();
      break;
    case "blame":
      await doBlame();
      break;
    case "worktree":
      await doWorktree();
      break;
    case "submodule":
      await doSubmodule();
      break;
    case "timeline":
      await doTimeline();
      break;
    case "settings":
      await doSettings();
      break;
    case "about":
      await doAbout();
      break;
  }
}

module.exports = { doMore };
