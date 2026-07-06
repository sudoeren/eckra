const inquirer = require("inquirer");
const ora = require("ora").default;
const { listSubmodules, initSubmodules, updateSubmodules } = require("../../helpers/git");
const { s, header, clear, pause } = require("../common");

async function doSubmodule() {
  clear();
  header();
  console.log(s.bold("  Submodule Management\n"));

  const submodules = await listSubmodules();

  if (submodules.length === 0) {
    console.log(s.muted("  No submodules found in this repository."));
  } else {
    console.log(s.muted("  Submodules:"));
    submodules.forEach(sub => {
      const statusIcon = sub.status.startsWith("-") ? s.error("○") : s.success("●");
      console.log(`    ${statusIcon} ${s.primary(sub.path)} ${s.muted("(" + sub.hash.substring(0, 7) + ")")}`);
    });
  }
  console.log();

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("Select action:"),
      choices: [
        { name: s.primary("  Update all submodules"), value: "update" },
        { name: s.text("  Initialize submodules"), value: "init" },
        { type: "separator", line: " " },
        { name: s.muted("  ← Back"), value: "back" },
      ],
      loop: true,
      pageSize: 15,
    },
  ]);

  if (action === "back") return;

  const spin = ora({ text: s.muted(` Processing submodules...`), spinner: "dots" }).start();
  
  try {
    if (action === "update") {
      await updateSubmodules();
      spin.succeed(s.success(" Submodules updated successfully."));
    } else if (action === "init") {
      await initSubmodules();
      spin.succeed(s.success(" Submodules initialized."));
    }
  } catch (error) {
    spin.fail(s.error(` Submodule operation failed: ${error.message}`));
  }
  
  await pause();
}

module.exports = { doSubmodule };
