const { getCommitHistory } = require("../../helpers/git");
const { generateTimeline } = require("../../helpers/ai");
const { s, pause, cols } = require("../common");
const {
  open,
  rule,
  menuItem,
  backItem,
  prompt,
  spinner,
  fail,
  tone,
} = require("../screen");

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

function renderSection(title, content, t) {
  console.log(tone(t)(`  ${title}`));
  console.log(rule());
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      console.log();
    } else if (trimmed.startsWith("- ")) {
      console.log(s.text("    " + trimmed));
    } else {
      const wrapped = wrapText(trimmed, cols() - 8);
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

  open("Project Story");

  if (firstDate && lastDate) {
    const from = new Date(firstDate).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    const to = new Date(lastDate).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    console.log(s.muted(`  ${commitCount} commits  ·  ${from} → ${to}\n`));
  } else {
    console.log(s.muted(`  ${commitCount} commits analyzed\n`));
  }

  const sections = parseSections(story);

  const styleMap = {
    timeline: "primary",
    "key milestones": "success",
    contributors: "ai",
    "patterns & insights": "warning",
    "patterns and insights": "warning",
  };

  for (const sec of sections) {
    const key = sec.title.toLowerCase();
    const t = styleMap[key] || "primary";
    renderSection(sec.title, sec.content, t);
  }
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
      loop: true,
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

  try {
    const story = await generateTimeline(commits);
    spin.stop();
    renderStory(story, commits.length, commits);
  } catch (err) {
    fail(spin, `AI Error: ${err.message}`);
    console.log(
      s.muted("\n  Check your AI provider configuration in Settings.")
    );
  }

  await pause();
}

module.exports = { doTimeline, renderStory };
