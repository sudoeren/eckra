const chalk = require("chalk");
const Table = require("cli-table3");
const inquirer = require("inquirer");
const { getCommitLog } = require("../helpers/git");

async function showLog(count = 10) {
  const { logCount } = await inquirer.prompt([
    {
      type: "input",
      name: "logCount",
      message: "Kaç commit gösterilsin?",
      default: count.toString(),
      validate: (input) => {
        const num = parseInt(input);
        if (isNaN(num) || num < 1) return "Geçerli bir sayı girin";
        if (num > 100) return "Maksimum 100 commit gösterilebilir";
        return true;
      },
    },
  ]);

  const log = await getCommitLog(parseInt(logCount));

  console.log(chalk.cyan(`\n📜 Son ${log.all.length} Commit:\n`));

  const table = new Table({
    head: [
      chalk.cyan("Hash"),
      chalk.cyan("Tarih"),
      chalk.cyan("Yazar"),
      chalk.cyan("Mesaj"),
    ],
    colWidths: [12, 20, 20, 50],
    style: { head: [], border: ["gray"] },
    wordWrap: true,
  });

  log.all.forEach((commit) => {
    const date = new Date(commit.date);
    const formattedDate = date.toLocaleDateString("tr-TR", {
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
      message: "Bir commit'in detaylarını görmek ister misiniz?",
      default: false,
    },
  ]);

  if (showDetails) {
    const { selectedCommit } = await inquirer.prompt([
      {
        type: "list",
        name: "selectedCommit",
        message: "Commit seçin:",
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
      chalk.yellow("Yazar: ") +
        chalk.white(
          `${selectedCommit.author_name} <${selectedCommit.author_email}>`,
        ),
    );
    console.log(
      chalk.yellow("Tarih: ") +
        chalk.white(new Date(selectedCommit.date).toLocaleString("tr-TR")),
    );
    console.log(chalk.yellow("Mesaj: ") + chalk.white(selectedCommit.message));
    if (selectedCommit.body) {
      console.log(chalk.yellow("Açıklama: ") + chalk.gray(selectedCommit.body));
    }
    console.log(
      chalk.cyan("─────────────────────────────────────────────────────\n"),
    );
  }
}

module.exports = {
  showLog,
};
