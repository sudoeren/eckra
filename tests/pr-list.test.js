const {
  doPullRequestList,
  doPullRequestMenu,
} = require("../src/ui/modules/pr");
const pr = require("../src/helpers/pr");
const screen = require("../src/ui/screen");

jest.mock("../src/helpers/git");
jest.mock("../src/helpers/ai");
jest.mock("../src/helpers/pr");
jest.mock("../src/helpers/clipboard");
jest.mock("../src/ui/screen", () => ({
  open: jest.fn(),
  emptyState: jest.fn(),
  confirmAction: jest.fn(),
  prompt: jest.fn(),
  menuItem: (label, _tone, value) => ({ name: label, value }),
  backItem: (label = "Back", value = "back") => ({ name: label, value }),
  sep: () => ({ type: "separator" }),
  spinner: () => ({ start: jest.fn(), stop: jest.fn() }),
  done: jest.fn(),
  fail: jest.fn(),
}));
jest.mock("../src/ui/common", () => ({
  s: new Proxy(
    {},
    {
      get: () => (value) => value,
    }
  ),
  pause: jest.fn(),
  link: (url) => url,
  truncate: (value) => value,
  cols: () => 100,
  timeAgo: () => "2 days",
}));

describe("Pull request list", () => {
  const openPr = {
    number: 71,
    title: "bump chalk",
    headRefName: "deps/chalk",
    baseRefName: "master",
    author: { login: "dependabot" },
    isDraft: false,
    reviewDecision: "APPROVED",
    statusCheckRollup: [],
    mergeable: "MERGEABLE",
    url: "https://github.com/o/r/pull/71",
    updatedAt: "2026-10-01T08:00:00Z",
  };
  let logSpy;

  const printed = () => logSpy.mock.calls.flat().join("\n");

  beforeEach(() => {
    jest.resetAllMocks();
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    pr.listPullRequests.mockResolvedValue([openPr]);
    pr.summarizeChecks.mockReturnValue({
      state: "failed",
      passed: 1,
      failed: 1,
      pending: 0,
      total: 2,
      failing: ["test (24)"],
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test("shows status details and goes back without acting", async () => {
    screen.prompt
      .mockResolvedValueOnce({ selected: openPr })
      .mockResolvedValueOnce({ action: "back" })
      .mockResolvedValueOnce({ selected: null });

    await doPullRequestList();

    expect(screen.open).toHaveBeenCalledWith(
      "#71 bump chalk",
      "deps/chalk → master"
    );
    expect(printed()).toContain("1/2 checks failed");
    expect(printed()).toContain("✗ test (24)");
    expect(printed()).toContain("approved");
    expect(printed()).toContain("updated 2 days ago");
    expect(pr.mergePullRequest).not.toHaveBeenCalled();
    expect(pr.checkoutPullRequest).not.toHaveBeenCalled();
  });

  test("checks out the selected pull request", async () => {
    screen.prompt
      .mockResolvedValueOnce({ selected: openPr })
      .mockResolvedValueOnce({ action: "checkout" })
      .mockResolvedValueOnce({ action: "back" })
      .mockResolvedValueOnce({ selected: null });

    await doPullRequestList();

    expect(pr.checkoutPullRequest).toHaveBeenCalledWith(71);
  });

  test("merges only after the method is chosen and confirmed", async () => {
    screen.confirmAction.mockResolvedValue(true);
    screen.prompt
      .mockResolvedValueOnce({ selected: openPr })
      .mockResolvedValueOnce({ action: "merge" })
      .mockResolvedValueOnce({ method: "squash" })
      .mockResolvedValueOnce({ deleteBranch: true })
      .mockResolvedValueOnce({ selected: null });

    await doPullRequestList();

    expect(screen.confirmAction).toHaveBeenCalledWith(
      "Merge #71 into master (squash)? This cannot be undone.",
      { tone: "error" }
    );
    expect(printed()).toContain("1/2 checks failed");
    expect(pr.mergePullRequest).toHaveBeenCalledWith(71, "squash", {
      deleteBranch: true,
    });
    // The list is reloaded after a merge.
    expect(pr.listPullRequests).toHaveBeenCalledTimes(2);
  });

  test("declining the confirmation or backing out merges nothing", async () => {
    screen.confirmAction.mockResolvedValue(false);
    screen.prompt
      .mockResolvedValueOnce({ selected: openPr })
      .mockResolvedValueOnce({ action: "merge" })
      .mockResolvedValueOnce({ method: "merge" })
      .mockResolvedValueOnce({ action: "merge" })
      .mockResolvedValueOnce({ method: "back" })
      .mockResolvedValueOnce({ action: "back" })
      .mockResolvedValueOnce({ selected: null });

    await doPullRequestList();

    expect(screen.confirmAction).toHaveBeenCalledTimes(1);
    expect(pr.mergePullRequest).not.toHaveBeenCalled();
  });

  test("reports an empty list and gh failures", async () => {
    pr.listPullRequests.mockResolvedValueOnce([]);
    await doPullRequestList();
    expect(screen.emptyState).toHaveBeenCalledWith("No open pull requests.");

    pr.listPullRequests.mockRejectedValueOnce(
      new Error("GitHub CLI (gh) is not installed.")
    );
    await doPullRequestList();
    expect(screen.fail).toHaveBeenCalledWith(
      expect.anything(),
      "GitHub CLI (gh) is not installed."
    );
    expect(screen.prompt).not.toHaveBeenCalled();
  });

  test("the hub opens the list and returns on Back", async () => {
    pr.listPullRequests.mockResolvedValue([]);
    screen.prompt
      .mockResolvedValueOnce({ action: "list" })
      .mockResolvedValueOnce({ action: "back" });

    await doPullRequestMenu();

    expect(pr.listPullRequests).toHaveBeenCalledTimes(1);
    expect(screen.prompt).toHaveBeenCalledTimes(2);
  });
});
