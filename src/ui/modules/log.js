const inquirer = require("inquirer");
const { getCommitLog, getGitGraph } = require("../../helpers/git");
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
        { name: s.text("Standard View"), value: "standard" },
        { name: s.text("Graph View (Tree)"), value: "graph" },
      ],
    },
  ]);

  console.log();

  if (viewMode === "graph") {
    try {
      const graph = await getGitGraph(20);
      console.log(graph);
    } catch (error) {
      console.log(s.error("Could not load graph view: " + error.message));
    }
  } else {
    const log = await getCommitLog(15);

    if (log.all.length === 0) {
      console.log(s.muted("  No commits yet.\n"));
      await pause();
      return;
    }

    log.all.forEach((commit) => {
      const hash = s.primary(commit.hash.substring(0, 7));
      const msg = truncate(commit.message, cols() - 30);
      const time = s.muted(timeAgo(commit.date));
      console.log(`  ${hash} ${s.text(msg)}`);
      console.log(s.muted(`         ${commit.author_name} · ${time}\n`));
    });
  }

  await pause();
}

module.exports = { doLog };
