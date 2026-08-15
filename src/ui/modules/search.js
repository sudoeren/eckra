const { searchCommits, cherryPick } = require("../../helpers/git");
const { s, pause, truncate, cols } = require("../common");
const { open, menuItem, backItem, sep, prompt, spinner, done, fail, rule } = require("../screen");

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
      await showSearchResults(results.all, query);
    }
  } catch (err) {
    fail(spin, err.message);
    await pause();
  }
}

async function showSearchResults(commits, query) {
  open(`Search Results for: "${query}"`);

  const choices = commits.slice(0, 20).map((commit) => ({
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
  console.log(s.muted("  Author:  ") + s.text(selected.author_name + " <" + selected.author_email + ">"));
  console.log(s.muted("  Date:    ") + s.text(new Date(selected.date).toLocaleString()));
  console.log(rule("message"));
  console.log(s.white(selected.message));
  console.log();

  const { action } = await prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("Action:"),
      choices: [
        menuItem("select", "Cherry-pick this commit", "success", "cherry"),
        backItem("Back to Results"),
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
    await showSearchResults(commits, query);
  }
}

module.exports = { doSearch };
