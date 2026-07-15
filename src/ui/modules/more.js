const inquirer = require("inquirer");
const { s, header, clear } = require("../common");
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
  clear();
  header();
  console.log(s.bold("  More Options\n"));

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("What would you like to do?"),
      choices: [
        { name: s.warning("  ↩ Undo (Revert last commit)"), value: "undo" },
        {
          name: s.primary("  ✎ Amend (Fix commit message)"),
          value: "amend",
        },
        { name: s.warning("  ⚡ Rebase / Squash"), value: "rebase" },
        { name: s.text("  ≋ Diff (View changes)"), value: "diff" },
        { type: "separator", line: " " },
        { name: s.text("  ⊞ Stash"), value: "stash" },
        { name: s.text("  #  Tag"), value: "tag" },
        { name: s.text("  ↗ Remote"), value: "remote" },
        { type: "separator", line: " " },
        { name: s.text("  ≡ Statistics"), value: "stats" },
        { name: s.text("  ⌕ Search Commits"), value: "search" },
        { name: s.text("  ▤ Blame"), value: "blame" },
        { name: s.text("  ⌂ Worktrees"), value: "worktree" },
        { name: s.text("  ◈ Submodules"), value: "submodule" },
        { name: s.text("  ◷ Project Story"), value: "timeline" },
        { type: "separator", line: " " },
        { name: s.text("  ⚙ Settings"), value: "settings" },
        { name: s.text("  ⊙ About"), value: "about" },
        { name: s.muted("  ← Main Menu"), value: "back" },
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