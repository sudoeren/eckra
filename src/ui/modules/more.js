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
      message: "What would you like to do?",
      choices: [
        menuItem("undo", "Undo (Revert last commit)", "warning", "undo"),
        menuItem("amend", "Amend (Fix commit message)", "primary", "amend"),
        menuItem("rebase", "Rebase / Squash", "warning", "rebase"),
        menuItem("diff", "Diff (View changes)", "text", "diff"),
        sep(),
        menuItem("stash", "Stash", "text", "stash"),
        menuItem("tag", "Tag", "text", "tag"),
        menuItem("remote", "Remote", "text", "remote"),
        sep(),
        menuItem("stats", "Statistics", "text", "stats"),
        menuItem("search", "Search Commits", "text", "search"),
        menuItem("blame", "Blame", "text", "blame"),
        menuItem("worktree", "Worktrees", "text", "worktree"),
        menuItem("submodule", "Submodules", "text", "submodule"),
        menuItem("story", "Project Story", "text", "timeline"),
        sep(),
        menuItem("settings", "Settings", "text", "settings"),
        menuItem("about", "About", "text", "about"),
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
