const { getCommitHistory } = require("../../helpers/git");
const { generateTimeline } = require("../../helpers/ai");
const { s, pause } = require("../common");
const {
  open,
  menuItem,
  backItem,
  prompt,
  spinner,
  fail,
  showPages,
} = require("../screen");
const { renderMarkdown } = require("../markdown");

const SECTION_TONES = {
  timeline: "primary",
  "key milestones": "success",
  contributors: "ai",
  "patterns & insights": "warning",
  "patterns and insights": "warning",
};

const formatDate = (date) =>
  new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

/**
 * "25 commits  ·  Sep 18, 2026 → Oct 3, 2026" for the analyzed range.
 */
function storySummary(commits) {
  const firstDate = commits[commits.length - 1]?.date;
  const lastDate = commits[0]?.date;
  return firstDate && lastDate
    ? `${commits.length} commits  ·  ${formatDate(firstDate)} → ${formatDate(lastDate)}`
    : `${commits.length} commits analyzed`;
}

/**
 * The story laid out for the terminal, one string per line.
 */
function storyLines(story) {
  return renderMarkdown(story, {
    headingTone: (title) => SECTION_TONES[title.toLowerCase()] || "primary",
  });
}

/**
 * Print the whole story at once (used by `eckra story --count`, where the
 * terminal's own scrollback is available).
 */
function renderStory(story, _commitCount, commits) {
  open("Project Story", storySummary(commits));
  storyLines(story).forEach((line) => console.log(line));
  console.log();
}

async function doTimeline() {
  open(
    "Project Story",
    "AI analyzes your commit history and tells the story of this project."
  );

  const { count } = await prompt([
    {
      type: "list",
      name: "count",
      message: s.muted("How many commits should be analyzed?"),
      choices: [
        menuItem("Last 10 commits (quick)", "text", 10),
        menuItem("Last 25 commits", "text", 25),
        menuItem("Last 50 commits", "text", 50),
        menuItem("Last 100 commits", "text", 100),
        menuItem("Last 200 commits (comprehensive)", "text", 200),
        backItem(),
      ],
      pageSize: 10,
    },
  ]);

  if (count === "back" || count === 0) return;

  const spin = spinner("Fetching commit history...");
  spin.start();

  let commits;
  try {
    commits = (await getCommitHistory(count)).all;
    if (commits.length === 0) {
      fail(spin, "No commits found in this repository.");
      await pause();
      return;
    }
    spin.text = s.muted(`  Analyzing ${commits.length} commits with AI...`);
  } catch (err) {
    fail(spin, `Failed to fetch commits: ${err.message}`);
    await pause();
    return;
  }

  let story;
  try {
    story = await generateTimeline(commits);
    spin.stop();
  } catch (err) {
    fail(spin, `AI Error: ${err.message}`);
    console.log(
      s.muted("\n  Check your AI provider configuration in Settings.")
    );
    await pause();
    return;
  }

  // Paged: the dashboard has no scrollback and a story rarely fits a screen.
  await showPages("Project Story", storySummary(commits), storyLines(story));
}

module.exports = { doTimeline, renderStory };
