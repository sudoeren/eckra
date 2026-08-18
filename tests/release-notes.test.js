const { execSync } = require("child_process");
const {
  parseCommitSubject,
  groupCommits,
  buildReleaseNotes,
  isVersionBump,
  getPreviousTag,
  getCommitLog,
} = require("../src/helpers/releaseNotes");

jest.mock("child_process");

describe("Release Notes Helper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("parseCommitSubject", () => {
    test("parses type, scope and description", () => {
      expect(parseCommitSubject("feat(update): add update command")).toEqual({
        type: "feat",
        scope: "update",
        description: "add update command",
        breaking: false,
      });
    });

    test("detects breaking changes from the exclamation mark", () => {
      expect(parseCommitSubject("feat!: drop old API").breaking).toBe(true);
    });

    test("detects breaking changes from the body", () => {
      expect(
        parseCommitSubject("refactor: rework auth", "BREAKING CHANGE: x")
      ).toMatchObject({ breaking: true });
    });

    test("treats non-conventional subjects as plain text", () => {
      expect(parseCommitSubject("random commit")).toEqual({
        type: null,
        scope: null,
        description: "random commit",
        breaking: false,
      });
    });
  });

  describe("isVersionBump", () => {
    test("recognizes npm version commits", () => {
      expect(isVersionBump("v1.4.10")).toBe(true);
      expect(isVersionBump("1.4.10")).toBe(true);
      expect(isVersionBump("feat: add stuff")).toBe(false);
    });
  });

  describe("groupCommits", () => {
    test("sorts commits into conventional buckets", () => {
      const groups = groupCommits([
        { subject: "feat: add feature", body: "" },
        { subject: "fix(core): patch bug", body: "" },
        { subject: "perf: speed up", body: "" },
        { subject: "docs: update readme", body: "" },
        { subject: "test: add tests", body: "" },
        { subject: "chore: bump deps", body: "" },
        { subject: "ci: fix workflow", body: "" },
        { subject: "random text", body: "" },
      ]);

      expect(groups.features).toEqual(["add feature"]);
      expect(groups.fixes).toEqual(["patch bug"]);
      expect(groups.performance).toEqual(["speed up"]);
      expect(groups.docs).toEqual(["update readme"]);
      expect(groups.tests).toEqual(["add tests"]);
      expect(groups.maintenance).toEqual(["bump deps", "fix workflow"]);
      expect(groups.other).toEqual(["random text"]);
      expect(groups.breaking).toEqual([]);
    });

    test("moves breaking commits to the breaking bucket", () => {
      const groups = groupCommits([
        { subject: "feat!: remove legacy", body: "" },
        { subject: "fix: keep going", body: "" },
      ]);

      expect(groups.breaking).toEqual(["remove legacy"]);
      expect(groups.features).toEqual([]);
      expect(groups.fixes).toEqual(["keep going"]);
    });
  });

  describe("buildReleaseNotes", () => {
    test("renders sections, drops empties and links the changelog", () => {
      const notes = buildReleaseNotes({
        version: "1.4.10",
        previousTag: "v1.4.9",
        commits: [
          { subject: "feat(update): implement update command", body: "" },
          { subject: "fix: patch default models", body: "" },
          { subject: "feat!: drop node 18", body: "" },
          { subject: "random plain text", body: "" },
        ],
      });

      expect(notes).toContain("# eckra v1.4.10");
      expect(notes).toContain("### Breaking Changes");
      expect(notes).toContain("- drop node 18");
      expect(notes).toContain("### Features");
      expect(notes).toContain("- implement update command");
      expect(notes).toContain("### Fixes");
      expect(notes).toContain("- patch default models");
      expect(notes).toContain("### Other");
      expect(notes).toContain("- random plain text");
      expect(notes).toContain(
        "Full Changelog: https://github.com/sudoeren/eckra/compare/v1.4.9...v1.4.10"
      );
      expect(notes).not.toContain("### Docs");
    });

    test("omits the changelog link for the first release", () => {
      const notes = buildReleaseNotes({
        version: "1.0.0",
        previousTag: null,
        commits: [{ subject: "feat: initial", body: "" }],
      });

      expect(notes).toContain("# eckra v1.0.0");
      expect(notes).not.toContain("Full Changelog");
    });
  });

  describe("git helpers", () => {
    test("getPreviousTag returns the last tag", () => {
      execSync.mockReturnValue("v1.4.9\n");
      expect(getPreviousTag()).toBe("v1.4.9");
    });

    test("getPreviousTag returns null when there is no previous tag", () => {
      execSync.mockImplementation(() => {
        throw new Error("no tags");
      });
      expect(getPreviousTag()).toBeNull();
    });

    test("getCommitLog filters version bumps and merges", () => {
      const records = [
        ["aaa111", "feat: add feature", ""],
        ["bbb222", "fix(core): patch bug", "body text"],
        ["ccc333", "v1.4.10", ""],
        ["ddd444", "Merge branch 'main'", ""],
      ];
      execSync.mockReturnValue(
        records.map(([h, s, b]) => `${h}\x1f${s}\x1f${b}\x1e`).join("")
      );

      const log = getCommitLog("v1.4.9");

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining("v1.4.9..HEAD"),
        expect.any(Object)
      );
      expect(log).toEqual([
        { hash: "aaa111", subject: "feat: add feature", body: "" },
        { hash: "bbb222", subject: "fix(core): patch bug", body: "body text" },
      ]);
    });

    test("getCommitLog uses full history without a previous tag", () => {
      execSync.mockReturnValue("");

      getCommitLog(null);

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining("git log"),
        expect.any(Object)
      );
    });
  });
});
