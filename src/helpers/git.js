const simpleGit = require("simple-git");
const path = require("path");

let _git = null;

function getGit() {
  if (!_git) {
    _git = simpleGit();
  }
  return _git;
}

/**
 * Get current git status
 */
async function getGitStatus() {
  return await getGit().status();
}

/**
 * Stage specific files
 */
async function stageFiles(files) {
  if (files.length === 0) return;
  await getGit().add(files);
}

/**
 * Stage all files
 */
async function stageAll() {
  await getGit().add(".");
}

/**
 * Create a commit with message
 */
async function createCommit(message) {
  return await getGit().commit(message);
}

/**
 * Get diff for staged files
 */
async function getStagedDiff() {
  return await getGit().diff(["--cached"]);
}

/**
 * Get diff for unstaged files
 */
async function getUnstagedDiff() {
  return await getGit().diff();
}

/**
 * Get diff for specific file
 */
async function getFileDiff(file, staged = false) {
  if (staged) {
    return await getGit().diff(["--cached", file]);
  }
  return await getGit().diff([file]);
}

/**
 * Push to remote
 */
async function pushToRemote(remote = "origin", branch = null) {
  const currentBranch = branch || (await getGit().branch()).current;
  return await getGit().push(remote, currentBranch);
}

/**
 * Pull from remote
 */
async function pullFromRemote(remote = "origin", branch = null) {
  const currentBranch = branch || (await getGit().branch()).current;
  return await getGit().pull(remote, currentBranch);
}

/**
 * Get all branches
 */
async function getBranches() {
  return await getGit().branch(["-a"]);
}

/**
 * Get current branch
 */
async function getCurrentBranch() {
  const branches = await getGit().branch();
  return branches.current;
}

/**
 * Create new branch
 */
async function createBranch(branchName) {
  return await getGit().checkoutLocalBranch(branchName);
}

/**
 * Switch to branch
 */
async function switchBranch(branchName) {
  return await getGit().checkout(branchName);
}

/**
 * Delete branch
 */
async function deleteBranch(branchName, force = false) {
  const flag = force ? "-D" : "-d";
  return await getGit().branch([flag, branchName]);
}

/**
 * Merge branch into current
 */
async function mergeBranch(branchName) {
  return await getGit().merge([branchName]);
}

/**
 * Get commit log
 */
async function getCommitLog(count = 10) {
  return await getGit().log(["-n", count.toString()]);
}

/**
 * Get commit history for AI analysis - structured data with details
 */
async function getCommitHistory(count = 50) {
  return await getGit().log(["-n", count.toString()]);
}

/**
 * Get remote info
 */
async function getRemotes() {
  return await getGit().getRemotes(true);
}

/**
 * Stash changes
 */
async function stashChanges(message = null) {
  if (message) {
    return await getGit().stash(["push", "-m", message]);
  }
  return await getGit().stash();
}

/**
 * Pop stash
 */
async function popStash(index = 0) {
  return await getGit().stash(["pop", `stash@{${index}}`]);
}

/**
 * Apply stash (keep it in list)
 */
async function applyStash(index = 0) {
  return await getGit().stash(["apply", `stash@{${index}}`]);
}

/**
 * Drop stash
 */
async function dropStash(index = 0) {
  return await getGit().stash(["drop", `stash@{${index}}`]);
}

/**
 * List stashes
 */
async function listStashes() {
  return await getGit().stashList();
}

/**
 * Add remote
 */
async function addRemote(name, url) {
  return await getGit().addRemote(name, url);
}

/**
 * Undo last commit (soft reset - keeps changes staged)
 */
async function undoLastCommit() {
  return await getGit().reset(["--soft", "HEAD~1"]);
}

/**
 * Get last commit info
 */
async function getLastCommit() {
  const log = await getGit().log(["-1"]);
  return log.latest;
}

/**
 * Amend last commit with new message
 */
