const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { getGit } = require("./git");

// GitHub looks for pull request templates in these directories, either as a
// single `pull_request_template.md` file or as several files inside a
// `PULL_REQUEST_TEMPLATE/` directory. File names are case-insensitive.
const TEMPLATE_DIRS = [".github", "", "docs"];
const TEMPLATE_FILE_RE = /^pull_request_template(\.(md|txt))?$/i;
const TEMPLATE_DIR_RE = /^pull_request_template$/i;
const TEMPLATE_EXT_RE = /\.(md|txt)$/i;

// Browsers and GitHub reject very long URLs, so the body is only prefilled
// through the compare link when it fits.
const MAX_COMPARE_URL_LENGTH = 6000;

function readDirSafe(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function readTemplate(repoRoot, relPath) {
  try {
    const content = fs.readFileSync(path.join(repoRoot, relPath), "utf8");
    if (!content.trim()) return null;
    return { name: relPath.split(path.sep).join("/"), content };
  } catch {
    return null;
  }
}

/**
 * Find the repository's pull request templates.
 * Returns [{ name, content }] where `name` is the repo-relative path; the
 * single-file template of each location comes before that location's
 * `PULL_REQUEST_TEMPLATE/` directory entries.
 */
function findPrTemplates(repoRoot) {
  const templates = [];

  for (const dir of TEMPLATE_DIRS) {
    const entries = readDirSafe(path.join(repoRoot, dir));

    for (const entry of entries) {
      if (entry.isFile() && TEMPLATE_FILE_RE.test(entry.name)) {
        const tpl = readTemplate(repoRoot, path.join(dir, entry.name));
        if (tpl) templates.push(tpl);
      }
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || !TEMPLATE_DIR_RE.test(entry.name)) continue;
      const sub = path.join(dir, entry.name);
      const files = readDirSafe(path.join(repoRoot, sub))
        .filter((f) => f.isFile() && TEMPLATE_EXT_RE.test(f.name))
        .map((f) => f.name)
        .sort();
      for (const file of files) {
        const tpl = readTemplate(repoRoot, path.join(sub, file));
        if (tpl) templates.push(tpl);
      }
    }
  }

  return templates;
}

/**
 * Parse a git remote URL into { host, owner, repo }, or null when it does
 * not look like a hosted repository. Handles https, ssh:// and scp-like
 * (`git@host:owner/repo.git`) forms.
 */
function parseRemoteUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;

  let host;
  let repoPath;

  if (raw.includes("://")) {
    try {
      const parsed = new URL(raw);
      host = parsed.hostname;
      repoPath = parsed.pathname;
    } catch {
      return null;
    }
  } else {
    const m = raw.match(/^(?:[^@/]+@)?([^:/]+):(.+)$/);
    if (!m) return null;
    host = m[1];
    repoPath = m[2];
  }

  const parts = repoPath
    .replace(/\.git\/?$/i, "")
    .split("/")
    .filter(Boolean);
  if (!host || parts.length < 2) return null;

  return {
    host,
    owner: parts.slice(0, -1).join("/"),
    repo: parts[parts.length - 1],
  };
}

/**
 * Build a GitHub "open a pull request" link with the title/body prefilled.
 * Used when the GitHub CLI is unavailable. Returns null for non-GitHub hosts.
 */
function buildCompareUrl(remote, base, head, { title = "", body = "" } = {}) {
  if (!remote || !/github/i.test(remote.host)) return null;

  const root =
    `https://${remote.host}/${remote.owner}/${remote.repo}/compare/` +
    `${encodeURIComponent(base)}...${encodeURIComponent(head)}?expand=1`;
  const withTitle = title ? `${root}&title=${encodeURIComponent(title)}` : root;
  const withBody = body
    ? `${withTitle}&body=${encodeURIComponent(body)}`
    : withTitle;

  return withBody.length <= MAX_COMPARE_URL_LENGTH ? withBody : withTitle;
}

/**
 * Title/body used when the AI is skipped or fails: the template as-is when
 * the repo has one, otherwise a bullet list of the commits.
 */
