const simpleGit = require("simple-git");
const {
  getGitStatus,
  stageAll,
  createCommit,
  getStagedDiff,
  getCurrentBranch,
  rebase,
  cherryPick,
  listSubmodules,
  abortRebase,
  getConflictedDiff,
  getGraphData,
  listTagDetails,
  getRepoStats,
  resetGitCache,
} = require("../src/helpers/git");

jest.mock("simple-git");

describe("Git Helper", () => {
  let mockGit;

  beforeEach(() => {
    resetGitCache();
    mockGit = {
      status: jest.fn(),
      add: jest.fn(),
      commit: jest.fn(),
      diff: jest.fn(),
      push: jest.fn(),
      pull: jest.fn(),
      branch: jest.fn(),
      log: jest.fn(),
      stash: jest.fn(),
      stashList: jest.fn(),
      reset: jest.fn(),
      checkout: jest.fn(),
      checkoutLocalBranch: jest.fn(),
      merge: jest.fn(),
      getRemotes: jest.fn(),
      raw: jest.fn(),
      init: jest.fn(),
      addRemote: jest.fn(),
      fetch: jest.fn(),
      tags: jest.fn(),
      addTag: jest.fn(),
      addAnnotatedTag: jest.fn(),
      pushTags: jest.fn(),
      removeRemote: jest.fn(),
      show: jest.fn(),
      rebase: jest.fn(),
    };
    simpleGit.mockReturnValue(mockGit);
  });

  test("getGitStatus should call git.status", async () => {
    const mockStatus = { current: "main", staged: [], modified: [] };
    mockGit.status.mockResolvedValue(mockStatus);

    const status = await getGitStatus();

    expect(status).toBe(mockStatus);
    expect(mockGit.status).toHaveBeenCalled();
  });

  test('stageAll should call git.add with "."', async () => {
    await stageAll();
    expect(mockGit.add).toHaveBeenCalledWith(".");
  });

  test("createCommit should call git.commit with message", async () => {
    const message = "feat: test commit";
    await createCommit(message);
    expect(mockGit.commit).toHaveBeenCalledWith(message);
  });

  test("getStagedDiff should call git.diff with --cached", async () => {
    await getStagedDiff();
    expect(mockGit.diff).toHaveBeenCalledWith(["--cached"]);
  });

  test("getCurrentBranch should return current branch name", async () => {
    mockGit.branch.mockResolvedValue({ current: "feature-abc" });
    const branch = await getCurrentBranch();
    expect(branch).toBe("feature-abc");
  });

  test("rebase should call git.rebase with branch", async () => {
    await rebase("main");
    expect(mockGit.rebase).toHaveBeenCalledWith(["main"]);
  });

  test("cherryPick should call git.raw with cherry-pick and hash", async () => {
    await cherryPick("abc1234");
    expect(mockGit.raw).toHaveBeenCalledWith(["cherry-pick", "abc1234"]);
  });

  test("listSubmodules should call git.raw with submodule status", async () => {
    mockGit.raw.mockResolvedValue(" 1234567 path/to/sub (heads/main)");
    const submodules = await listSubmodules();
    expect(mockGit.raw).toHaveBeenCalledWith(["submodule", "status"]);
    expect(submodules[0].path).toBe("path/to/sub");
  });

  test("abortRebase should call git.rebase with --abort", async () => {
    await abortRebase();
    expect(mockGit.rebase).toHaveBeenCalledWith(["--abort"]);
  });

  test("listTagDetails parses for-each-ref output", async () => {
    mockGit.raw.mockResolvedValue(
      [
        "v1.1.0\u001ftag\u001fabc1234\u001fdef4567\u001fRelease one\u001fEren\u001f2026-08-19 00:34:28 +0300",
        "v1.0.0\u001fcommit\u001fdef4567\u001f\u001f\u001f\u001f\u001f",
        "",
      ].join("\n")
    );
    const tags = await listTagDetails();
    expect(mockGit.raw).toHaveBeenCalledWith(
      expect.arrayContaining(["for-each-ref", "refs/tags"])
    );
    expect(tags).toHaveLength(2);
    expect(tags[0]).toMatchObject({
      name: "v1.1.0",
      type: "tag",
      commit: "def4567",
      subject: "Release one",
      tagger: "Eren",
      date: "2026-08-19 00:34:28 +0300",
    });
    expect(tags[1]).toMatchObject({
      name: "v1.0.0",
      type: "commit",
      commit: "def4567",
      subject: "",
      tagger: "",
    });
  });

  test("getGraphData parses structured commit data", async () => {
    mockGit.raw.mockResolvedValue(
      [
        "abc1234\x1fdef4567\x1ffix: thing\x1fEren\x1feren@t.dev\x1f1700000000\x1fHEAD -> main, tag: v1.0",
        "def4567\x1f\x1fchore: init\x1fEren\x1feren@t.dev\x1f1699999999\x1forigin/main",
        "",
      ].join("\x1e")
    );
    const commits = await getGraphData(5);
    expect(mockGit.raw).toHaveBeenCalledWith(
      expect.arrayContaining(["--all", "--topo-order"])
    );
    expect(commits).toHaveLength(2);
    expect(commits[0]).toMatchObject({
      hash: "abc1234",
      parents: ["def4567"],
      subject: "fix: thing",
      author: "Eren",
      email: "eren@t.dev",
      refs: "HEAD -> main, tag: v1.0",
    });
    expect(commits[0].timestamp).toBe(1700000000000);
    expect(commits[1].parents).toEqual([]);
    expect(commits[1].refs).toBe("origin/main");
  });

  test("getRepoStats computes counts, dates and distributions", async () => {
    mockGit.branch.mockResolvedValue({
      all: ["main", "remotes/origin/main"],
    });
    mockGit.tags.mockResolvedValue({ all: ["v1.0", "v1.1"] });
    mockGit.raw.mockImplementation((args) => {
      if (args[0] === "rev-list" && args.includes("--merges")) {
        return "2";
      }
      if (args[0] === "rev-list") {
        return "10";
      }
      if (args[0] === "shortlog") {
        return "   6\tEren\n   4\tsudoeren";
      }
      if (args[0] === "log") {
        return [
          "2026-08-19T10:30:00+03:00",
          "2026-08-01T09:00:00+03:00",
          "2026-07-15T23:00:00+03:00",
          "2026-07-02T18:00:00+03:00",
          "",
        ].join("\n");
      }
      return "";
    });

    const stats = await getRepoStats();
    expect(stats.totalCommits).toBe(10);
    expect(stats.merges).toBe(2);
    expect(stats.branches).toBe(1);
    expect(stats.remoteBranches).toBe(1);
    expect(stats.tags).toBe(2);
    expect(stats.totalAuthors).toBe(2);
    expect(stats.authors).toEqual({ Eren: 6, sudoeren: 4 });
    expect(stats.firstCommit.date).toBe("2026-07-02T18:00:00+03:00");
    expect(stats.lastCommit.date).toBe("2026-08-19T10:30:00+03:00");
    expect(stats.activity).toEqual([
      { period: "2026-07", count: 2 },
      { period: "2026-08", count: 2 },
    ]);
    expect(stats.byDayOfWeek.reduce((a, b) => a + b, 0)).toBe(4);
    expect(stats.byHour.reduce((a, b) => a + b, 0)).toBe(4);
  });

  test("getConflictedDiff should diff only conflicted files", async () => {
    mockGit.status.mockResolvedValue({
      conflicted: ["a.txt", "b.txt"],
    });
    mockGit.diff.mockResolvedValue("diff --git a/a.txt b/a.txt");

    const diff = await getConflictedDiff();

    expect(mockGit.diff).toHaveBeenCalledWith(["a.txt", "b.txt"]);
    expect(diff).toBe("diff --git a/a.txt b/a.txt");
  });

  test("getConflictedDiff returns empty string when no conflicts", async () => {
    mockGit.status.mockResolvedValue({ conflicted: [] });

    const diff = await getConflictedDiff();

    expect(diff).toBe("");
    expect(mockGit.diff).not.toHaveBeenCalled();
  });
});
