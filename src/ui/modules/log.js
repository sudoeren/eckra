const inquirer = require("inquirer");
const ora = require("ora");
const { getCommitLog, getGitGraph, cherryPick } = require("../../helpers/git");
const { s, header, clear, truncate, timeAgo, pause, cols } = require("../common");

async function doLog() {
  clear();
  header();
  console.log(s.bold("  Commit History\n"));

  const { viewMode } = await inquirer.prompt([
    {
      type: "list",
      name: "viewMode",
      message: s.muted("Select view mode:"),
      choices: [
        { name: s.text("  Standard View (Interactive)"), value: "standard" },
        { name: s.text("  Graph View (Tree)"), value: "graph" },
        { name: s.muted("  ← Back"), value: "back" },
      ],
      loop: true,
      pageSize: 20,
    },
  ]);

  if (viewMode === "back") return;

  if (viewMode === "graph") {
    clear();
    header();
    console.log(s.bold("  Git Graph\n"));
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

  const choices = log.all.map(commit => ({
    name: `  ${s.primary(commit.hash.substring(0, 7))} ${truncate(commit.message, cols() - 25)}`,
    value: commit,
  }));

  choices.push({ type: "separator", line: " " });
  choices.push({ name: s.muted("  ← Back"), value: "back" });

  const { selected } = await inquirer.prompt([
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

  clear();
  header();
  console.log(s.bold("  Commit Details\n"));
  console.log(s.muted("  Hash:    ") + s.primary(selected.hash));
  console.log(s.muted("  Author:  ") + s.text(selected.author_name + " <" + selected.author_email + ">"));
  console.log(s.muted("  Date:    ") + s.text(new Date(selected.date).toLocaleString()));
  console.log(s.muted("  Message: ") + s.white(selected.message));
  console.log();

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("Action:"),
      choices: [
        { name: s.success("  🍒 Cherry-pick this commit"), value: "cherry" },
        { name: s.muted("  ← Back to Log"), value: "back" },
      ]
    }
  ]);

  if (action === "cherry") {
    const spin = ora({ text: s.muted(" Cherry-picking..."), spinner: "dots" }).start();
    try {
      await cherryPick(selected.hash);
      spin.succeed(s.success(` Successfully cherry-picked ${selected.hash.substring(0, 7)}`));
    } catch (error) {
      spin.fail(s.error(` Cherry-pick failed: ${error.message}`));
      console.log(s.muted("\n  You may have conflicts to resolve."));
    }
    await pause();
  } else {
    await showStandardLog();
  }
}

module.exports = { doLog };