async function amendCommit(message) {
  return await getGit().commit(message, ["--amend"]);
}

/**
 * List all tags
 */
async function listTags() {
  return await getGit().tags();
}

/**
 * List all tags with details (name, type, commit, subject, tagger, date)
 * via `git for-each-ref`. Lightweight tags carry no message/tagger.
 */
async function listTagDetails() {
  const out = await getGit().raw([
    "for-each-ref",
    "refs/tags",
    "--sort=-creatordate",
    "--format=%(refname:short)\u001f%(objecttype)\u001f%(objectname:short)\u001f%(*objectname:short)\u001f%(contents:subject)\u001f%(taggername)\u001f%(taggerdate:iso)",
  ]);
  return (out.trim() ? out.trim().split("\n") : [])
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const [name, type, object, commit, subject, tagger, date] = line
        .split("\u001f")
        .map((v) => (v === undefined ? "" : v.trim()));
      return {
        name,
        type,
        object,
        commit: commit || object,
        subject,
        tagger,
        date,
      };
    });
}

/**
 * Create a new tag
 */
async function createTag(tagName, message = null) {
  if (message) {
    return await getGit().addAnnotatedTag(tagName, message);
  }
  return await getGit().addTag(tagName);
}

/**
 * Delete a tag
 */
async function deleteTag(tagName) {
  return await getGit().tag(["-d", tagName]);
}

/**
 * Push tags to remote
 */
async function pushTags() {
  return await getGit().pushTags();
}

/**
 * Search commits by message
 */
async function searchCommits(query, count = 20) {
  return await getGit().log(["--grep", query, "-n", count.toString(), "--all"]);
}

/**
 * Cherry-pick a commit
 */
async function cherryPick(commitHash) {
  return await getGit().raw(["cherry-pick", commitHash]);
}

/**
 * Remove a remote
 */
async function removeRemote(name) {
  return await getGit().removeRemote(name);
}

/**
 * Get repository stats
 */
async function getRepoStats() {
  const branches = await getGit().branch(["-a"]);
  const tags = await getGit().tags();

  // Count all commits across refs (fast, doesn't load full history)
  const totalCommits =
    parseInt(
      (await getGit().raw(["rev-list", "--all", "--count"])).trim(),
      10
    ) || 0;

  // Author -> commit count via shortlog (cheaper than walking every commit)
  const shortlog = (await getGit().raw(["shortlog", "-sn", "--all"])).trim();
  const authorStats = {};
  if (shortlog) {
    for (const line of shortlog.split("\n")) {
      const m = line.match(/^\s*(\d+)\s+(.+)$/);
      if (m) authorStats[m[2]] = parseInt(m[1], 10);
    }
  }

  // First (oldest) and last (newest) commit dates without loading full history
  const lastDate = (
    await getGit().raw(["log", "--all", "-1", "--format=%aI"])
  ).trim();
  const firstDate = (
    await getGit().raw(["log", "--all", "--reverse", "-1", "--format=%aI"])
  ).trim();

  return {
    totalCommits,
    branches: branches.all.filter((b) => !b.startsWith("remotes/")).length,
    remoteBranches: branches.all.filter((b) => b.startsWith("remotes/")).length,
    tags: tags.all.length,
    authors: authorStats,
    firstCommit: firstDate ? { date: firstDate } : null,
    lastCommit: lastDate ? { date: lastDate } : null,
  };
}

/**
 * Squash last N commits
 */
async function squashCommits(count, message) {
  await getGit().reset(["--soft", `HEAD~${count}`]);
  return await getGit().commit(message);
}

/**
 * Get conflicted files with content
 */
async function getConflictDetails() {
  const status = await getGit().status();
  return status.conflicted;
}

/**
 * Get the working-tree diff of all conflicted files (shows conflict markers)
 */
async function getConflictedDiff() {
  const status = await getGit().status();
  if (status.conflicted.length === 0) return "";
  return await getGit().diff(status.conflicted);
}

