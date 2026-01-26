const inquirer = require("inquirer");
const ora = require("ora");
const { getTrackedFiles, getBlame } = require("../../helpers/git");
const { s, header, clear, pause, truncate, cols, rows } = require("../common");

async function doBlame() {
  clear();
  header();
  console.log(s.bold("  Blame\n"));

  const files = await getTrackedFiles();

  if (files.length === 0) {
    console.log(s.muted("  No tracked files.\n"));
    await pause();
    return;
  }

  const { file } = await inquirer.prompt([
    {
      type: "list",
      name: "file",
      message: s.muted("Select file:"),
      choices: files.slice(0, 30),
      pageSize: 15,
    },
  ]);

  const spin = ora({
    text: s.muted(" Loading..."),
    spinner: "dots",
  }).start();

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
    spin.fail(s.error(` ${err.message}`));
  }

  console.log();
  await pause();
}

module.exports = { doBlame };
