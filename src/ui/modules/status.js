const { getGitStatus } = require("../../helpers/git");
const { s, pause } = require("../common");
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

  const parts = [s.primary(info.branch)];

  if (info.conflicts > 0) {
    parts.push(s.error(`${info.conflicts} conflicts`));
  } else if (info.clean) {
    parts.push(s.success("clean"));
  } else {
    if (info.staged > 0) parts.push(s.success(`${info.staged} staged`));
    if (info.modified > 0)
      parts.push(s.warning(`${info.modified} modified`));
    if (info.deleted > 0) parts.push(s.error(`${info.deleted} deleted`));
    if (info.untracked > 0)
      parts.push(s.muted(`${info.untracked} untracked`));
  }

  return "  " + parts.join(s.dim(" | ")) + "\n";
}

async function doStatus() {
  open("Status");

  const status = await getGitStatus();
  const branch = status.current;

  console.log(s.bold(`  Branch: ${branch}\n`));

  if (status.staged.length > 0) {
    console.log(s.success("  Staged:"));
    status.staged.forEach((f) => console.log(s.success(`    + ${f}`)));
    console.log();
  }

  if (status.modified.length > 0) {
    console.log(s.warning("  Modified:"));
    status.modified.forEach((f) => console.log(s.warning(`    ~ ${f}`)));
    console.log();
  }

  if (status.deleted.length > 0) {
    console.log(s.error("  Deleted:"));
    status.deleted.forEach((f) => console.log(s.error(`    - ${f}`)));
    console.log();
  }

  if (status.not_added.length > 0) {
    console.log(s.muted("  Untracked:"));
    status.not_added.forEach((f) => console.log(s.muted(`    ? ${f}`)));
    console.log();
  }

  if (status.conflicted.length > 0) {
    console.log(s.error("  Conflicts:"));
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
