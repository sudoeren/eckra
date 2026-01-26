const inquirer = require("inquirer");
const ora = require("ora");
const { searchCommits } = require("../../helpers/git");
const { s, header, clear, pause, truncate, timeAgo } = require("../common");

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
    } else {
      console.log(s.muted(`\n  ${results.all.length} results:\n`));
      results.all.slice(0, 10).forEach((commit) => {
        console.log(
          `  ${s.primary(commit.hash.substring(0, 7))} ${s.text(truncate(commit.message, 50))}`,
        );
        console.log(
          s.muted(`         ${commit.author_name} · ${timeAgo(commit.date)}\n`),
        );
      });
    }
  } catch (err) {
    spin.fail(s.error(` ${err.message}`));
  }

  await pause();
}

module.exports = { doSearch };
