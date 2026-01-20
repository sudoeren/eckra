const inquirer = require("inquirer");
const chalk = require("chalk");
const ora = require("ora");
const {
  pushToRemote,
  getRemotes,
  getCurrentBranch,
  getGitStatus,
} = require("../helpers/git");

async function pushChanges() {
  const status = await getGitStatus();
  const currentBranch = await getCurrentBranch();
  const remotes = await getRemotes();

  // Check if there are commits to push
  if (status.ahead === 0 && status.tracking) {
    console.log(
      chalk.yellow("\n⚠️  Push edilecek commit yok. Zaten güncel.\n"),
    );
    return;
  }

  // Check for remotes
  if (remotes.length === 0) {
    console.log(chalk.red("\n⚠️  Uzak repo (remote) tanımlı değil.\n"));

    const { addRemote } = await inquirer.prompt([
      {
        type: "confirm",
        name: "addRemote",
        message: "Remote eklemek ister misiniz?",
        default: true,
      },
    ]);

    if (addRemote) {
      const { remoteName, remoteUrl } = await inquirer.prompt([
        {
          type: "input",
          name: "remoteName",
          message: "Remote adı:",
          default: "origin",
        },
        {
          type: "input",
          name: "remoteUrl",
          message: "Remote URL:",
          validate: (input) => input.length > 0 || "URL boş olamaz",
        },
      ]);

      const { addRemote: addRemoteGit } = require("../helpers/git");
      try {
        await addRemoteGit(remoteName, remoteUrl);
        console.log(chalk.green(`\n✓ Remote "${remoteName}" eklendi.\n`));
      } catch (error) {
        console.log(chalk.red("Remote eklenemedi: " + error.message));
        return;
      }
    } else {
      return;
    }
  }

  // Select remote if multiple
  let selectedRemote = "origin";
  const updatedRemotes = await getRemotes();

  if (updatedRemotes.length > 1) {
    const { remote } = await inquirer.prompt([
      {
        type: "list",
        name: "remote",
        message: "Remote seçin:",
        choices: updatedRemotes.map((r) => ({
          name: `${r.name} (${r.refs.push})`,
          value: r.name,
        })),
      },
    ]);
    selectedRemote = remote;
  }

  // Confirm push
  console.log(chalk.cyan(`\n📤 Push bilgileri:`));
  console.log(chalk.gray(`   Remote: `) + chalk.white(selectedRemote));
  console.log(chalk.gray(`   Branch: `) + chalk.white(currentBranch));
  if (status.ahead) {
    console.log(
      chalk.gray(`   Commit sayısı: `) + chalk.green(`${status.ahead} commit`),
    );
  }
  console.log("");

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: `Push yapmak istiyor musunuz?`,
      default: true,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow("Push iptal edildi."));
    return;
  }

  const spinner = ora(
    `${selectedRemote}/${currentBranch} push ediliyor...`,
  ).start();

  try {
    await pushToRemote(selectedRemote, currentBranch);
    spinner.succeed(chalk.green("Push başarılı!"));
  } catch (error) {
    spinner.fail(chalk.red("Push başarısız!"));

    if (error.message.includes("rejected")) {
      console.log(
        chalk.yellow("\n⚠️  Push reddedildi. Önce pull yapmanız gerekebilir."),
      );

      const { shouldPull } = await inquirer.prompt([
        {
          type: "confirm",
          name: "shouldPull",
          message: "Pull yapmak ister misiniz?",
          default: true,
        },
      ]);

      if (shouldPull) {
        const { pullFromRemote } = require("../helpers/git");
        const pullSpinner = ora("Pull yapılıyor...").start();
        try {
          await pullFromRemote(selectedRemote, currentBranch);
          pullSpinner.succeed("Pull başarılı!");

          // Try push again
          const retrySpinner = ora("Tekrar push ediliyor...").start();
          await pushToRemote(selectedRemote, currentBranch);
          retrySpinner.succeed(chalk.green("Push başarılı!"));
        } catch (pullError) {
          pullSpinner.fail("Pull başarısız: " + pullError.message);
        }
      }
    } else if (error.message.includes("no upstream")) {
      // Set upstream and push
      console.log(chalk.yellow("\n⚠️  Upstream branch ayarlı değil."));

      const { setUpstream } = await inquirer.prompt([
        {
          type: "confirm",
          name: "setUpstream",
          message: `Upstream olarak ${selectedRemote}/${currentBranch} ayarlansın mı?`,
          default: true,
        },
      ]);

      if (setUpstream) {
        const simpleGit = require("simple-git")();
        const upstreamSpinner = ora(
          "Upstream ayarlanıyor ve push ediliyor...",
        ).start();
        try {
          await simpleGit.push(["-u", selectedRemote, currentBranch]);
          upstreamSpinner.succeed(
            chalk.green("Upstream ayarlandı ve push başarılı!"),
          );
        } catch (upstreamError) {
          upstreamSpinner.fail("İşlem başarısız: " + upstreamError.message);
        }
      }
    } else {
      console.log(chalk.red("Hata: " + error.message));
    }
  }
}

module.exports = {
  pushChanges,
};
