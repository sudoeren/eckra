const { getGitStatus, stageAll, getStagedDiff } = require("./git");
const { generateCommitSuggestions } = require("./ai");

/**
 * Generate a single non-interactive commit message from staged changes.
 * - `all: true` stages all changes first (mirrors the "easy" flow).
 * - `instruction` is an optional user direction for the AI.
 * Throws a plain Error when not in a repo or when nothing is staged.
 */
async function generateSuggestedCommit({
  all = false,
  instruction = null,
  type = null,
} = {}) {
  let status;
  try {
    status = await getGitStatus();
  } catch {
    throw new Error("Not a git repository. Run eckra inside a git repo.");
  }

  if (all) {
    if (
      status.modified.length > 0 ||
      status.not_added.length > 0 ||
      status.deleted.length > 0
    ) {
      await stageAll();
    }
    status = await getGitStatus();
  }

  if (status.staged.length === 0) {
    throw new Error("No staged changes. Stage files first or use --all.");
  }

  const diff = await getStagedDiff();
  const [message] = await generateCommitSuggestions(
    diff,
    status.staged,
    1,
    instruction,
    { type }
  );
  return message;
}

module.exports = { generateSuggestedCommit };
