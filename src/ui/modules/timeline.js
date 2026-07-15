const inquirer = require("inquirer");
const ora = require("ora");
const { getCommitHistory } = require("../../helpers/git");
const { generateTimeline } = require("../../helpers/ai");
const { s, header, clear, pause } = require("../common");

function parseSections(text) {
  const sections = [];
  const parts = text.split(/\n(?=## )/);
  for (const part of parts) {
    const lines = part.trim().split("\n");
    const headerMatch = lines[0]?.match(/^##\s*(.+)/);
    if (headerMatch) {
      sections.push({
        title: headerMatch[1].trim(),
        content: lines.slice(1).join("\n").trim(),
      });
    } else {
      sections.push({
        title: "Timeline",
        content: part.trim(),
      });
    }
  }
  return sections;
}

function renderSection(title, content, icon, colorFn) {
  console.log(colorFn(`  ${icon} ${title}`));
  console.log(s.dim("  " + "─".repeat(Math.min(process.stdout.columns - 4, 60))));
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      console.log();
    } else if (trimmed.startsWith("- ")) {
      console.log(s.text("    " + trimmed));
    } else {
      const wrapped = wrapText(trimmed, process.stdout.columns - 8);
      for (const w of wrapped) {
        console.log(s.text("    " + w));
      }
    }
  }
  console.log();
}

function wrapText(text, maxWidth) {
  if (text.length <= maxWidth) return [text];
  const result = [];
  let remaining = text;
  while (remaining.length > maxWidth) {
    let breakAt = remaining.lastIndexOf(" ", maxWidth);
    if (breakAt === -1 || breakAt === 0) breakAt = maxWidth;
    result.push(remaining.substring(0, breakAt).trim());
    remaining = remaining.substring(breakAt).trim();
  }
  if (remaining) result.push(remaining);
  return result;
}

function renderStory(story, commitCount, commits) {
  const firstDate = commits[commits.length - 1]?.date;
  const lastDate = commits[0]?.date;

  clear();
  header();
  console.log(s.bold("  Project Story\n"));

  if (firstDate && lastDate) {
    const from = new Date(firstDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    const to = new Date(lastDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    console.log(s.muted(`  ${commitCount} commits  ·  ${from} → ${to}\n`));
  } else {
    console.log(s.muted(`  ${commitCount} commits analyzed\n`));
  }

  const sections = parseSections(story);

  const styleMap = {
    "timeline": { icon: "◆", color: s.primary },
    "key milestones": { icon: "★", color: s.success },
    "contributors": { icon: "👥", color: s.brand },
    "patterns & insights": { icon: "💡", color: s.warning },
    "patterns and insights": { icon: "💡", color: s.warning },
  };

  for (const sec of sections) {
    const key = sec.title.toLowerCase();
    const style = styleMap[key] || { icon: "·", color: s.primary };
    renderSection(sec.title, sec.content, style.icon, style.color);
  }
}

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
    renderStory(story, commits.length, commits);
  } catch (err) {
    spin.fail(s.error(` AI Error: ${err.message}`));
    console.log(s.muted("\n  Check your AI provider configuration in Settings."));
  }

  await pause();
}

module.exports = { doTimeline, renderStory };
