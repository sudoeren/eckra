const fs = require("fs");
const os = require("os");
const path = require("path");
const childProcess = require("child_process");
const git = require("../src/helpers/git");

jest.mock("child_process", () => ({
  execFile: jest.fn(),
  execFileSync: jest.fn(),
}));
jest.mock("../src/helpers/git");

const {
  getLatestTag,
  getCommitsBetween,
  parseVersion,
  bumpVersion,
  suggestBump,
  formatReleaseNotes,
  compareLink,
  updateChangelog,
  writeChangelog,
  bumpPackageVersion,
  commitReleaseFiles,
  createGithubRelease,
  buildReleaseUrl,
  buildReleaseNotes,
} = require("../src/helpers/release");

const github = { host: "github.com", owner: "sudoeren", repo: "eckra" };
const record = (hash, subject, body = "", author = "eren") =>
  [hash, subject, body, author].join("\x1f") + "\x1e\n";

describe("versions", () => {
  test("parseVersion keeps the tag prefix", () => {
    expect(parseVersion("v1.2.3")).toEqual({
      prefix: "v",
      major: 1,
      minor: 2,
      patch: 3,
    });
    expect(parseVersion("1.2.3-beta.1").prefix).toBe("");
    expect(parseVersion("release-x")).toBeNull();
    expect(parseVersion(null)).toBeNull();
  });

  test("bumpVersion", () => {
    expect(bumpVersion("v1.5.7", "patch")).toBe("1.5.8");
    expect(bumpVersion("v1.5.7", "minor")).toBe("1.6.0");
    expect(bumpVersion("v1.5.7", "major")).toBe("2.0.0");
    expect(bumpVersion("nope", "patch")).toBeNull();
  });

  test("suggestBump follows semantic versioning", () => {
    const fix = { subject: "fix: a" };
    const feat = { subject: "feat(ui): b" };
    const breaking = { subject: "feat!: c" };
    const footer = { subject: "fix: d", body: "BREAKING CHANGE: gone" };

    expect(suggestBump([fix, { subject: "docs: x" }])).toBe("patch");
    expect(suggestBump([fix, feat])).toBe("minor");
    expect(suggestBump([feat, breaking], "1.4.0")).toBe("major");
    expect(suggestBump([footer], "v2.0.0")).toBe("major");
    // Before 1.0.0 a breaking change is a minor bump.
    expect(suggestBump([breaking], "0.4.0")).toBe("minor");
  });
});

describe("release notes", () => {
  test("groups commits by type with scope and short hash", () => {
    const notes = formatReleaseNotes([
      { hash: "aaaaaaa1111", subject: "feat(pr): add list" },
      { hash: "bbbbbbb2222", subject: "fix: crash" },
      { hash: "ccccccc3333", subject: "chore: deps" },
      { hash: "ddddddd4444", subject: "Update readme" },
      { hash: "eeeeeee5555", subject: "feat!: drop node 20" },
    ]);

    expect(notes).toBe(
      [
        "### Breaking Changes",
        "",
        "- drop node 20 (eeeeeee)",
        "",
        "### Features",
        "",
        "- **pr:** add list (aaaaaaa)",
        "",
        "### Fixes",
        "",
        "- crash (bbbbbbb)",
        "",
        "### Maintenance",
        "",
        "- deps (ccccccc)",
        "",
        "### Other",
        "",
        "- Update readme (ddddddd)",
      ].join("\n")
    );
  });

  test("compareLink and buildReleaseUrl per host", () => {
    const gitlab = { host: "gitlab.com", owner: "g", repo: "app" };

    expect(compareLink(github, "v1.0.0", "v1.1.0")).toBe(
      "https://github.com/sudoeren/eckra/compare/v1.0.0...v1.1.0"
    );
    expect(compareLink(gitlab, "v1.0.0", "v1.1.0")).toBe(
      "https://gitlab.com/g/app/-/compare/v1.0.0...v1.1.0"
    );
    expect(compareLink(github, null, "v1.0.0")).toBeNull();
    expect(compareLink(null, "v1.0.0", "v1.1.0")).toBeNull();

    expect(buildReleaseUrl(github, "v1.1.0", "v1.1.0")).toBe(
      "https://github.com/sudoeren/eckra/releases/new?tag=v1.1.0&title=v1.1.0"
    );
    expect(buildReleaseUrl(gitlab, "v1.1.0")).toBe(
      "https://gitlab.com/g/app/-/releases/new?tag_name=v1.1.0"
    );
    expect(
      buildReleaseUrl({ host: "git.x.io", owner: "a", repo: "b" }, "v1")
    ).toBeNull();
  });
});

