const { getCommitLog, getGitGraph, cherryPick } = require("../../helpers/git");
const { s, truncate, pause, cols } = require("../common");
const {
  open,
  rule,
  menuItem,
  backItem,
  sep,
  prompt,
  spinner,
  done,
  fail,
} = require("../screen");

async function doLog() {
  open("Commit History");

  const { viewMode } = await prompt([
    {
      type: "list",
      name: "viewMode",
      message: s.muted("Select view mode:"),
      choices: [
        menuItem("Standard View (Interactive)", "text", "standard"),
        menuItem("Graph View (Tree)", "text", "graph"),
        backItem(),
      ],
      loop: true,
      pageSize: 20,
    },
  ]);

  if (viewMode === "back") return;

  if (viewMode === "graph") {
    open("Git Graph");
    try {
      const graph = await getGitGraph(30);
      console.log(graph);
    } catch (error) {
      console.log(s.error("  Could not load graph view: " + error.message));
    }
    await pause();
  } else {
    await showStandardLog();
  }
}

async function showStandardLog() {
  const log = await getCommitLog(20);

  if (log.all.length === 0) {
    console.log(s.muted("  No commits yet.\n"));
    await pause();
    return;
  }

  const choices = log.all.map((commit) => ({
    name: `  ${s.primary(commit.hash.substring(0, 7))} ${truncate(commit.message, cols() - 25)}`,
    value: commit,
  }));

  choices.push(sep());
  choices.push(backItem());

  const { selected } = await prompt([
    {
      type: "list",
      name: "selected",
      message: s.muted("Select a commit for more options:"),
      choices,
      pageSize: 15,
      loop: true,
    },
  ]);

  if (selected === "back") return;

  open("Commit Details");
  console.log(s.muted("  Hash:    ") + s.primary(selected.hash));
  console.log(
    s.muted("  Author:  ") +
      s.text(selected.author_name + " <" + selected.author_email + ">")
  );
  console.log(
    s.muted("  Date:    ") + s.text(new Date(selected.date).toLocaleString())
  );
  console.log(rule("message"));
  console.log(s.white(selected.message));
  console.log();

  const { action } = await prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("Action:"),
      choices: [
        menuItem("Cherry-pick this commit", "success", "cherry"),
        backItem("Back to Log"),
      ],
    },
  ]);

  if (action === "cherry") {
    const spin = spinner("Cherry-picking...");
    spin.start();
    try {
      await cherryPick(selected.hash);
      done(spin, `Successfully cherry-picked ${selected.hash.substring(0, 7)}`);
    } catch (error) {
      fail(spin, `Cherry-pick failed: ${error.message}`);
      console.log(s.muted("\n  You may have conflicts to resolve."));
    }
    await pause();
  } else {
    await showStandardLog();
  }
}

module.exports = { doLog };
