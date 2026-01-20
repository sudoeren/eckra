const inquirer = require("inquirer");
const chalk = require("chalk");
const ora = require("ora");
const Table = require("cli-table3");
const {
  getBranches,
  getCurrentBranch,
  createBranch,
  switchBranch,
  deleteBranch,
  mergeBranch,
} = require("../helpers/git");

async function branchMenu() {
  let running = true;

  while (running) {
    const branches = await getBranches();
    const current = branches.current;

    // Show branches
    console.log(chalk.cyan("\n🌿 Branchler:"));

    const table = new Table({
      head: [chalk.cyan("Branch"), chalk.cyan("Durum")],
      colWidths: [40, 20],
      style: { head: [], border: ["gray"] },
    });

    // Local branches
    branches.all
      .filter((b) => !b.startsWith("remotes/"))
      .forEach((branch) => {
        const isCurrent = branch === current;
        table.push([
          isCurrent ? chalk.green("* " + branch) : chalk.white("  " + branch),
          isCurrent ? chalk.green("aktif") : "",
        ]);
      });

    console.log(table.toString());

    // Remote branches (simplified)
    const remoteBranches = branches.all.filter((b) => b.startsWith("remotes/"));
    if (remoteBranches.length > 0) {
      console.log(
        chalk.gray(`\n   📡 ${remoteBranches.length} uzak branch mevcut\n`),
      );
    }

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "Branch işlemi:",
        choices: [
          { name: chalk.green("➕ Yeni branch oluştur"), value: "create" },
          { name: chalk.blue("🔄 Branch değiştir"), value: "switch" },
          { name: chalk.yellow("🔀 Branch birleştir (merge)"), value: "merge" },
          { name: chalk.red("🗑️  Branch sil"), value: "delete" },
          new inquirer.Separator(),
          { name: chalk.gray("↩️  Ana menüye dön"), value: "back" },
        ],
      },
    ]);

    switch (action) {
      case "create":
        await createNewBranch();
        break;
      case "switch":
        await switchToBranch();
        break;
      case "merge":
        await mergeBranchMenu();
        break;
      case "delete":
        await deleteBranchMenu();
        break;
      case "back":
        running = false;
        break;
    }
  }
}

async function createNewBranch() {
  const { branchName } = await inquirer.prompt([
    {
      type: "input",
      name: "branchName",
      message: "Yeni branch adı:",
      validate: (input) => {
        if (!input) return "Branch adı boş olamaz";
        if (input.includes(" ")) return "Branch adı boşluk içeremez";
        return true;
      },
    },
  ]);

  const spinner = ora(`Branch "${branchName}" oluşturuluyor...`).start();

  try {
    await createBranch(branchName);
    spinner.succeed(
      chalk.green(`Branch "${branchName}" oluşturuldu ve geçiş yapıldı!`),
    );
  } catch (error) {
    spinner.fail(chalk.red("Branch oluşturulamadı: " + error.message));
  }
}

async function switchToBranch() {
  const branches = await getBranches();
  const current = branches.current;

  const localBranches = branches.all.filter(
    (b) => !b.startsWith("remotes/") && b !== current,
  );

  if (localBranches.length === 0) {
    console.log(chalk.yellow("\n⚠️  Geçiş yapılacak başka branch yok.\n"));
    return;
  }

  const { targetBranch } = await inquirer.prompt([
    {
      type: "list",
      name: "targetBranch",
      message: "Geçiş yapılacak branch:",
      choices: [
        ...localBranches.map((b) => ({ name: b, value: b })),
        new inquirer.Separator(),
        { name: chalk.gray("İptal"), value: null },
      ],
    },
  ]);

  if (!targetBranch) return;

  const spinner = ora(`"${targetBranch}" branchine geçiliyor...`).start();

  try {
    await switchBranch(targetBranch);
    spinner.succeed(chalk.green(`"${targetBranch}" branchine geçildi!`));
  } catch (error) {
    spinner.fail(chalk.red("Geçiş yapılamadı: " + error.message));

    if (error.message.includes("uncommitted")) {
      console.log(
        chalk.yellow(
          "\n⚠️  Commit edilmemiş değişiklikler var. Önce commit yapın veya stash edin.\n",
        ),
      );
    }
  }
}

