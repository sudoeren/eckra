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
// GitLab keeps merge request templates here; "Default.md" is applied
// automatically, so it is listed first.
const GITLAB_TEMPLATE_DIR = path.join(".gitlab", "merge_request_templates");

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

  const gitlabFiles = readDirSafe(path.join(repoRoot, GITLAB_TEMPLATE_DIR))
    .filter((f) => f.isFile() && /\.md$/i.test(f.name))
    .map((f) => f.name)
    .sort(
      (a, b) =>
        /^default\.md$/i.test(b) - /^default\.md$/i.test(a) ||
        a.localeCompare(b)
    );
  for (const file of gitlabFiles) {
    const tpl = readTemplate(repoRoot, path.join(GITLAB_TEMPLATE_DIR, file));
    if (tpl) templates.push(tpl);
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
 * Which hosting service a remote host is: "github", "gitlab" or null.
 */
function detectForge(host) {
  if (/github/i.test(host || "")) return "github";
  if (/gitlab/i.test(host || "")) return "gitlab";
  return null;
}

/**
 * Pick the remotes a pull request involves:
 * - pushRemote: where the branch goes. The branch's configured push remote
 *   wins, then "origin", then the only remote there is; null when it can't
 *   be decided.
 * - baseRemote: the repository the pull request targets. In a fork setup
 *   that is "upstream"; otherwise the push remote itself.
 */
function resolvePrRemotes(remoteNames, configuredPushRemote = null) {
  const names = remoteNames || [];
  let pushRemote = null;
  if (configuredPushRemote && names.includes(configuredPushRemote)) {
    pushRemote = configuredPushRemote;
  } else if (names.includes("origin")) {
    pushRemote = "origin";
  } else if (names.length === 1) {
    pushRemote = names[0];
  }

  const baseRemote =
    names.includes("upstream") && pushRemote !== "upstream"
      ? "upstream"
      : pushRemote;
  return { pushRemote, baseRemote };
}

/**
 * Build a link that opens the "new pull request" page (GitHub) or the
 * "new merge request" page (GitLab) with the title/body prefilled. Used
 * when the pull request can't be created from the command line. `head` is
 * the branch; pass `headRemote` (parsed like `remote`) when it lives in a
 * fork. Returns null for hosts that are neither.
 */
function buildCompareUrl(
  remote,
  base,
  head,
  { title = "", body = "" } = {},
  headRemote = null
) {
  const forge = remote ? detectForge(remote.host) : null;
  const enc = encodeURIComponent;
  const fork =
    headRemote &&
    (headRemote.owner !== remote.owner || headRemote.repo !== remote.repo);
  let root;
  let titleParam;
  let bodyParam;

  if (forge === "github") {
    const source = fork ? `${headRemote.owner}:${head}` : head;
    root =
      `https://${remote.host}/${remote.owner}/${remote.repo}/compare/` +
      `${enc(base)}...${enc(source)}?expand=1`;
    titleParam = "title";
    bodyParam = "body";
  } else if (forge === "gitlab") {
    // Merge requests from a fork are opened on the fork's project page;
    // GitLab targets the upstream project by default.
    const project = fork ? headRemote : remote;
    root =
      `https://${project.host}/${project.owner}/${project.repo}/-/merge_requests/new` +
      `?${enc("merge_request[source_branch]")}=${enc(head)}` +
      `&${enc("merge_request[target_branch]")}=${enc(base)}`;
    titleParam = enc("merge_request[title]");
    bodyParam = enc("merge_request[description]");
  } else {
    return null;
  }

  const withTitle = title ? `${root}&${titleParam}=${enc(title)}` : root;
  const withBody = body ? `${withTitle}&${bodyParam}=${enc(body)}` : withTitle;

  return withBody.length <= MAX_COMPARE_URL_LENGTH ? withBody : withTitle;
}

/**
 * Whether a link from buildCompareUrl carries the body (it is dropped
 * when the link would get too long).
 */
function compareUrlHasBody(url) {
  return /&(body|merge_request%5Bdescription%5D)=/.test(url || "");
}

/**
 * The issue number a branch name refers to ("fix/123-crash", "issue-45",
 * "gh-7-typo", "123-foo"), or null. Only a standalone number counts, so
 * "feat/v2-api" has none. Callers confirm the issue exists before using it.
 */
function extractIssueNumber(branch) {
  const m = String(branch || "").match(
    /(?:^|[/_-])(?:issues?[-_]?|gh[-_]?)?(\d{1,6})(?=[-_/]|$)/i
  );
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Make sure the body links the issue so merging closes it: fill in an
 * empty "Closes #" placeholder (as PR templates often have), otherwise
 * append the line. A body that already mentions the issue is left alone.
 */
function ensureIssueReference(body, issue) {
  const text = body || "";
  if (!issue) return text;
  if (new RegExp(`#${issue.number}(?!\\d)`).test(text)) return text;

  const placeholder =
    /(?<![a-z])(clos(?:e[sd]?|ing)|fix(?:e[sd])?|resolve[sd]?) #(?!\d)/i;
  if (placeholder.test(text)) {
    return text.replace(placeholder, `$1 #${issue.number}`);
  }
  return `${text.trimEnd()}${text.trim() ? "\n\n" : ""}Closes #${issue.number}`;
}

/**
 * Split a "a, b c" style list of users or labels into clean names.
 */
function parseList(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || "")
    .split(",")
    .map((item) => item.trim().replace(/^@/, ""))
    .filter(Boolean);
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

async function getGitConfig(key) {
  try {
    return (await getGit().raw(["config", "--get", key])).trim();
  } catch {
    // Unset keys make git exit non-zero.
    return "";
  }
}

/**
 * The remote this branch is set up to push to, or null: its `pushRemote`,
 * the repo-wide `remote.pushDefault`, then the remote it was already pushed
 * to. A branch that merely tracks another branch (say `upstream/main`, as
 * forks often do) doesn't count: that is where it pulls from.
 */
async function getBranchPushRemote(branch) {
  const explicit =
    (await getGitConfig(`branch.${branch}.pushRemote`)) ||
    (await getGitConfig("remote.pushDefault"));
  if (explicit) return explicit;

  const tracked = await getGitConfig(`branch.${branch}.remote`);
  const merge = await getGitConfig(`branch.${branch}.merge`);
  return tracked && tracked !== "." && merge === `refs/heads/${branch}`
    ? tracked
    : null;
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
 * The open issue with this number, as { number, title }, or null when it
 * doesn't exist, is closed, or gh can't tell.
 */
async function getOpenIssue(number) {
  if (!number) return null;
  try {
    const issue = JSON.parse(
      await runGh([
        "issue",
        "view",
        String(number),
        "--json",
        "number,title,state",
      ])
    );
    return issue && issue.state === "OPEN"
      ? { number: issue.number, title: issue.title }
      : null;
  } catch {
    return null;
  }
}

/**
 * Names of the repository's labels (empty when gh can't list them).
 */
async function listLabels() {
  try {
    const labels = JSON.parse(
      await runGh(["label", "list", "--json", "name", "--limit", "100"])
    );
    return labels.map((label) => label.name).sort();
  } catch {
    return [];
  }
}

/**
 * runGh, with failures turned into a message worth showing: gh's own
 * stderr, or a hint when gh is missing.
 */
async function runGhOrExplain(args) {
  try {
    return await runGh(args);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("GitHub CLI (gh) is not installed.");
    }
    throw new Error((error.stderr || error.message || "").trim());
  }
}

const PR_LIST_FIELDS =
  "number,title,headRefName,baseRefName,author,isDraft,reviewDecision,statusCheckRollup,mergeable,url,updatedAt";

/**
 * The repository's open pull requests, most recently created first.
 */
async function listPullRequests(limit = 30) {
  return JSON.parse(
    await runGhOrExplain([
      "pr",
      "list",
      "--json",
      PR_LIST_FIELDS,
      "--limit",
      String(limit),
    ])
  );
}

const PASSED_CONCLUSIONS = ["SUCCESS", "NEUTRAL", "SKIPPED"];

/**
 * Collapse gh's statusCheckRollup (check runs and commit statuses) into
 * counts plus an overall state: "failed" if anything failed, else
 * "pending" if anything is still running, else "passed"; "none" without
 * checks. `failing` lists the names of the failed checks.
 */
function summarizeChecks(rollup) {
  const summary = { passed: 0, failed: 0, pending: 0, total: 0, failing: [] };

  for (const check of rollup || []) {
    summary.total += 1;
    let outcome;
    if (check.__typename === "StatusContext") {
      outcome =
        check.state === "SUCCESS"
          ? "passed"
          : ["PENDING", "EXPECTED"].includes(check.state)
            ? "pending"
            : "failed";
    } else if (check.status !== "COMPLETED") {
      outcome = "pending";
    } else {
      outcome = PASSED_CONCLUSIONS.includes(check.conclusion)
        ? "passed"
        : "failed";
    }
    summary[outcome] += 1;
    if (outcome === "failed") {
      summary.failing.push(check.name || check.context || "unknown");
    }
  }

  summary.state =
    summary.total === 0
      ? "none"
      : summary.failed > 0
        ? "failed"
        : summary.pending > 0
          ? "pending"
          : "passed";
  return summary;
}

/**
 * Check out a pull request's branch locally.
 */
async function checkoutPullRequest(number) {
  await runGhOrExplain(["pr", "checkout", String(number)]);
}

const MERGE_METHODS = ["merge", "squash", "rebase"];

/**
 * Merge a pull request with the given method ("merge", "squash" or
 * "rebase"), optionally deleting its branch afterwards.
 */
async function mergePullRequest(number, method, { deleteBranch = false } = {}) {
  if (!MERGE_METHODS.includes(method)) {
    throw new Error(`Unknown merge method: "${method}"`);
  }
  const args = ["pr", "merge", String(number), `--${method}`];
  if (deleteBranch) args.push("--delete-branch");
  await runGhOrExplain(args);
}

async function openPullRequestInBrowser(number) {
  await runGhOrExplain(["pr", "view", String(number), "--web"]);
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
    return await runGhOrExplain(buildArgs(bodyFile));
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
 * `repo` ("[host/]owner/repo") and `head` ("owner:branch") are only needed
 * when the branch lives in a fork of the repository being targeted.
 */
async function createPullRequest({
  title,
  body,
  base,
  draft = false,
  reviewers = [],
  labels = [],
  repo = null,
  head = null,
}) {
  const stdout = await runGhWithBody(body, (bodyFile) => {
    const args = ["pr", "create", "--title", title, "--body-file", bodyFile];
    if (base) args.push("--base", base);
    // Fork setups: name the target repository and "owner:branch" explicitly
    // instead of leaving gh to guess between the remotes.
    if (repo) args.push("--repo", repo);
    if (head) args.push("--head", head);
    if (draft) args.push("--draft");
    for (const reviewer of reviewers) args.push("--reviewer", reviewer);
    for (const label of labels) args.push("--label", label);
    return args;
  });
  return lastUrl(stdout);
}

/**
 * Replace the title and body of an open pull request, adding any given
 * reviewers and labels to the ones it already has; returns its URL.
 */
async function updatePullRequest({
  number,
  title,
  body,
  reviewers = [],
  labels = [],
}) {
  const stdout = await runGhWithBody(body, (bodyFile) => {
    const args = ["pr", "edit", String(number)];
    args.push("--title", title, "--body-file", bodyFile);
    for (const reviewer of reviewers) args.push("--add-reviewer", reviewer);
    for (const label of labels) args.push("--add-label", label);
    return args;
  });
  return lastUrl(stdout);
}

module.exports = {
  findPrTemplates,
  parseRemoteUrl,
  buildCompareUrl,
  compareUrlHasBody,
  detectForge,
  resolvePrRemotes,
  getBranchPushRemote,
  fallbackPrContent,
  extractIssueNumber,
  ensureIssueReference,
  parseList,
  getOpenIssue,
  listLabels,
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
  listPullRequests,
  summarizeChecks,
  checkoutPullRequest,
  mergePullRequest,
  openPullRequestInBrowser,
};
