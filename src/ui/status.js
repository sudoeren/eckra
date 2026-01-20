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
      chalk.green.bold("\n✓ Stage Edilmiş Dosyalar (commit'e hazır):"),
    );
    const stagedTable = new Table({
      head: [chalk.green("Dosya"), chalk.green("Durum")],
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
      chalk.red.bold("\n● Değiştirilmiş Dosyalar (stage edilmemiş):"),
    );
    const modifiedTable = new Table({
      head: [chalk.red("Dosya"), chalk.red("Durum")],
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
    console.log(chalk.blue.bold("\n? İzlenmeyen Dosyalar (untracked):"));
    const untrackedTable = new Table({
      head: [chalk.blue("Dosya")],
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
    console.log(chalk.yellow.bold("\n⚠️  Çakışan Dosyalar (conflict):"));
    const conflictTable = new Table({
      head: [chalk.yellow("Dosya")],
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
          "✨ Çalışma dizini temiz - commit edilecek değişiklik yok.",
        ),
        { padding: 1, borderStyle: "round", borderColor: "green" },
      ),
    );
  } else {
    console.log(chalk.gray("\n─".repeat(40)));
    console.log(
      chalk.white("Özet: ") +
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
