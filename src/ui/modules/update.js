const { s, sleep, pause } = require("../common");
const { open, prompt, spinner } = require("../screen");
const {
  checkForUpdates,
  runGlobalUpgrade,
  UPGRADE_COMMAND,
} = require("../../helpers/update");

/**
 * Check for a new version and upgrade the global package.
 * Shared by the `eckra update` CLI command (interactive: false) and the
 * More > Check for Updates menu item.
 * Returns { outdated, updated } so callers can set exit codes.
 */
async function doUpdate({
  checkOnly = false,
  yes = false,
  interactive = true,
} = {}) {
  open("Check for Updates");

  const spin = spinner("Checking for updates...");
  spin.start();
  const { current, latest, outdated } = await checkForUpdates();
  spin.stop();

  if (!latest) {
    console.log(
      s.error(
        "  ✗ Could not check for updates. Check your internet connection."
      )
    );
    console.log(s.muted("    " + UPGRADE_COMMAND));
    console.log();
    if (interactive) await pause();
    return { outdated: false, updated: false };
  }

  if (!outdated) {
    console.log(s.success(`  ✓ You're up to date (v${current})`));
    console.log();
    if (interactive) await pause();
    return { outdated: false, updated: false };
  }

  console.log(s.muted("  Current: ") + s.text(`v${current}`));
  console.log(s.muted("  Latest:  ") + s.text(`v${latest}`));
  console.log();

  if (checkOnly) {
    console.log(
      s.warning(
        `  ℹ Update available. Run "eckra update" or ${UPGRADE_COMMAND}`
      )
    );
    console.log();
    if (interactive) await pause();
    return { outdated: true, updated: false };
  }

  let proceed = yes;
  if (!proceed) {
    const { updateNow } = await prompt([
      {
        type: "confirm",
        name: "updateNow",
        message: s.muted(`Update now? (runs ${UPGRADE_COMMAND})`),
        default: true,
      },
    ]);
    proceed = updateNow;
  }

  if (!proceed) {
    console.log(s.muted("  Update skipped. Run 'eckra update' later."));
    console.log();
    if (interactive) await pause();
    return { outdated: true, updated: false };
  }

  const spinUp = spinner("Updating eckra...");
  spinUp.start();
  console.log();
  spinUp.stop();
  let updated = false;
  try {
    runGlobalUpgrade();
    updated = true;
    console.log(s.success(`  ✓ eckra updated to v${latest}`));
    console.log(s.muted("  Restart eckra to use the new version."));
  } catch {
    console.log(s.error("  ✗ Update failed. Try: " + UPGRADE_COMMAND));
  }
  console.log();
  await sleep(600);
  return { outdated: true, updated };
}

module.exports = { doUpdate };
