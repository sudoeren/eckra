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
