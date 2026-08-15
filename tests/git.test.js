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
});