/**
 * Accept ours version for a file
 */
async function acceptOurs(file) {
  await getGit().checkout(["--ours", file]);
  await getGit().add(file);
}

/**
 * Accept theirs version for a file
 */
async function acceptTheirs(file) {
  await getGit().checkout(["--theirs", file]);
  await getGit().add(file);
}

/**
 * Abort merge
 */
async function abortMerge() {
  return await getGit().merge(["--abort"]);
}

/**
 * Get blame for a file
 */
async function getBlame(file) {
  const result = await getGit().raw(["blame", "--line-porcelain", file]);
  const lines = result.split("\n");
  const blameData = [];
  let current = {};

  for (const line of lines) {
    if (line.match(/^[0-9a-f]{40}/)) {
      if (current.hash) blameData.push(current);
      current = { hash: line.substring(0, 40) };
    } else if (line.startsWith("author ")) {
      current.author = line.substring(7);
    } else if (line.startsWith("author-time ")) {
      current.time = parseInt(line.substring(12)) * 1000;
    } else if (line.startsWith("summary ")) {
      current.summary = line.substring(8);
    } else if (line.startsWith("\t")) {
      current.line = line.substring(1);
      blameData.push(current);
      current = {};
    }
  }

  return blameData;
}

/**
 * Get tracked files
 */
async function getTrackedFiles() {
  const result = await getGit().raw(["ls-files"]);
  return result.split("\n").filter((f) => f.length > 0);
}

/**
 * List worktrees
 */
async function listWorktrees() {
  const result = await getGit().raw(["worktree", "list", "--porcelain"]);
  const worktrees = [];
  let current = {};

  result.split("\n").forEach((line) => {
    if (line.startsWith("worktree ")) {
      if (current.path) worktrees.push(current);
      current = { path: line.substring(9) };
    } else if (line.startsWith("HEAD ")) {
      current.head = line.substring(5);
    } else if (line.startsWith("branch ")) {
      current.branch = line.substring(7).replace("refs/heads/", "");
    } else if (line === "bare") {
      current.bare = true;
    }
  });

  if (current.path) worktrees.push(current);
  return worktrees;
}

/**
 * Add a worktree
 */
async function addWorktree(path, branch) {
  return await getGit().raw(["worktree", "add", path, branch]);
}

/**
 * Add a worktree with new branch
 */
async function addWorktreeNewBranch(path, newBranch) {
  return await getGit().raw(["worktree", "add", "-b", newBranch, path]);
}

/**
 * Remove a worktree
 */
async function removeWorktree(path) {
  return await getGit().raw(["worktree", "remove", path]);
}

/**
 * Get structured commit data for the graph view, across all refs.
 * Returns an array of { hash, parents[], subject, author, email, timestamp,
 * refs }.
 */
async function getGraphData(count = 50) {
  const result = await getGit().raw([
    "log",
    "--all",
    "--topo-order",
    "-n",
    count.toString(),
    "--format=%H%x1f%P%x1f%s%x1f%an%x1f%ae%x1f%at%x1f%D%x1e",
  ]);

  return result
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, parents, subject, author, email, timestamp, refs] =
        record.split("\x1f");
      return {
        hash,
        parents: parents ? parents.split(" ") : [],
        subject: subject || "",
        author: author || "",
        email: email || "",
        timestamp: timestamp ? parseInt(timestamp, 10) * 1000 : 0,
        refs: refs || "",
      };
    });
}

/**
 * Compare two branches
 */
async function compareBranches(base, target) {
  const ahead = await getGit().raw([
    "rev-list",
    "--count",
    `${base}..${target}`,
  ]);
  const behind = await getGit().raw([
    "rev-list",
    "--count",
    `${target}..${base}`,
  ]);
  const diffStat = await getGit().raw(["diff", "--shortstat", base, target]);

  return {
    ahead: parseInt(ahead.trim()),
    behind: parseInt(behind.trim()),
    diffStat: diffStat.trim(),
  };
}

