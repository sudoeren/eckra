const { execSync } = require("child_process");

const GITHUB_REPO = "sudoeren/eckra";

/**
 * Parse a Conventional Commits subject line (and optional body) into
 * { type, scope, description, breaking }.
 * Non-conventional subjects get type: null and are grouped under "Other".
 */
function parseCommitSubject(subject, body = "") {
  const match = /^([a-z]+)(\(([^)]+)\))?(!)?:\s*(.*)$/i.exec(subject.trim());
  if (!match) {
    return {
      type: null,
      scope: null,
      description: subject.trim(),
      breaking: false,
    };
  }
  return {
    type: match[1].toLowerCase(),
    scope: match[3] || null,
    breaking: Boolean(match[4]) || /BREAKING CHANGE:/.test(body || ""),
    description: match[5].trim(),
  };
}

/**
 * Group parsed commits into release-note buckets. Breaking changes are
 * collected separately instead of appearing under their type section.
 */
function groupCommits(commits) {
  const groups = {
    breaking: [],
    features: [],
    fixes: [],
    performance: [],
    refactors: [],
    docs: [],
    tests: [],
    maintenance: [],
    other: [],
  };

  for (const commit of commits) {
    const parsed = parseCommitSubject(commit.subject, commit.body);
    if (parsed.breaking) {
      groups.breaking.push(parsed.description);
      continue;
    }
    switch (parsed.type) {
      case "feat":
        groups.features.push(parsed.description);
        break;
      case "fix":
        groups.fixes.push(parsed.description);
        break;
      case "perf":
        groups.performance.push(parsed.description);
        break;
      case "refactor":
        groups.refactors.push(parsed.description);
        break;
      case "docs":
        groups.docs.push(parsed.description);
        break;
      case "test":
        groups.tests.push(parsed.description);
        break;
      case "chore":
      case "build":
      case "ci":
        groups.maintenance.push(parsed.description);
        break;
      default:
        groups.other.push(parsed.description);
    }
  }

  return groups;
}

/**
 * Build a markdown release description from a version and its commits.
 */
function buildReleaseNotes({ version, commits, previousTag }) {
  const groups = groupCommits(commits);
  const lines = [`# eckra v${version}`];

  const sections = [
    ["Breaking Changes", groups.breaking],
    ["Features", groups.features],
    ["Fixes", groups.fixes],
    ["Performance", groups.performance],
    ["Refactors", groups.refactors],
    ["Docs", groups.docs],
    ["Tests", groups.tests],
    ["Maintenance", groups.maintenance],
    ["Other", groups.other],
  ];

  for (const [label, items] of sections) {
    if (items.length === 0) continue;
    lines.push("", `### ${label}`);
    for (const item of items) lines.push(`- ${item}`);
  }

  if (previousTag) {
    lines.push(
      "",
      "---",
      `Full Changelog: https://github.com/${GITHUB_REPO}/compare/${previousTag}...v${version}`
    );
  }

  return lines.join("\n") + "\n";
}

/**
 * The version-bump commit npm version creates (e.g. "v1.4.10").
 */
function isVersionBump(subject) {
  return /^v?\d+\.\d+\.\d+/.test(subject.trim());
}

/**
 * Find the previous release tag, or null for the first release.
 */
function getPreviousTag() {
  try {
    const tag = execSync("git describe --tags --abbrev=0 HEAD^", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return tag || null;
  } catch {
    return null;
  }
}

/**
 * List commit subjects+bodies since the previous tag (full history when
 * there is none). Version-bump and merge commits are filtered out.
 */
function getCommitLog(previousTag) {
  const range = previousTag ? `${previousTag}..HEAD` : "HEAD";
  const raw = execSync(`git log --format=%H%x1f%s%x1f%b%x1e ${range}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  return raw
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, subject, body] = record.split("\x1f");
      return { hash, subject: subject || "", body: body || "" };
    })
    .filter(
      (commit) =>
        !isVersionBump(commit.subject) && !/^Merge /.test(commit.subject)
    );
}

module.exports = {
  parseCommitSubject,
  groupCommits,
  buildReleaseNotes,
  isVersionBump,
  getPreviousTag,
  getCommitLog,
};
