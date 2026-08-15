const { getGitStatus } = require("../../helpers/git");
const { s, icons, pause } = require("../common");
const { open, emptyState } = require("../screen");

async function getStatusInfo() {
  try {
    const status = await getGitStatus();
    const branch = status.current || "master";
    const staged = status.staged.length;
    const modified = status.modified.length;
    const untracked = status.not_added.length;
    const deleted = status.deleted.length;
    const conflicts = status.conflicted.length;
    const clean =
      staged === 0 && modified === 0 && untracked === 0 && deleted === 0;

    return {
      branch,
      staged,
      modified,
      untracked,
      deleted,
      conflicts,
      clean,
      status,
    };
  } catch {
    return null;
  }
}

function statusLine(info) {
  if (!info) return s.error("  ✗ not a git repository\n");

  const lines = [`${s.primary(icons.branch)} ${s.text(info.branch)}`];

  if (info.conflicts > 0) {
    lines.push(s.error(`  ${icons.conflict} ${info.conflicts} conflicts`));
  } else if (info.clean) {
    lines.push(s.success(`  ${icons.check} clean`));
  } else {
    const counts = [];
    if (info.staged > 0)
      counts.push(s.success(`${icons.staged} ${info.staged} staged`));
    if (info.modified > 0)
      counts.push(s.warning(`${icons.modified} ${info.modified} modified`));
    if (info.deleted > 0)
      counts.push(s.error(`${icons.deleted} ${info.deleted} deleted`));
    if (info.untracked > 0)
      counts.push(s.muted(`${icons.untracked} ${info.untracked} untracked`));
    lines.push("  " + counts.join(s.dim("   ")));
  }

  return lines.join("\n") + "\n";
}

async function doStatus() {
  open("Status");

  const status = await getGitStatus();
  const branch = status.current;

  console.log(s.bold(`  ${icons.branch} ${branch}\n`));

  if (status.staged.length > 0) {
    console.log(s.success(`  ${icons.staged} Staged:`));
    status.staged.forEach((f) => console.log(s.success(`    + ${f}`)));
    console.log();
  }

  if (status.modified.length > 0) {
    console.log(s.warning(`  ${icons.modified} Modified:`));
    status.modified.forEach((f) => console.log(s.warning(`    ~ ${f}`)));
    console.log();
  }

  if (status.deleted.length > 0) {
    console.log(s.error(`  ${icons.deleted} Deleted:`));
    status.deleted.forEach((f) => console.log(s.error(`    - ${f}`)));
    console.log();
  }

  if (status.not_added.length > 0) {
    console.log(s.muted(`  ${icons.untracked} Untracked:`));
    status.not_added.forEach((f) => console.log(s.muted(`    ? ${f}`)));
    console.log();
  }

  if (status.conflicted.length > 0) {
    console.log(s.error(`  ${icons.conflict} Conflicts:`));
    status.conflicted.forEach((f) => console.log(s.error(`    ! ${f}`)));
    console.log();
  }

  if (
    status.staged.length === 0 &&
    status.modified.length === 0 &&
    status.not_added.length === 0 &&
    status.deleted.length === 0 &&
    status.conflicted.length === 0
  ) {
    emptyState("Working directory clean.", "Nothing to do — you're all set.");
  }

  await pause();
}

module.exports = { doStatus, getStatusInfo, statusLine };
