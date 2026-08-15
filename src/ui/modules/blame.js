const { getTrackedFiles, getBlame } = require("../../helpers/git");
const { s, pause, truncate, cols, rows } = require("../common");
const { open, emptyState, prompt, spinner, fail, clear } = require("../screen");

async function doBlame() {
  open("Blame", "Show who changed each line of a file");

  const files = await getTrackedFiles();

  if (files.length === 0) {
    emptyState("No tracked files.");
    await pause();
    return;
  }

  const { file } = await prompt([
    {
      type: "list",
      name: "file",
      message: s.muted("Select file:"),
      choices: files.slice(0, 30),
      pageSize: 15,
    },
  ]);

  const spin = spinner("Loading...");
  spin.start();

  try {
    const blame = await getBlame(file);
    spin.stop();

    clear();
    console.log(s.bold(`\n  ${file}\n`));

    blame.slice(0, rows() - 5).forEach((b, i) => {
      const lineNum = s.muted(String(i + 1).padStart(4));
      const hash = s.primary((b.hash || "").substring(0, 7));
      const author = s.muted(truncate(b.author || "", 10).padEnd(10));
      const code = truncate(b.line || "", cols() - 30);
      console.log(`${lineNum} ${hash} ${author} ${code}`);
    });
  } catch (err) {
    fail(spin, err.message);
  }

  console.log();
  await pause();
}

module.exports = { doBlame };
