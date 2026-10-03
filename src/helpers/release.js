const fs = require("fs");
const path = require("path");
const { getGit } = require("./git");
const { parseCommitSubject, isVersionBump } = require("./releaseNotes");
const { runGhWithBody, lastUrl } = require("./gh");
const { detectForge } = require("./pr");

// Release notes, CHANGELOG.md and publishing a release for any repository.
// (helpers/releaseNotes.js builds eckra's own notes in CI; its commit
// parsing is reused here.)

const CHANGELOG_FILE = "CHANGELOG.md";
const CHANGELOG_HEADER =
  "# Changelog\n\nAll notable changes to this project are documented in this file.\n";

const SECTIONS = [
  ["breaking", "Breaking Changes"],
  ["feat", "Features"],
  ["fix", "Fixes"],
  ["perf", "Performance"],
  ["refactor", "Refactors"],
  ["docs", "Docs"],
  ["test", "Tests"],
  ["maintenance", "Maintenance"],
  ["other", "Other"],
];
const MAINTENANCE_TYPES = ["chore", "build", "ci", "style", "revert"];

/**
 * The most recent tag reachable from HEAD, or null before the first one.
 */
async function getLatestTag() {
  try {
    const tag = (
      await getGit().raw(["describe", "--tags", "--abbrev=0"])
    ).trim();
    return tag || null;
  } catch {
    return null;
  }
}

/**
 * Commits in `from..to` (all of `to`'s history without `from`), newest
 * first, as { hash, subject, body, author }. Merge commits and version
 * bumps ("1.2.3", "chore(release): v1.2.3") are left out.
 */
async function getCommitsBetween(from, to = "HEAD") {
  const raw = await getGit().raw([
    "log",
    "--no-merges",
    "--format=%H%x1f%s%x1f%b%x1f%an%x1e",
    from ? `${from}..${to}` : to,
  ]);

  return raw
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, subject, body, author] = record.split("\x1f");
      return {
        hash,
        subject: subject || "",
        body: body || "",
        author: author || "",
      };
    })
    .filter(
      (commit) =>
        !isVersionBump(commit.subject) &&
        !/^chore\(release\)/i.test(commit.subject)
    );
}

/**
 * Split a tag or version into { prefix, major, minor, patch }, or null
 * when it isn't a semantic version. "v1.2.3" -> prefix "v".
 */