async function mergeBranchMenu() {
  const branches = await getBranches();
  const current = branches.current;

  const localBranches = branches.all.filter(
    (b) => !b.startsWith("remotes/") && b !== current,
  );

  if (localBranches.length === 0) {
    console.log(chalk.yellow("\n⚠️  Birleştirilecek başka branch yok.\n"));
    return;
  }

  const { sourceBranch } = await inquirer.prompt([
    {
      type: "list",
      name: "sourceBranch",
      message: `Hangi branchi "${current}" ile birleştirmek istiyorsunuz?`,
      choices: [
        ...localBranches.map((b) => ({ name: b, value: b })),
        new inquirer.Separator(),
        { name: chalk.gray("İptal"), value: null },
      ],
    },
  ]);

  if (!sourceBranch) return;

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: `"${sourceBranch}" → "${current}" birleştirmek istiyor musunuz?`,
      default: true,
    },
  ]);

  if (!confirm) return;

  const spinner = ora(`"${sourceBranch}" birleştiriliyor...`).start();

  try {
    await mergeBranch(sourceBranch);
    spinner.succeed(chalk.green(`"${sourceBranch}" başarıyla birleştirildi!`));
  } catch (error) {
    spinner.fail(chalk.red("Merge başarısız: " + error.message));

    if (
      error.message.includes("conflict") ||
      error.message.includes("CONFLICT")
    ) {
      console.log(
        chalk.yellow(
          "\n⚠️  Merge conflict oluştu. Çakışmaları manuel olarak çözmeniz gerekiyor.\n",
        ),
      );
    }
  }
}

async function deleteBranchMenu() {
  const branches = await getBranches();
  const current = branches.current;

  const localBranches = branches.all.filter(
    (b) => !b.startsWith("remotes/") && b !== current,
  );

  if (localBranches.length === 0) {
    console.log(chalk.yellow("\n⚠️  Silinecek başka branch yok.\n"));
    return;
  }

  const { targetBranch } = await inquirer.prompt([
    {
      type: "list",
      name: "targetBranch",
      message: "Silinecek branch:",
      choices: [
        ...localBranches.map((b) => ({ name: chalk.red(b), value: b })),
        new inquirer.Separator(),
        { name: chalk.gray("İptal"), value: null },
      ],
    },
  ]);

  if (!targetBranch) return;

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: `"${targetBranch}" branchini silmek istediğinizden emin misiniz?`,
      default: false,
    },
  ]);

  if (!confirm) return;

  const spinner = ora(`"${targetBranch}" siliniyor...`).start();

  try {
    await deleteBranch(targetBranch);
    spinner.succeed(chalk.green(`"${targetBranch}" silindi!`));
  } catch (error) {
    if (error.message.includes("not fully merged")) {
      spinner.warn(chalk.yellow("Branch henüz birleştirilmemiş."));

      const { forceDelete } = await inquirer.prompt([
        {
          type: "confirm",
          name: "forceDelete",
          message: "Zorla silmek istiyor musunuz? (değişiklikler kaybolabilir)",
          default: false,
        },
      ]);

      if (forceDelete) {
        const forceSpinner = ora("Zorla siliniyor...").start();
        try {
          await deleteBranch(targetBranch, true);
          forceSpinner.succeed(chalk.green(`"${targetBranch}" zorla silindi!`));
        } catch (forceError) {
          forceSpinner.fail(
            chalk.red("Silme başarısız: " + forceError.message),
          );
        }
      }
    } else {
      spinner.fail(chalk.red("Silme başarısız: " + error.message));
    }
  }
}

module.exports = {
  branchMenu,
};
