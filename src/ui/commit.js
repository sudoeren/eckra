const inquirer = require("inquirer");
const chalk = require("chalk");
const ora = require("ora");
const boxen = require("boxen");
const {
  getGitStatus,
  getStagedDiff,
  createCommit,
  stageAll,
} = require("../helpers/git");
const {
  generateCommitMessage,
  generateCommitSuggestions,
  checkLMStudioConnection,
} = require("../helpers/lmstudio");

async function aiCommit(manualMessage = null) {
  const status = await getGitStatus();

  // Check if there are staged changes
  if (status.staged.length === 0) {
    // Ask to stage all if there are changes
    const hasChanges =
      status.modified.length > 0 || status.not_added.length > 0;

    if (!hasChanges) {
      console.log(
        boxen(
          chalk.yellow("⚠️  Commit edilecek değişiklik yok.\n\n") +
            chalk.gray("Önce dosyalarınızı değiştirin ve stage edin."),
          { padding: 1, borderStyle: "round", borderColor: "yellow" },
        ),
      );
      return;
    }

    const { shouldStage } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldStage",
        message:
          "Stage edilmiş dosya yok. Tüm değişiklikleri stage etmek ister misiniz?",
        default: true,
      },
    ]);

    if (!shouldStage) {
      console.log(chalk.yellow("İşlem iptal edildi."));
      return;
    }

    const spinner = ora("Dosyalar stage ediliyor...").start();
    await stageAll();
    spinner.succeed("Tüm dosyalar stage edildi.");
  }

  // Get updated status and diff
  const updatedStatus = await getGitStatus();
  const diff = await getStagedDiff();
  const stagedFiles = updatedStatus.staged;

  console.log(chalk.cyan("\n📝 Stage edilmiş dosyalar:"));
  stagedFiles.forEach((file) => {
    console.log(chalk.gray("   • ") + chalk.white(file));
  });
  console.log("");

  let commitMessage = manualMessage;

  if (!commitMessage) {
    // Check LM Studio connection
    const lmStatus = await checkLMStudioConnection();

    if (!lmStatus.connected) {
      console.log(
        boxen(
          chalk.yellow("⚠️  LM Studio'ya bağlanılamadı\n\n") +
            chalk.gray(
              "LM Studio'nun localhost:1234 portunda çalıştığından emin olun.\n",
            ) +
            chalk.gray("Manuel commit mesajı yazabilirsiniz."),
          { padding: 1, borderStyle: "round", borderColor: "yellow" },
        ),
      );

      const { useManual } = await inquirer.prompt([
        {
          type: "confirm",
          name: "useManual",
          message: "Manuel commit mesajı yazmak ister misiniz?",
          default: true,
        },
      ]);

      if (!useManual) {
        return;
      }

      const { message } = await inquirer.prompt([
        {
          type: "input",
          name: "message",
          message: "Commit mesajı:",
          validate: (input) => input.length > 0 || "Commit mesajı boş olamaz",
        },
      ]);

      commitMessage = message;
    } else {
      // Generate AI suggestions
      const spinner = ora("AI commit mesajları oluşturuluyor...").start();

      try {
        const suggestions = await generateCommitSuggestions(
          diff,
          stagedFiles,
          3,
        );
        spinner.succeed("Commit mesajları oluşturuldu!");

        const { selectedMessage } = await inquirer.prompt([
          {
            type: "list",
            name: "selectedMessage",
            message: "Bir commit mesajı seçin veya kendi mesajınızı yazın:",
            choices: [
              ...suggestions.map((msg, i) => ({
                name: chalk.cyan(`${i + 1}. `) + msg,
                value: msg,
              })),
              new inquirer.Separator(),
              {
                name: chalk.yellow("✏️  Kendi mesajımı yazacağım"),
                value: "custom",
              },
              {
                name: chalk.green("🔄 Yeni öneriler oluştur"),
                value: "regenerate",
              },
              { name: chalk.red("❌ İptal"), value: "cancel" },
            ],
          },
        ]);

        if (selectedMessage === "cancel") {
          console.log(chalk.yellow("İşlem iptal edildi."));
          return;
        }

        if (selectedMessage === "regenerate") {
          return await aiCommit(); // Recursive call
        }

        if (selectedMessage === "custom") {
          const { message } = await inquirer.prompt([
            {
              type: "input",
              name: "message",
              message: "Commit mesajı:",
              validate: (input) =>
                input.length > 0 || "Commit mesajı boş olamaz",
            },
          ]);
          commitMessage = message;
        } else {
          commitMessage = selectedMessage;
        }
      } catch (error) {
        spinner.fail("AI mesaj oluşturulamadı: " + error.message);

        const { message } = await inquirer.prompt([
          {
            type: "input",
            name: "message",
            message: "Manuel commit mesajı:",
            validate: (input) => input.length > 0 || "Commit mesajı boş olamaz",
          },
        ]);
        commitMessage = message;
      }
    }
  }

  // Confirm and create commit
  console.log(
    boxen(chalk.cyan("Commit Mesajı:\n\n") + chalk.white(commitMessage), {
      padding: 1,
      borderStyle: "round",
      borderColor: "cyan",
    }),
  );

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: "Bu mesajla commit yapmak istiyor musunuz?",
      default: true,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow("Commit iptal edildi."));
    return;
  }

  const commitSpinner = ora("Commit oluşturuluyor...").start();

  try {
    const result = await createCommit(commitMessage);
    commitSpinner.succeed(chalk.green("Commit başarıyla oluşturuldu!"));

    console.log(chalk.gray(`   Commit: ${result.commit}`));
    console.log(chalk.gray(`   Branch: ${result.branch}`));
    console.log(chalk.gray(`   Dosyalar: ${stagedFiles.length} dosya\n`));

    // Ask to push
    const { shouldPush } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldPush",
        message: "Commit'i push etmek ister misiniz?",
        default: false,
      },
    ]);

    if (shouldPush) {
      const { pushChanges } = require("./push");
      await pushChanges();
    }
  } catch (error) {
    commitSpinner.fail(chalk.red("Commit başarısız: " + error.message));
  }
}

module.exports = {
  aiCommit,
};