describe("updateChangelog", () => {
  const entry = {
    version: "1.6.0",
    body: "### Fixes\n\n- a\n",
    date: "2026-10-03",
  };

  test("creates a changelog with a header", () => {
    expect(updateChangelog("", entry)).toBe(
      "# Changelog\n\nAll notable changes to this project are documented in this file.\n\n## [1.6.0] - 2026-10-03\n\n### Fixes\n\n- a\n"
    );
  });

  test("puts the new release above the previous ones", () => {
    const existing =
      "# Changelog\n\nintro\n\n## [1.5.0] - 2026-01-01\n\n- old\n";

    expect(updateChangelog(existing, entry)).toBe(
      "# Changelog\n\nintro\n\n## [1.6.0] - 2026-10-03\n\n### Fixes\n\n- a\n\n## [1.5.0] - 2026-01-01\n\n- old\n"
    );
  });

  test("replaces the section when the version is already there", () => {
    const once = updateChangelog(
      "# Changelog\n\n## [1.5.0] - 2026-01-01\n\n- old\n",
      entry
    );
    const twice = updateChangelog(once, { ...entry, body: "- redone" });

    expect(twice).toBe(
      "# Changelog\n\n## [1.6.0] - 2026-10-03\n\n- redone\n\n## [1.5.0] - 2026-01-01\n\n- old\n"
    );
    expect(twice.match(/1\.6\.0/g)).toHaveLength(1);
  });

  test("does not mistake 1.6.0 for 1.6.01 or 11.6.0", () => {
    const existing = "# Changelog\n\n## [11.6.0] - 2026-01-01\n\n- other\n";

    expect(updateChangelog(existing, entry)).toContain("## [11.6.0]");
  });
});

