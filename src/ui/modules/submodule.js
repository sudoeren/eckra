const {
  listSubmodules,
  initSubmodules,
  updateSubmodules,
} = require("../../helpers/git");
const { s, pause } = require("../common");
const {
  open,
  emptyState,
  menuItem,
  backItem,
  sep,
  prompt,
  spinner,
  done,
  fail,
} = require("../screen");

async function doSubmodule() {
  open("Submodule Management");

  const submodules = await listSubmodules();

  if (submodules.length === 0) {
    emptyState("No submodules found in this repository.");
  } else {
    console.log(s.muted("  Submodules:"));
    submodules.forEach((sub) => {
      const statusIcon = sub.status.startsWith("-")
        ? s.error("○")
        : s.success("●");
      console.log(
        `    ${statusIcon} ${s.primary(sub.path)} ${s.muted("(" + sub.hash.substring(0, 7) + ")")}`
      );
    });
  }
  console.log();

  const { action } = await prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("Select action:"),
      choices: [
        menuItem("Update all submodules", "primary", "update"),
        menuItem("Initialize submodules", "text", "init"),
        sep(),
        backItem(),
      ],
      loop: true,
      pageSize: 15,
    },
  ]);

  if (action === "back") return;

  const spin = spinner("Processing submodules...");
  spin.start();

  try {
    if (action === "update") {
      await updateSubmodules();
      done(spin, "Submodules updated successfully.");
    } else if (action === "init") {
      await initSubmodules();
      done(spin, "Submodules initialized.");
    }
  } catch (error) {
    fail(spin, `Submodule operation failed: ${error.message}`);
  }

  await pause();
}

module.exports = { doSubmodule };
