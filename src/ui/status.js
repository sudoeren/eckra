const chalk = require("chalk");
const Table = require("cli-table3");
const boxen = require("boxen");
const {
  getGitStatus,
  getCurrentBranch,
  getRemotes,
} = require("../helpers/git");

async function showStatus() {
  const status = await getGitStatus();
  const remotes = await getRemotes();

  console.log("\n");

  // Branch info
  console.log(
    boxen(
      chalk.cyan("🌿 Branch: ") +
      chalk.yellow.bold(status.current) +
      (status.tracking ? chalk.gray(` → ${status.tracking}`) : "") +
      (status.ahead ? chalk.green(` ↑${status.ahead}`) : "") +
      (status.behind ? chalk.red(` ↓${status.behind}`) : ""),
      {
        padding: { left: 2, right: 2, top: 0, bottom: 0 },
        borderStyle: "round",
        borderColor: "cyan",
      },
    ),
  );

  // Staged files
  if (status.staged.length > 0) {
    console.log(
      chalk.green.bold("\n✓ Staged Files (ready to commit):"),
    );
    const stagedTable = new Table({
      head: [chalk.green("File"), chalk.green("Status")],
      colWidths: [50, 15],
      style: { head: [], border: ["gray"] },
    });

    status.staged.forEach((file) => {
      let fileStatus = "modified";
      if (status.created.includes(file)) fileStatus = "new file";
      if (status.deleted.includes(file)) fileStatus = "deleted";
      if (status.renamed.includes(file)) fileStatus = "renamed";

      stagedTable.push([chalk.green(file), chalk.green(fileStatus)]);
    });

    console.log(stagedTable.toString());
  }

  // Modified files (not staged)
  if (status.modified.length > 0 || status.deleted.length > 0) {
    console.log(
      chalk.red.bold("\n● Modified Files (not staged):"),
    );
    const modifiedTable = new Table({
      head: [chalk.red("File"), chalk.red("Status")],
      colWidths: [50, 15],
      style: { head: [], border: ["gray"] },
    });

    status.modified.forEach((file) => {
      if (!status.staged.includes(file)) {
        modifiedTable.push([chalk.red(file), chalk.red("modified")]);
      }
    });

    status.deleted.forEach((file) => {
      if (!status.staged.includes(file)) {
        modifiedTable.push([chalk.red(file), chalk.red("deleted")]);
      }
    });

    if (modifiedTable.length > 0) {
      console.log(modifiedTable.toString());
    }
  }

  // Untracked files
  if (status.not_added.length > 0) {
    console.log(chalk.blue.bold("\n? Untracked Files:"));
    const untrackedTable = new Table({
      head: [chalk.blue("File")],
      colWidths: [65],
      style: { head: [], border: ["gray"] },
    });

    status.not_added.forEach((file) => {
      untrackedTable.push([chalk.blue(file)]);
    });

    console.log(untrackedTable.toString());
  }

  // Conflicted files
  if (status.conflicted.length > 0) {
    console.log(chalk.yellow.bold("\n⚠️  Conflicted Files:"));
    const conflictTable = new Table({
      head: [chalk.yellow("File")],
      colWidths: [65],
      style: { head: [], border: ["gray"] },
    });

    status.conflicted.forEach((file) => {
      conflictTable.push([chalk.yellow(file)]);
    });

    console.log(conflictTable.toString());
  }

  // Summary
  const totalChanges =
    status.staged.length + status.modified.length + status.not_added.length;

  if (totalChanges === 0) {
    console.log(
      boxen(
        chalk.green(
          "✨ Working directory clean - nothing to commit.",
        ),
        { padding: 1, borderStyle: "round", borderColor: "green" },
      ),
    );
  } else {
    console.log(chalk.gray("\n─".repeat(40)));
    console.log(
      chalk.white("Summary: ") +
      chalk.green(`${status.staged.length} staged`) +
      chalk.gray(" | ") +
      chalk.red(`${status.modified.length} modified`) +
      chalk.gray(" | ") +
      chalk.blue(`${status.not_added.length} untracked`),
    );
  }

  // Remote info
  if (remotes.length > 0) {
    console.log(chalk.gray("\n📡 Remotes:"));
    remotes.forEach((remote) => {
      console.log(
        chalk.gray(`   ${remote.name}: `) +
        chalk.white(remote.refs.fetch || remote.refs.push),
      );
    });
  }

  console.log("\n");
}

module.exports = {
  showStatus,
};
