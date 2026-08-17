const { searchCommits } = require("../../helpers/git");
const { s, pause } = require("../common");
const { open, prompt, spinner, fail } = require("../screen");
const { showCommitSelector } = require("./commit-details");

async function doSearch() {
  open("Search Commits", "Find commits by message text");

  const { query } = await prompt([
    {
      type: "input",
      name: "query",
      message: s.muted("Search term:"),
      validate: (v) => v.length > 0,
    },
  ]);

  const spin = spinner("Searching...");
  spin.start();

  try {
    const results = await searchCommits(query);
    spin.stop();

    if (results.all.length === 0) {
      console.log(s.muted("\n  No results found.\n"));
      await pause();
    } else {
      const showResults = () =>
        showCommitSelector({
          commits: results.all,
          title: `Search Results for: "${query}"`,
          backLabel: "Back to Results",
          onBack: showResults,
        });
      await showResults();
    }
  } catch (err) {
    fail(spin, err.message);
    await pause();
  }
}

module.exports = { doSearch };
