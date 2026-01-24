const chalk = require("chalk");
const Table = require("cli-table3");
const inquirer = require("inquirer");
const { getCommitLog } = require("../helpers/git");

async function showLog(count = 10) {
  const { logCount } = await inquirer.prompt([
    {
      type: "input",
      name: "logCount",
      message: "How many commits to show?",
      default: count.toString(),
      validate: (input) => {
        const num = parseInt(input);
        if (isNaN(num) || num < 1) return "Please enter a valid number";
        if (num > 100) return "Maximum 100 commits can be shown";
        return true;
      },
    },
  ]);

  const log = await getCommitLog(parseInt(logCount));

  console.log(chalk.cyan(`\n📜 Last ${log.all.length} Commits:\n`));

  const table = new Table({
    head: [
      chalk.cyan("Hash"),
      chalk.cyan("Date"),
      chalk.cyan("Author"),
      chalk.cyan("Message"),
    ],
    colWidths: [12, 20, 20, 50],
    style: { head: [], border: ["gray"] },
    wordWrap: true,
  });

  log.all.forEach((commit) => {
    const date = new Date(commit.date);
    const formattedDate = date.toLocaleDateString("en-US", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const shortHash = commit.hash.substring(0, 8);
    const authorName =
      commit.author_name.length > 18
        ? commit.author_name.substring(0, 15) + "..."
        : commit.author_name;

    // Truncate message if too long
    let message = commit.message;
    if (message.length > 47) {
      message = message.substring(0, 44) + "...";
    }

    // Color code based on commit type
    let coloredMessage = message;
    if (message.startsWith("feat")) {
      coloredMessage = chalk.green(message);
    } else if (message.startsWith("fix")) {
      coloredMessage = chalk.red(message);
    } else if (message.startsWith("docs")) {
      coloredMessage = chalk.blue(message);
    } else if (message.startsWith("refactor")) {
      coloredMessage = chalk.yellow(message);
    } else if (message.startsWith("test")) {
      coloredMessage = chalk.magenta(message);
    } else if (message.startsWith("chore")) {
      coloredMessage = chalk.gray(message);
    } else {
      coloredMessage = chalk.white(message);
    }

    table.push([
      chalk.yellow(shortHash),
      chalk.gray(formattedDate),
      chalk.cyan(authorName),
      coloredMessage,
    ]);
  });

  console.log(table.toString());

  // Show details option
  const { showDetails } = await inquirer.prompt([
    {
      type: "confirm",
      name: "showDetails",
      message: "Would you like to view commit details?",
      default: false,
    },
  ]);

  if (showDetails) {
    const { selectedCommit } = await inquirer.prompt([
      {
        type: "list",
        name: "selectedCommit",
        message: "Select a commit:",
        choices: log.all.map((commit) => ({
          name: `${commit.hash.substring(0, 8)} - ${commit.message.substring(0, 50)}`,
          value: commit,
        })),
      },
    ]);

    console.log(
      chalk.cyan("\n─────────────────────────────────────────────────────"),
    );
    console.log(chalk.yellow("Commit: ") + chalk.white(selectedCommit.hash));
    console.log(
      chalk.yellow("Author: ") +
      chalk.white(
        `${selectedCommit.author_name} <${selectedCommit.author_email}>`,
      ),
    );
    console.log(
      chalk.yellow("Date: ") +
      chalk.white(new Date(selectedCommit.date).toLocaleString("en-US")),
    );
    console.log(chalk.yellow("Message: ") + chalk.white(selectedCommit.message));
    if (selectedCommit.body) {
      console.log(chalk.yellow("Description: ") + chalk.gray(selectedCommit.body));
    }
    console.log(
      chalk.cyan("─────────────────────────────────────────────────────\n"),
    );
  }
}

module.exports = {
  showLog,
};
