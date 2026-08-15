const ora = require("ora").default || require("ora");
const { getRepoStats } = require("../../helpers/git");
const { s, header, clear, pause } = require("../common");

async function doStats() {
  clear();
  header();
  console.log(s.bold("  Statistics\n"));

  const spin = ora({
    text: s.muted(" Calculating..."),
    spinner: "dots",
  }).start();

  try {
    const stats = await getRepoStats();
    spin.stop();

    console.log(s.primary(`  ${stats.totalCommits}`) + s.text(" commits"));
    console.log(s.primary(`  ${stats.branches}`) + s.text(" branches"));
    console.log(s.primary(`  ${stats.tags}`) + s.text(" tags"));
    console.log();

    if (stats.firstCommit) {
      console.log(
        s.muted("  First commit: ") +
        s.text(new Date(stats.firstCommit.date).toLocaleDateString("en-US")),
      );
      console.log(
        s.muted("  Last commit: ") +
        s.text(new Date(stats.lastCommit.date).toLocaleDateString("en-US")),
      );
      console.log();
    }

    // Top contributors
    const authors = Object.entries(stats.authors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    if (authors.length > 0) {
      console.log(s.muted("  Top contributors:"));
      authors.forEach(([name, count]) => {
        const bar = "█".repeat(
          Math.min(Math.round((count / stats.totalCommits) * 15), 15),
        );
        console.log(`  ${s.primary(bar)} ${name} (${count})`);
      });
    }
  } catch (err) {
    spin.fail(s.error(` ${err.message}`));
  }

  console.log();
  await pause();
}

module.exports = { doStats };