/**
 * Rebase current branch onto another branch
 */
async function rebase(branch) {
  return await getGit().rebase([branch]);
}

/**
 * Abort rebase
 */
async function abortRebase() {
  return await getGit().rebase(["--abort"]);
}

/**
 * Continue rebase
 */
async function continueRebase() {
  return await getGit().rebase(["--continue"]);
}

/**
 * List submodules
 */
async function listSubmodules() {
  const result = await getGit().raw(["submodule", "status"]);
  const submodules = [];
  if (!result) return submodules;

  result.split("\n").forEach((line) => {
    if (line.trim().length === 0) return;
    const parts = line.trim().split(/\s+/);
    submodules.push({
      status: parts[0],
      path: parts[1],
      hash: parts[2],
    });
  });
  return submodules;
}

/**
 * Initialize submodules
 */
async function initSubmodules() {
  return await getGit().submoduleInit();
}

/**
 * Update submodules
 */
async function updateSubmodules() {
  return await getGit().submoduleUpdate(["--init", "--recursive"]);
}

/**
 * Accept both versions for a file (combine)
 */
async function acceptBoth(file) {
  const fs = require("fs");
  const projectRoot = process.cwd();
  const filePath = path.join(projectRoot, file);

  try {
    await getGit().checkout(["--ours", file]);
    const ours = fs.readFileSync(filePath, "utf8");
    await getGit().checkout(["--theirs", file]);
    const theirs = fs.readFileSync(filePath, "utf8");

    fs.writeFileSync(
      filePath,
      `<<<<<<< OURS\n${ours}\n=======\n${theirs}\n>>>>>>> THEIRS`
    );
    await getGit().add(file);
    return true;
  } catch (error) {
    throw new Error("Failed to combine changes: " + error.message);
  }
}

/**
 * Apply a patch string to the index (staged area)
 */
async function applyPatchString(patchContent) {
  const fs = require("fs");
  const os = require("os");

  const tempFile = path.join(os.tmpdir(), `eckra_patch_${Date.now()}.diff`);

  try {
    fs.writeFileSync(tempFile, patchContent);
    await getGit().raw([
      "apply",
      "--cached",
      "--ignore-space-change",
      "--whitespace=nowarn",
      tempFile,
    ]);
    fs.unlinkSync(tempFile);
    return true;
  } catch (error) {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    throw new Error("Failed to apply patch: " + error.message);
  }
}

function resetGitCache() {
  _git = null;
}

module.exports = {
  getGit,
  getGitStatus,
  stageFiles,
  stageAll,
  createCommit,
  getStagedDiff,
  getUnstagedDiff,
  getFileDiff,
  pushToRemote,
  pullFromRemote,
  getBranches,
  getCurrentBranch,
  createBranch,
  switchBranch,
  deleteBranch,
  mergeBranch,
  getCommitLog,
  getCommitHistory,
  getRemotes,
  stashChanges,
  popStash,
  applyStash,
  dropStash,
  listStashes,
  addRemote,
  undoLastCommit,
  getLastCommit,
  amendCommit,
  listTags,
  listTagDetails,
  createTag,
  deleteTag,
  pushTags,
  searchCommits,
  cherryPick,
  removeRemote,
  getRepoStats,
  squashCommits,
  getConflictDetails,
  getConflictedDiff,
  acceptOurs,
  acceptTheirs,
  acceptBoth,
  abortMerge,
  getBlame,
  getTrackedFiles,
  listWorktrees,
  addWorktree,
  addWorktreeNewBranch,
  removeWorktree,
  getGraphData,
  applyPatchString,
  compareBranches,
  rebase,
  abortRebase,
  continueRebase,
  listSubmodules,
  initSubmodules,
  updateSubmodules,
  resetGitCache,
};
