const { s, cols, truncate, timeAgo, pause } = require("../common");
const {
  open,
  menuItem,
  backItem,
  prompt,
  spinner,
  fail,
  strWidth,
} = require("../screen");
const { getGraphData, getRemotes } = require("../../helpers/git");
const { buildGraphLayout, parseRefs } = require("../../helpers/graph");
const { showCommitSelector } = require("./commit-details");

const PAGE_SIZE = 25;

function cellStyle(name) {
  return s[name] || s.text;
}

/**
 * Render the colored graph prefix for a row's cells.
 */
function renderPrefix(cells) {
  return cells
    .map((cell) => (cell ? cellStyle(cell.color)(cell.char) : " "))
    .join("");
}

/**
 * Build the ref decoration for a commit, preserving git's ordering:
 * "HEAD -> branch", then tags, then remotes. Returns an array of
 * { text, tone } segments.
 */
function refSegments(decorations, remoteNames) {
  const refs = parseRefs(decorations, remoteNames);
  const segs = [];
  if (refs.head) {
    segs.push({
      text:
        refs.head +
        (refs.branches.length ? " -> " + refs.branches.join(", ") : ""),
      tone: "primary",
    });
  } else if (refs.branches.length) {
    segs.push({ text: refs.branches.join(", "), tone: "primary" });
  }
  if (refs.tags.length)
    segs.push({ text: refs.tags.join(", "), tone: "warning" });
  if (refs.remotes.length) {
    segs.push({ text: refs.remotes.join(", "), tone: "muted" });
  }
  return segs;
}

function renderRefs(decorations, remoteNames) {
  const segs = refSegments(decorations, remoteNames);
  if (segs.length === 0) return { plain: "", colored: "" };
  const plain = " (" + segs.map((s) => s.text).join(", ") + ")";
  const colored =
    " (" +
    segs.map((sg) => cellStyle(sg.tone)(sg.text)).join(s.muted(", ")) +
    ")";
  return { plain, colored };
}

function renderRows(graphRows, page, total, remoteNames) {
  const width = cols();
  const lines = [];

  for (const row of graphRows) {
    const prefix = renderPrefix(row.cells);
    const prefixW = row.cells.length;

    if (row.type === "connector") {
      lines.push("  " + prefix);
      continue;
    }

    const c = row.commit;
    const hash = s.muted(c.hash.substring(0, 7));
    const refs = renderRefs(c.refs, remoteNames);
    const metaPlain = truncate(`${c.author} · ${timeAgo(c.timestamp)}`, 26);
    const meta = s.muted(metaPlain);
    const metaW = strWidth(metaPlain);

    const fixed = 2 + prefixW + 1 + 7 + 1;
    const avail = width - fixed - metaW - 1;
    const subjectMax = Math.max(0, avail - strWidth(refs.plain));
    const subjectPlain = truncate(c.subject, subjectMax);
    const subject = s.bold(subjectPlain);
    const pad = Math.max(
      0,
      width - fixed - strWidth(subjectPlain) - strWidth(refs.plain) - metaW - 1
    );

    lines.push(
      "  " +
        prefix +
        " " +
        hash +
        " " +
        subject +
        refs.colored +
        " ".repeat(pad) +
        meta
    );
  }

  console.log(lines.join("\n"));
  console.log();
  if (total > 0) {
    const pages = Math.ceil(total / PAGE_SIZE);
    console.log(s.dim(`  Page ${page + 1}/${pages} · ${total} commits`));
  }
}

async function inspectCommit(graphRows) {
  const commits = graphRows
    .filter((r) => r.type === "node")
    .map((r) => r.commit);
  if (commits.length === 0) return;

  const adapted = commits.map((c) => ({
    hash: c.hash,
    message: c.subject,
    author_name: c.author,
    author_email: c.email,
    date: new Date(c.timestamp),
  }));

  await showCommitSelector({
    commits: adapted,
    title: "Git Graph",
    backLabel: "Back to Graph",
  });
}

/**
 * Interactive VS Code-style commit graph. Shows the full branch topology
 * across all refs with per-lane colors, with pagination and commit
 * inspection.
 */
async function doGraph() {
  let page = 0;
  let allRows = null;
  let total = 0;
  let remoteNames = [];

  for (;;) {
    open("Git Graph");

    if (allRows === null) {
      const spin = spinner("Loading commit graph...");
      spin.start();
      try {
        const commits = await getGraphData(200);
        total = commits.length;
        spin.stop();
        if (commits.length === 0) {
          console.log(s.muted("  No commits yet."));
          console.log();
          await pause();
          return;
        }
        remoteNames = (await getRemotes()).map((r) => r.name);
        allRows = buildGraphLayout(commits);
      } catch (error) {
        fail(spin, "Could not load graph: " + error.message);
        await pause();
        return;
      }
    }

    const pageRows = allRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    renderRows(pageRows, page, total, remoteNames);

    const choices = [];
    if ((page + 1) * PAGE_SIZE < total) {
      choices.push(menuItem("Next Page", "primary", "next"));
    }
    if (page > 0) {
      choices.push(menuItem("Previous Page", "primary", "prev"));
    }
    choices.push(menuItem("Inspect Commit", "text", "inspect"));
    choices.push(backItem("Back to Menu"));

    const { action } = await prompt([
      {
        type: "list",
        name: "action",
        message: s.muted("Actions:"),
        choices,
        pageSize: 10,
        loop: true,
      },
    ]);

    if (action === "next") {
      page++;
    } else if (action === "prev") {
      page--;
    } else if (action === "inspect") {
      await inspectCommit(pageRows);
    } else if (action === "back") {
      return;
    }
  }
}

module.exports = { doGraph };