function fallbackPrContent(commits, branch, template = null) {
  const subjects = (commits || []).map((c) => c.message.split("\n")[0]);
  const title =
    subjects.length === 1
      ? subjects[0]
      : String(branch || "")
          .replace(/^[^/]+\//, "")
          .replace(/[-_]+/g, " ")
          .trim();
  const body = template
    ? template.trim()
    : subjects.map((subject) => `- ${subject}`).join("\n");
  return { title, body };
}

/**
 * Suggest a branch name from the commits that are about to be moved onto
 * it: "feat: add PR command" -> "feat/add-pr-command". Uses the oldest
 * commit, which is where the work started.
 */
function suggestBranchName(commits) {
  const list = commits || [];
  const oldest = list[list.length - 1];
  const subject = oldest ? oldest.message.split("\n")[0] : "";
  const conventional = subject.match(/^([a-z]+)(?:\([^)]*\))?!?:\s*(.+)$/i);
  const prefix = conventional ? conventional[1].toLowerCase() : "feature";
  const words = (conventional ? conventional[2] : subject)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  let slug = "";
  for (const word of words) {
    const next = slug ? `${slug}-${word}` : word;
    if (next.length > 40) break;
    slug = next;
  }
  return `${prefix}/${slug || "changes"}`;
}

async function branchExists(name) {
  return await refExists(`refs/heads/${name}`);
}

async function isValidBranchName(name) {
  try {
    await getGit().raw(["check-ref-format", "--branch", name]);
    return true;
  } catch {
    return false;
  }
}

/**
 * `name` itself when no local branch has it, otherwise the first free
 * "name-2", "name-3", ...
 */
async function availableBranchName(name) {
  let candidate = name;
  for (let n = 2; await branchExists(candidate); n++) {
    candidate = `${name}-${n}`;
  }
  return candidate;
}

/**
 * Rescue commits made directly on the base branch: create `newBranch` at
 * the current HEAD and switch to it, then point the local base branch back
 * at `baseRef`. The commits stay on the new branch and uncommitted changes
 * in the working tree are left untouched.
 */
async function moveCommitsToNewBranch(newBranch, base, baseRef) {
  await getGit().raw(["checkout", "--no-track", "-b", newBranch]);
  await getGit().raw(["branch", "-f", base, baseRef]);
}

async function getRepoRoot() {
  return (await getGit().revparse(["--show-toplevel"])).trim();
}

async function refExists(ref) {
  try {
    const out = await getGit().raw(["rev-parse", "--verify", "--quiet", ref]);
    return out.trim() !== "";
  } catch {
    return false;
  }
}

/**
 * The remote's default branch (e.g. "main"), or null when it can't be
 * determined locally.
 */
async function getDefaultBranch(remote = "origin") {
  try {
    const head = (
      await getGit().raw([
        "symbolic-ref",
        "--short",
        `refs/remotes/${remote}/HEAD`,
      ])
    ).trim();
    if (head) return head.replace(new RegExp(`^${remote}/`), "");
  } catch {
    // origin/HEAD is not set for repos that were `git init`ed locally.
  }

  for (const name of ["main", "master"]) {
    if (await refExists(`refs/remotes/${remote}/${name}`)) return name;
  }
  for (const name of ["main", "master"]) {
    if (await refExists(`refs/heads/${name}`)) return name;
  }
  return null;
}

/**
 * The ref to compare against for a base branch: the remote-tracking branch
 * when present (it is what the PR will actually target), else the local one.
 */
async function resolveBaseRef(base, remote = "origin") {
  if (await refExists(`refs/remotes/${remote}/${base}`)) {
    return `${remote}/${base}`;
  }
  if (await refExists(`refs/heads/${base}`)) return base;
  return null;
}

/**
 * Commits on HEAD that are not on the base ref, newest first.
 */
async function getPrCommits(baseRef) {
  const log = await getGit().log({ from: baseRef, to: "HEAD" });
  return log.all;
}

