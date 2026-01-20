const simpleGit = require("simple-git");
const path = require("path");

const git = simpleGit();

/**
 * Get current git status
 */
async function getGitStatus() {
  return await git.status();
}

/**
 * Get staged files
 */
async function getStagedFiles() {
  const status = await git.status();
  return status.staged;
}

/**
 * Get unstaged files (modified but not staged)
 */
async function getUnstagedFiles() {
  const status = await git.status();
  return {
    modified: status.modified,
    deleted: status.deleted,
    untracked: status.not_added,
  };
}

/**
 * Stage specific files
 */
async function stageFiles(files) {
  if (files.length === 0) return;
  await git.add(files);
}

/**
 * Stage all files
 */
async function stageAll() {
  await git.add(".");
}

/**
 * Unstage specific files
 */
async function unstageFiles(files) {
  if (files.length === 0) return;
  await git.reset(["HEAD", ...files]);
}

/**
 * Unstage all files
 */
async function unstageAll() {
  await git.reset(["HEAD"]);
}

/**
 * Create a commit with message
 */
async function createCommit(message) {
  return await git.commit(message);
}

/**
 * Get diff for staged files
 */
async function getStagedDiff() {
  return await git.diff(["--cached"]);
}

/**
 * Get diff for unstaged files
 */
async function getUnstagedDiff() {
  return await git.diff();
}

/**
 * Get diff for specific file
 */
async function getFileDiff(file, staged = false) {
  if (staged) {
    return await git.diff(["--cached", file]);
  }
  return await git.diff([file]);
}

/**
 * Push to remote
 */
async function pushToRemote(remote = "origin", branch = null) {
  const currentBranch = branch || (await git.branch()).current;
  return await git.push(remote, currentBranch);
}

/**
 * Pull from remote
 */
async function pullFromRemote(remote = "origin", branch = null) {
  const currentBranch = branch || (await git.branch()).current;
  return await git.pull(remote, currentBranch);
}

/**
 * Get all branches
 */
async function getBranches() {
  return await git.branch(["-a"]);
}

/**
 * Get current branch
 */
async function getCurrentBranch() {
  const branches = await git.branch();
  return branches.current;
}

/**
 * Create new branch
 */
async function createBranch(branchName) {
  return await git.checkoutLocalBranch(branchName);
}

/**
 * Switch to branch
 */
async function switchBranch(branchName) {
  return await git.checkout(branchName);
}

/**
 * Delete branch
 */
async function deleteBranch(branchName, force = false) {
  const flag = force ? "-D" : "-d";
  return await git.branch([flag, branchName]);
}

/**
 * Merge branch into current
 */
async function mergeBranch(branchName) {
  return await git.merge([branchName]);
}

/**
 * Get commit log
 */
async function getCommitLog(count = 10) {
  return await git.log(["-n", count.toString()]);
}

/**
 * Get remote info
 */
async function getRemotes() {
  return await git.getRemotes(true);
}

/**
 * Check if there are conflicts
 */
async function hasConflicts() {
  const status = await git.status();
  return status.conflicted.length > 0;
}

/**
 * Get conflicted files
 */
async function getConflictedFiles() {
  const status = await git.status();
  return status.conflicted;
}

/**
 * Stash changes
 */
async function stashChanges(message = null) {
  if (message) {
    return await git.stash(["push", "-m", message]);
  }
  return await git.stash();
}

/**
 * Pop stash
 */
async function popStash() {
  return await git.stash(["pop"]);
}

/**
 * List stashes
 */
async function listStashes() {
  return await git.stashList();
}

/**
 * Discard changes in file
 */
async function discardChanges(file) {
  return await git.checkout(["--", file]);
}

/**
 * Reset to specific commit
 */
async function resetToCommit(commitHash, mode = "mixed") {
  return await git.reset([`--${mode}`, commitHash]);
}

/**
 * Get file content at specific commit
 */
async function getFileAtCommit(file, commitHash) {
  return await git.show([`${commitHash}:${file}`]);
}

/**
 * Initialize git repository
 */
async function initRepo() {
  return await git.init();
}

/**
 * Add remote
 */
async function addRemote(name, url) {
  return await git.addRemote(name, url);
}

/**
 * Fetch from remote
 */
async function fetchRemote(remote = "origin") {
  return await git.fetch(remote);
}

