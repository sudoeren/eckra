const { getTrackedFiles, getBlame } = require("../../helpers/git");
const { s, pause, truncate, cols, rows } = require("../common");
const {
  open,
  emptyState,
  menuItem,
  backItem,
  prompt,
  spinner,
  fail,
} = require("../screen");

// Header, title, rule and the action menu take the rest of the screen.
const pageSize = () => Math.max(5, rows() - 14);

/**
 * Pick any tracked file by typing part of its path. Returns null on Back.
 */
async function pickFile(files) {
  const back = backItem("Back", null);
  const { file } = await prompt([
    {
      type: "autocomplete",
      name: "file",
      message: s.muted("Select file (type to search):"),
      source: (_answers, input) => {
        if (!input) return [...files, back];
        const term = input.toLowerCase();
        return [...files.filter((f) => f.toLowerCase().includes(term)), back];
      },
      pageSize: 15,
    },
  ]);
  return file;
}

function renderPage(file, blame, page) {
  const size = pageSize();
  const start = page * size;
  const pages = Math.max(1, Math.ceil(blame.length / size));
  const width = String(blame.length).length;

  open(
    `Blame: ${file}`,
    `${blame.length} lines · page ${page + 1} of ${pages}`
  );
  blame.slice(start, start + size).forEach((b, i) => {
    const lineNum = s.muted(String(start + i + 1).padStart(Math.max(4, width)));
    const hash = s.primary((b.hash || "").substring(0, 7));
    const author = s.muted(truncate(b.author || "", 10).padEnd(10));
    const code = truncate(b.line || "", cols() - 30);
    console.log(`${lineNum} ${hash} ${author} ${code}`);
  });
  console.log();
}

/**
 * Page through a file's blame. Returns false when the user wants to leave
 * Blame altogether, true to pick another file.
 */
async function showBlame(file, blame) {
  let page = 0;

  for (;;) {
    renderPage(file, blame, page);

    const choices = [];
    if ((page + 1) * pageSize() < blame.length) {
      choices.push(menuItem("Next Page", "primary", "next"));
    }
    if (page > 0) choices.push(menuItem("Previous Page", "primary", "prev"));
    choices.push(menuItem("Another File", "text", "file"));
    choices.push(backItem());

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

    if (action === "next") page++;
    else if (action === "prev") page--;
    else return action === "file";
  }
}

async function doBlame() {
  for (;;) {
    open("Blame", "Show who changed each line of a file");

    const files = await getTrackedFiles();
    if (files.length === 0) {
      emptyState("No tracked files.");
      await pause();
      return;
    }

    const file = await pickFile(files);
    if (!file) return;

    const spin = spinner("Loading...");
    spin.start();
    let blame;
    try {
      blame = await getBlame(file);
      spin.stop();
    } catch (err) {
      fail(spin, err.message);
      await pause();
      continue;
    }

    if (blame.length === 0) {
      emptyState("Nothing to blame in this file.");
      await pause();
      continue;
    }

    if (!(await showBlame(file, blame))) return;
  }
}

module.exports = { doBlame };
