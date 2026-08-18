const { getRepoStats } = require("../../helpers/git");
const { s, pause } = require("../common");
const { open, rule, spinner, fail } = require("../screen");

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function bar(count, max, width = 18) {
  const filled = max > 0 ? Math.round((count / max) * width) : 0;
  return s.primary("█".repeat(Math.max(filled, count > 0 ? 1 : 0)));
}

function share(part, total) {
  return total > 0 ? ((part / total) * 100).toFixed(1) + "%" : "0%";
}

async function doStats() {
  open("Statistics");

  const spin = spinner("Calculating...");
  spin.start();

  try {
    const stats = await getRepoStats();
    spin.stop();

    console.log(
      s.primary(`  ${stats.totalCommits}`) +
        s.text(" commits") +
        s.muted("  ·  ") +
        s.primary(`${stats.branches}`) +
        s.text(" branches") +
        s.muted("  ·  ") +
        s.primary(`${stats.remoteBranches}`) +
        s.text(" remote") +
        s.muted("  ·  ") +
        s.primary(`${stats.tags}`) +
        s.text(" tags") +
        s.muted("  ·  ") +
        s.primary(`${stats.merges}`) +
        s.text(" merges")
    );
    console.log(s.muted("  Authors:  ") + s.text(String(stats.totalAuthors)));
    console.log();

    if (stats.firstCommit) {
      console.log(
        s.muted("  First commit:  ") +
          s.text(
            new Date(stats.firstCommit.date).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          )
      );
      console.log(
        s.muted("  Last commit:   ") +
          s.text(
            new Date(stats.lastCommit.date).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          )
      );
      console.log();
    }

    if (stats.activity.length > 0) {
      console.log(rule("commit activity"));
      const visible = stats.activity.slice(-12);
      const max = Math.max(...visible.map((a) => a.count));
      for (const a of visible) {
        const label = a.period.padEnd(8);
        console.log(
          `  ${s.muted(label)} ${bar(a.count, max)} ${s.muted(a.count)}`
        );
      }
      if (visible.length < stats.activity.length) {
        console.log(s.dim(`  … ${stats.activity.length - 12} earlier months`));
      }
      console.log();
    }

    const authors = Object.entries(stats.authors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    if (authors.length > 0) {
      console.log(rule("top contributors"));
      const max = authors[0][1];
      for (const [name, count] of authors) {
        console.log(
          `  ${bar(count, max)} ${name} ${s.muted(
            `(${count} · ${share(count, stats.totalCommits)})`
          )}`
        );
      }
      console.log();
    }

    const dayMax = Math.max(...stats.byDayOfWeek);
    if (dayMax > 0) {
      console.log(rule("by day of week"));
      for (let i = 0; i < 7; i++) {
        console.log(
          `  ${s.muted(DAY_NAMES[i].padEnd(3))} ${bar(
            stats.byDayOfWeek[i],
            dayMax,
            12
          )} ${s.muted(stats.byDayOfWeek[i])}`
        );
      }
      console.log();
    }

    const blocks = [
      ["00-05", 0, 6],
      ["06-11", 6, 6],
      ["12-17", 12, 6],
      ["18-23", 18, 6],
    ];
    const blockCounts = blocks.map(([, start, len]) =>
      stats.byHour.slice(start, start + len).reduce((a, b) => a + b, 0)
    );
    const blockMax = Math.max(...blockCounts);
    if (blockMax > 0) {
      console.log(rule("by time of day"));
      blocks.forEach(([label], i) => {
        console.log(
          `  ${s.muted(label)} ${bar(blockCounts[i], blockMax, 12)} ${s.muted(
            blockCounts[i]
          )}`
        );
      });
      console.log();
    }
  } catch (err) {
    fail(spin, err.message);
  }

  await pause();
}

module.exports = { doStats };