function parseVersion(value) {
  const m = /^([^\d]*)(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(
    String(value || "").trim()
  );
  if (!m) return null;
  return {
    prefix: m[1],
    major: parseInt(m[2], 10),
    minor: parseInt(m[3], 10),
    patch: parseInt(m[4], 10),
  };
}

/**
 * The next version number for a "major" | "minor" | "patch" bump.
 */
function bumpVersion(version, kind) {
  const v = parseVersion(version);
  if (!v) return null;
  if (kind === "major") return `${v.major + 1}.0.0`;
  if (kind === "minor") return `${v.major}.${v.minor + 1}.0`;
  return `${v.major}.${v.minor}.${v.patch + 1}`;
}

/**
 * Which bump the commits call for under semantic versioning: a breaking
 * change is major, a feature minor, anything else a patch. Before 1.0.0 a
 * breaking change only bumps the minor version, as semver allows.
 */
function suggestBump(commits, currentVersion = null) {
  const parsed = commits.map((c) => parseCommitSubject(c.subject, c.body));
  const current = parseVersion(currentVersion);
  if (parsed.some((c) => c.breaking)) {
    return current && current.major === 0 ? "minor" : "major";
  }
  if (parsed.some((c) => c.type === "feat")) return "minor";
  return "patch";
}

function sectionOf(parsed) {
  if (parsed.breaking) return "breaking";
  if (
    ["feat", "fix", "perf", "refactor", "docs", "test"].includes(parsed.type)
  ) {
    return parsed.type;
  }
  return MAINTENANCE_TYPES.includes(parsed.type) ? "maintenance" : "other";
}

/**
 * Group commits by conventional-commit type into a Markdown body:
 * "### Features" / "- **scope:** description (abc1234)".
 */
function formatReleaseNotes(commits) {
  const groups = {};
  for (const commit of commits) {
    const parsed = parseCommitSubject(commit.subject, commit.body);
    const scope = parsed.scope ? `**${parsed.scope}:** ` : "";
    const hash = commit.hash ? ` (${commit.hash.substring(0, 7)})` : "";
    (groups[sectionOf(parsed)] ||= []).push(
      `- ${scope}${parsed.description}${hash}`
    );
  }

  const lines = [];
  for (const [key, label] of SECTIONS) {
    if (!groups[key]) continue;
    if (lines.length) lines.push("");
    lines.push(`### ${label}`, "", ...groups[key]);
  }
  return lines.join("\n");
}

/**
 * "Full Changelog" link between two tags, for hosts that have a compare
 * page. `remote` is a parsed remote ({ host, owner, repo }).
 */
function compareLink(remote, previousTag, tag) {
  if (!remote || !previousTag) return null;
  const forge = detectForge(remote.host);
  const base = `https://${remote.host}/${remote.owner}/${remote.repo}`;
  if (forge === "github") return `${base}/compare/${previousTag}...${tag}`;
  if (forge === "gitlab") return `${base}/-/compare/${previousTag}...${tag}`;
  return null;
}

const today = () => {
  const now = new Date();
  const two = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
};

/**
 * Put a release section at the top of a changelog (Keep a Changelog
 * layout): "## [1.2.0] - 2026-10-03" followed by the notes. An existing
 * section for the same version is replaced; a missing or empty changelog
 * gets a header first. Returns the new file content.
 */
function updateChangelog(existing, { version, body, date = today() }) {
  const heading = `## [${version}] - ${date}`;
  const section = `${heading}\n\n${body.trim()}\n`;
  const content = String(existing || "").trim()
    ? String(existing)
    : CHANGELOG_HEADER;

  const lines = content.split("\n");
  const isRelease = (line) => /^## /.test(line);
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sameVersion = new RegExp(`^## \\[?v?${escaped}\\]?(\\s|$)`);

  let start = lines.findIndex((line) => sameVersion.test(line));
  let end;
  if (start !== -1) {
    end = lines.findIndex((line, i) => i > start && isRelease(line));
    if (end === -1) end = lines.length;
  } else {
    start = lines.findIndex(isRelease);
    if (start === -1) start = lines.length;
    end = start;
  }

  const before = lines.slice(0, start).join("\n").trimEnd();
  const after = lines.slice(end).join("\n").trim();
  return (
    (before ? `${before}\n\n` : "") + section + (after ? `\n${after}\n` : "")
  );
}

async function getRepoRoot() {
  return (await getGit().revparse(["--show-toplevel"])).trim();
}

/**
 * Write the release into CHANGELOG.md at the repo root; returns the path
 * relative to the root.
 */
async function writeChangelog({ version, body, date }) {
  const file = path.join(await getRepoRoot(), CHANGELOG_FILE);
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  fs.writeFileSync(file, updateChangelog(existing, { version, body, date }));
  return CHANGELOG_FILE;
}

async function hasChangelog() {
  return fs.existsSync(path.join(await getRepoRoot(), CHANGELOG_FILE));
}

/**
 * The version in the repo's package.json, or null when there is none.
 */
async function getPackageVersion() {
  try {
    const file = path.join(await getRepoRoot(), "package.json");
    return JSON.parse(fs.readFileSync(file, "utf8")).version || null;
  } catch {
    return null;
  }
}

function rewriteJson(file, mutate) {
  const text = fs.readFileSync(file, "utf8");
  const indent = (/^([ \t]+)"/m.exec(text) || [null, "  "])[1];
  const data = JSON.parse(text);
  mutate(data);
  fs.writeFileSync(
    file,
    JSON.stringify(data, null, indent) + (text.endsWith("\n") ? "\n" : "")
  );
}

/**
 * Set the version in package.json and, when present, package-lock.json
 * (what `npm version --no-git-tag-version` does). Returns the files
 * changed, relative to the repo root.
 */
async function bumpPackageVersion(version) {
  const root = await getRepoRoot();
  const changed = [];

  const pkg = path.join(root, "package.json");
  if (!fs.existsSync(pkg)) return changed;
  rewriteJson(pkg, (data) => {
    data.version = version;
  });
  changed.push("package.json");

  const lock = path.join(root, "package-lock.json");
  if (fs.existsSync(lock)) {
    rewriteJson(lock, (data) => {
      data.version = version;
      if (data.packages && data.packages[""]) {
        data.packages[""].version = version;
      }
    });
    changed.push("package-lock.json");
  }
  return changed;
}

/**
 * Commit exactly these files (paths relative to the repo root), leaving
 * anything else that happens to be staged out of the release commit.
 */
async function commitReleaseFiles(files, message) {
  const root = await getRepoRoot();
  const paths = files.map((file) => path.join(root, file));
  await getGit().add(paths);
  return await getGit().raw(["commit", "-m", message, "--", ...paths]);
}

async function tagExists(tag) {
  try {
    const out = await getGit().raw([
      "rev-parse",
      "--verify",
      "--quiet",
      `refs/tags/${tag}`,
    ]);
    return out.trim() !== "";
  } catch {
    return false;
  }
}

/**
 * Push the branch and the release tag together.
 */
async function pushRelease(remote, branch, tag) {
  return await getGit().raw(["push", remote, branch, `refs/tags/${tag}`]);
}

/**
 * Publish a GitHub release for a tag that is already on the remote and
 * return its URL.
 */
async function createGithubRelease({
  tag,
  title,
  notes,
  draft = false,
  prerelease = false,
}) {
  const stdout = await runGhWithBody(notes, (notesFile) => {
    const args = ["release", "create", tag, "--verify-tag"];
    args.push("--title", title || tag, "--notes-file", notesFile);
    if (draft) args.push("--draft");
    if (prerelease) args.push("--prerelease");
    return args;
  });
  return lastUrl(stdout);
}

/**
 * Link to the host's "new release" page for a pushed tag, used when the
 * release can't be published from here. Null for unknown hosts.
 */
function buildReleaseUrl(remote, tag, title) {
  if (!remote) return null;
  const forge = detectForge(remote.host);
  const base = `https://${remote.host}/${remote.owner}/${remote.repo}`;
  const enc = encodeURIComponent;
  if (forge === "github") {
    return `${base}/releases/new?tag=${enc(tag)}&title=${enc(title || tag)}`;
  }
  if (forge === "gitlab") return `${base}/-/releases/new?tag_name=${enc(tag)}`;
  return null;
}

/**
 * Everything needed to describe the next release: the previous tag, the
 * commits since it, and the notes — AI-written with `ai`, otherwise the
 * commits grouped by type. With a parsed `remote`, a "Full Changelog"
 * compare link is appended when `tag` is known.
 */
async function buildReleaseNotes({
  from = null,
  to = "HEAD",
  version = null,
  tag = null,
  ai = false,
  instruction = null,
  remote = null,
} = {}) {
  const previousTag = from || (await getLatestTag());
  const commits = await getCommitsBetween(previousTag, to);
  if (commits.length === 0) {
    throw new Error(
      previousTag
        ? `No commits since ${previousTag}.`
        : "No commits to describe."
    );
  }

  let notes;
  if (ai) {
    const { generateReleaseNotes } = require("./ai");
    notes = await generateReleaseNotes({
      version: version || "the next release",
      commits,
      previousTag,
      instruction,
    });
  } else {
    notes = formatReleaseNotes(commits);
  }

  const compare = tag ? compareLink(remote, previousTag, tag) : null;
  if (compare) notes += `\n\n**Full Changelog**: ${compare}`;
  return { previousTag, commits, notes };
}

module.exports = {
  buildReleaseNotes,
  CHANGELOG_FILE,
  getLatestTag,
  getCommitsBetween,
  parseVersion,
  bumpVersion,
  suggestBump,
  formatReleaseNotes,
  compareLink,
  updateChangelog,
  writeChangelog,
  hasChangelog,
  getPackageVersion,
  bumpPackageVersion,
  commitReleaseFiles,
  tagExists,
  pushRelease,
  createGithubRelease,
  buildReleaseUrl,
};