describe("git and file operations", () => {
  let root;
  let raw;

  beforeEach(() => {
    jest.clearAllMocks();
    root = fs.mkdtempSync(path.join(os.tmpdir(), "eckra-rel-"));
    raw = jest.fn().mockResolvedValue("");
    git.getGit.mockReturnValue({
      raw,
      add: jest.fn(),
      revparse: jest.fn().mockResolvedValue(root + "\n"),
    });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test("getLatestTag returns null before the first tag", async () => {
    raw.mockResolvedValueOnce("v1.5.7\n");
    expect(await getLatestTag()).toBe("v1.5.7");

    raw.mockRejectedValueOnce(new Error("No names found"));
    expect(await getLatestTag()).toBeNull();
  });

  test("getCommitsBetween skips version bumps and release commits", async () => {
    raw.mockResolvedValue(
      record("a1", "feat: one", "body text") +
        record("a2", "1.5.7") +
        record("a3", "chore(release): v1.5.6") +
        record("a4", "fix: two")
    );

    const commits = await getCommitsBetween("v1.5.6");

    expect(raw.mock.calls[0][0].slice(-1)).toEqual(["v1.5.6..HEAD"]);
    expect(commits.map((c) => c.subject)).toEqual(["feat: one", "fix: two"]);
    expect(commits[0]).toEqual({
      hash: "a1",
      subject: "feat: one",
      body: "body text",
      author: "eren",
    });

    await getCommitsBetween(null, "main");
    expect(raw.mock.calls[1][0].slice(-1)).toEqual(["main"]);
  });

  test("buildReleaseNotes groups commits and adds the compare link", async () => {
    raw
      .mockResolvedValueOnce("v1.5.7\n")
      .mockResolvedValueOnce(record("abcdef1234", "fix: crash"));

    const built = await buildReleaseNotes({ tag: "v1.5.8", remote: github });

    expect(built.previousTag).toBe("v1.5.7");
    expect(built.notes).toBe(
      "### Fixes\n\n- crash (abcdef1)\n\n**Full Changelog**: https://github.com/sudoeren/eckra/compare/v1.5.7...v1.5.8"
    );
  });

  test("buildReleaseNotes fails when there is nothing to release", async () => {
    raw.mockResolvedValueOnce("v1.5.7\n").mockResolvedValueOnce("");

    await expect(buildReleaseNotes()).rejects.toThrow(
      "No commits since v1.5.7."
    );
  });

  test("writeChangelog creates and then extends CHANGELOG.md", async () => {
    await writeChangelog({
      version: "1.0.0",
      body: "- first",
      date: "2026-01-01",
    });
    const file = await writeChangelog({
      version: "1.1.0",
      body: "- second",
      date: "2026-02-01",
    });

    expect(file).toBe("CHANGELOG.md");
    const text = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
    expect(text.indexOf("[1.1.0]")).toBeLessThan(text.indexOf("[1.0.0]"));
  });

  test("bumpPackageVersion updates package.json and the lockfile, keeping the format", async () => {
    fs.writeFileSync(
      path.join(root, "package.json"),
      '{\n    "name": "x",\n    "version": "1.0.0"\n}\n'
    );
    fs.writeFileSync(
      path.join(root, "package-lock.json"),
      JSON.stringify(
        {
          name: "x",
          version: "1.0.0",
          packages: {
            "": { version: "1.0.0" },
            "node_modules/dep": { version: "3.0.0" },
          },
        },
        null,
        2
      )
    );

    expect(await bumpPackageVersion("1.1.0")).toEqual([
      "package.json",
      "package-lock.json",
    ]);
    expect(fs.readFileSync(path.join(root, "package.json"), "utf8")).toBe(
      '{\n    "name": "x",\n    "version": "1.1.0"\n}\n'
    );
    const lock = JSON.parse(
      fs.readFileSync(path.join(root, "package-lock.json"), "utf8")
    );
    expect(lock.version).toBe("1.1.0");
    expect(lock.packages[""].version).toBe("1.1.0");
    expect(lock.packages["node_modules/dep"].version).toBe("3.0.0");
  });

  test("bumpPackageVersion does nothing without a package.json", async () => {
    expect(await bumpPackageVersion("1.1.0")).toEqual([]);
  });

  test("commitReleaseFiles commits only the release files", async () => {
    await commitReleaseFiles(
      ["CHANGELOG.md", "package.json"],
      "chore(release): v1.1.0"
    );

    expect(raw).toHaveBeenCalledWith([
      "commit",
      "-m",
      "chore(release): v1.1.0",
      "--",
      path.join(root, "CHANGELOG.md"),
      path.join(root, "package.json"),
    ]);
  });

  test("createGithubRelease publishes the pushed tag with the notes", async () => {
    let notesSeen = null;
    childProcess.execFile.mockImplementation((_bin, args, _opts, cb) => {
      notesSeen = fs.readFileSync(
        args[args.indexOf("--notes-file") + 1],
        "utf8"
      );
      cb(null, "https://github.com/o/r/releases/tag/v1.1.0\n", "");
    });

    const url = await createGithubRelease({
      tag: "v1.1.0",
      notes: "### Fixes",
      draft: true,
      prerelease: true,
    });

    expect(url).toBe("https://github.com/o/r/releases/tag/v1.1.0");
    expect(notesSeen).toBe("### Fixes");
    const args = childProcess.execFile.mock.calls[0][1];
    expect(args.slice(0, 6)).toEqual([
      "release",
      "create",
      "v1.1.0",
      "--verify-tag",
      "--title",
      "v1.1.0",
    ]);
    expect(args.slice(-2)).toEqual(["--draft", "--prerelease"]);
  });
});