/**
 * Undo last commit (soft reset - keeps changes staged)
 */
async function undoLastCommit() {
  return await git.reset(["--soft", "HEAD~1"]);
}

/**
 * Get last commit info
 */
async function getLastCommit() {
  const log = await git.log(["-1"]);
  return log.latest;
}

/**
 * Amend last commit with new message
 */
async function amendCommit(message) {
  return await git.commit(message, ["--amend"]);
}

/**
 * List all tags
 */
async function listTags() {
  return await git.tags();
}

/**
 * Create a new tag
 */
async function createTag(tagName, message = null) {
  if (message) {
    return await git.addAnnotatedTag(tagName, message);
  }
  return await git.addTag(tagName);
}

/**
 * Delete a tag
 */
async function deleteTag(tagName) {
  return await git.tag(["-d", tagName]);
}

/**
 * Push tags to remote
 */
async function pushTags() {
  return await git.pushTags();
}

/**
 * Search commits by message
 */
async function searchCommits(query, count = 20) {
  return await git.log(["--grep=" + query, "-n", count.toString(), "--all"]);
}

/**
 * Search commits by author
 */
async function searchCommitsByAuthor(author, count = 20) {
  return await git.log(["--author=" + author, "-n", count.toString()]);
}

/**
 * Cherry-pick a commit
 */
async function cherryPick(commitHash) {
  return await git.raw(["cherry-pick", commitHash]);
}

/**
 * Get commits from other branches (not in current)
 */
async function getOtherBranchCommits(branch, count = 20) {
  const current = (await git.branch()).current;
  return await git.log([`${current}..${branch}`, "-n", count.toString()]);
}

/**
 * Remove a remote
 */
async function removeRemote(name) {
  return await git.removeRemote(name);
}

/**
 * Rename a remote
 */
async function renameRemote(oldName, newName) {
  return await git.raw(["remote", "rename", oldName, newName]);
}

/**
 * Set remote URL
 */
async function setRemoteUrl(name, url) {
  return await git.raw(["remote", "set-url", name, url]);
}

/**
 * Get repository stats
 */
async function getRepoStats() {
  const log = await git.log(["--all"]);
  const branches = await git.branch(["-a"]);
  const tags = await git.tags();
  
  // Count commits by author
  const authorStats = {};
  log.all.forEach(commit => {
    const author = commit.author_name;
    authorStats[author] = (authorStats[author] || 0) + 1;
  });

  // Get first and last commit dates
  const firstCommit = log.all.length > 0 ? log.all[log.all.length - 1] : null;
  const lastCommit = log.all.length > 0 ? log.all[0] : null;

  return {
    totalCommits: log.all.length,
    branches: branches.all.filter(b => !b.startsWith("remotes/")).length,
    remoteBranches: branches.all.filter(b => b.startsWith("remotes/")).length,
    tags: tags.all.length,
    authors: authorStats,
    firstCommit,
    lastCommit,
  };
}

/**
 * Squash last N commits
 */
async function squashCommits(count, message) {
  await git.reset(["--soft", `HEAD~${count}`]);
  return await git.commit(message);
}

/**
 * Reword a commit (only works for last commit)
 */
async function rewordLastCommit(message) {
  return await git.commit(message, ["--amend", "-m", message]);
}

/**
 * Drop last commit (hard reset)
 */
async function dropLastCommit() {
  return await git.reset(["--hard", "HEAD~1"]);
}

module.exports = {
  getGitStatus,
  getStagedFiles,
  getUnstagedFiles,
  stageFiles,
  stageAll,
  unstageFiles,
  unstageAll,
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
  getRemotes,
  hasConflicts,
  getConflictedFiles,
  stashChanges,
  popStash,
  listStashes,
  discardChanges,
  resetToCommit,
  getFileAtCommit,
  initRepo,
  addRemote,
  fetchRemote,
  undoLastCommit,
  getLastCommit,
  amendCommit,
  listTags,
  createTag,
  deleteTag,
  pushTags,
  searchCommits,
  searchCommitsByAuthor,
  cherryPick,
  getOtherBranchCommits,
  removeRemote,
  renameRemote,
  setRemoteUrl,
  getRepoStats,
  squashCommits,
  rewordLastCommit,
  dropLastCommit,
};