/**
 * What the pull request would change: diff and stat since the merge base.
 */
async function getPrDiff(baseRef) {
  const range = `${baseRef}...HEAD`;
  const [diff, stat] = await Promise.all([
    getGit().raw(["diff", range]),
    getGit().raw(["diff", "--stat", range]),
  ]);
  return { diff, stat: stat.trim() };
}

/**
 * Whether the current branch has an upstream and how many local commits are
 * still missing from it.
 */
async function getPushState() {
  let upstream = null;
  try {
    upstream =
      (
        await getGit().raw([
          "rev-parse",
          "--abbrev-ref",
          "--symbolic-full-name",
          "@{u}",
        ])
      ).trim() || null;
  } catch {
    // No upstream configured for this branch.
  }
  if (!upstream) return { upstream: null, unpushed: null };

  const count = await getGit().raw(["rev-list", "--count", "@{u}..HEAD"]);
  return { upstream, unpushed: parseInt(count.trim(), 10) || 0 };
}

async function pushBranch(branch, remote = "origin") {
  return await getGit().push(["-u", remote, branch]);
}

function runGh(args) {
  return new Promise((resolve, reject) => {
    execFile(
      "gh",
      args,
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          error.stderr = stderr;
          reject(error);
          return;
        }
        resolve(stdout);
      }
    );
  });
}

async function isGhAvailable() {
  try {
    await runGh(["--version"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * The open pull request for the current branch, or null.
 */
async function findExistingPr() {
  try {
    const pr = JSON.parse(
      await runGh([
        "pr",
        "view",
        "--json",
        "url,state,title,number,baseRefName",
      ])
    );
    return pr && pr.state === "OPEN" ? pr : null;
  } catch {
    return null;
  }
}

/**
 * Run a gh command whose body comes from a temp file, so its size and
 * content never hit command-line limits or quoting issues. `buildArgs`
 * receives the file path and returns the gh arguments.
 */
async function runGhWithBody(body, buildArgs) {
  const bodyFile = path.join(
    os.tmpdir(),
    `eckra_pr_${process.pid}_${Date.now()}.md`
  );

  try {
    fs.writeFileSync(bodyFile, body || "", { mode: 0o600 });
    return await runGh(buildArgs(bodyFile));
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("GitHub CLI (gh) is not installed.");
    }
    throw new Error((error.stderr || error.message || "").trim());
  } finally {
    if (fs.existsSync(bodyFile)) fs.unlinkSync(bodyFile);
  }
}

function lastUrl(stdout) {
  const url = stdout
    .split("\n")
    .map((line) => line.trim())
    .reverse()
    .find((line) => /^https?:\/\//.test(line));
  return url || stdout.trim();
}

/**
 * Create the pull request with the GitHub CLI and return its URL.
 */
async function createPullRequest({ title, body, base, draft = false }) {
  const stdout = await runGhWithBody(body, (bodyFile) => {
    const args = ["pr", "create", "--title", title, "--body-file", bodyFile];
    if (base) args.push("--base", base);
    if (draft) args.push("--draft");
    return args;
  });
  return lastUrl(stdout);
}

/**
 * Replace the title and body of an open pull request; returns its URL.
 */
async function updatePullRequest({ number, title, body }) {
  const stdout = await runGhWithBody(body, (bodyFile) => [
    "pr",
    "edit",
    String(number),
    "--title",
    title,
    "--body-file",
    bodyFile,
  ]);
  return lastUrl(stdout);
}

module.exports = {
  findPrTemplates,
  parseRemoteUrl,
  buildCompareUrl,
  fallbackPrContent,
  suggestBranchName,
  branchExists,
  isValidBranchName,
  availableBranchName,
  moveCommitsToNewBranch,
  getRepoRoot,
  getDefaultBranch,
  resolveBaseRef,
  getPrCommits,
  getPrDiff,
  getPushState,
  pushBranch,
  isGhAvailable,
  findExistingPr,
  createPullRequest,
  updatePullRequest,
};
