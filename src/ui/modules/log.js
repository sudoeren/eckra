const { s, pause } = require("../common");
const { open, menuItem, backItem, prompt } = require("../screen");
const { showCommitSelector } = require("./commit-details");

const { getCommitLog } = require("../../helpers/git");

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
      pageSize: 20,
    },
  ]);

  if (viewMode === "back") return;

  if (viewMode === "graph") {
    const { doGraph } = require("./graph");
    await doGraph();
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

  await showCommitSelector({
    commits: log.all,
    backLabel: "Back to Log",
    onBack: showStandardLog,
  });
}

module.exports = { doLog };
