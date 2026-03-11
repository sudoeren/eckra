const inquirer = require("inquirer");
const ora = require("ora");
const { searchCommits, cherryPick } = require("../../helpers/git");
const { s, header, clear, pause, truncate, timeAgo, cols } = require("../common");

async function doSearch() {
  clear();
  header();
  console.log(s.bold("  Search Commits\n"));

  const { query } = await inquirer.prompt([
    {
      type: "input",
      name: "query",
      message: s.muted("Search term:"),
      validate: (v) => v.length > 0,
    },
  ]);

  const spin = ora({ text: s.muted(" Searching..."), spinner: "dots" }).start();

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
    spin.fail(s.error(` ${err.message}`));
    await pause();
  }
}

async function showSearchResults(commits, query) {
  clear();
  header();
  console.log(s.bold(`  Search Results for: "${query}"\n`));

  const choices = commits.slice(0, 20).map(commit => ({
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
      loop: false,
    }
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
        { name: s.muted("  ← Back to Results"), value: "back" },
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
    await showSearchResults(commits, query);
  }
}

module.exports = { doSearch };
