const inquirer = require("inquirer");
const ora = require("ora").default;
const { getCommitHistory } = require("../../helpers/git");
const { generateTimeline, checkAIConnection } = require("../../helpers/ai");
const { s, header, clear, pause, box } = require("../common");

async function doTimeline() {
  clear();
  header();
  console.log(s.bold("  Project Story\n"));
  console.log(s.muted("  AI analyzes your commit history and tells the story of this project.\n"));

  const { count } = await inquirer.prompt([
    {
      type: "list",
      name: "count",
      message: s.muted("How many commits should be analyzed?"),
      choices: [
        { name: s.text("  Last 10 commits (quick)"), value: 10 },
        { name: s.text("  Last 25 commits"), value: 25 },
        { name: s.text("  Last 50 commits"), value: 50 },
        { name: s.text("  Last 100 commits"), value: 100 },
        { name: s.text("  Last 200 commits (comprehensive)"), value: 200 },
        { name: s.muted("  ← Back"), value: 0 },
      ],
      pageSize: 10,
      loop: true,
    },
  ]);

  if (count === 0) return;

  const spin = ora({ text: s.muted(" Fetching commit history..."), spinner: "dots" }).start();

  let commits;
  try {
    commits = (await getCommitHistory(count)).all;
    if (commits.length === 0) {
      spin.fail(s.warning(" No commits found in this repository."));
      await pause();
      return;
    }
    spin.text = s.muted(` Analyzing ${commits.length} commits with AI...`);
  } catch (err) {
    spin.fail(s.error(` Failed to fetch commits: ${err.message}`));
    await pause();
    return;
  }

  try {
    const story = await generateTimeline(commits);
    spin.stop();

    clear();
    header();
    console.log(s.bold(`  Project Story (${commits.length} commits analyzed)\n`));
    console.log(box(story, s.primary("AI-Generated Timeline")));
    console.log();
  } catch (err) {
    spin.fail(s.error(` AI Error: ${err.message}`));
    console.log(s.muted("\n  Check your AI provider configuration in Settings."));
  }

  await pause();
}

module.exports = { doTimeline };
