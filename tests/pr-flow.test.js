const { doPullRequest } = require("../src/ui/modules/pr");
const git = require("../src/helpers/git");
const ai = require("../src/helpers/ai");
const pr = require("../src/helpers/pr");
const clipboard = require("../src/helpers/clipboard");
const screen = require("../src/ui/screen");

jest.mock("../src/helpers/git");
jest.mock("../src/helpers/ai");
jest.mock("../src/helpers/pr");
jest.mock("../src/helpers/clipboard");
jest.mock("../src/ui/screen", () => ({
  open: jest.fn(),
  prompt: jest.fn(),
  menuItem: (label, _tone, value) => ({ name: label, value }),
  backItem: (label) => ({ name: label, value: "back" }),
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
}));

describe("Pull request flow", () => {
  const commits = [{ message: "feat: add pr command" }];
  const template = {
    name: ".github/PULL_REQUEST_TEMPLATE.md",
    content: "## Description\n\n_What does this PR do?_\n",
  };
  let logSpy;

  beforeEach(() => {
    jest.resetAllMocks();
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    git.getRemotes.mockResolvedValue([
      {
        name: "origin",
        refs: { fetch: "u", push: "git@github.com:sudoeren/eckra.git" },
      },
    ]);
    git.getCurrentBranch.mockResolvedValue("feat/pr");

    pr.parseRemoteUrl.mockReturnValue({
      host: "github.com",
      owner: "sudoeren",
      repo: "eckra",
    });
    pr.getDefaultBranch.mockResolvedValue("master");
    pr.resolveBaseRef.mockResolvedValue("origin/master");
    pr.getPrCommits.mockResolvedValue(commits);
    pr.getPrDiff.mockResolvedValue({ diff: "diff", stat: "stat" });
    pr.getRepoRoot.mockResolvedValue("/repo");
    pr.findPrTemplates.mockReturnValue([template]);
    pr.fallbackPrContent.mockReturnValue({
      title: "fallback title",
      body: "fallback body",
    });
    pr.isGhAvailable.mockResolvedValue(true);
    pr.findExistingPr.mockResolvedValue(null);
    pr.getPushState.mockResolvedValue({ upstream: "origin/x", unpushed: 0 });
    pr.createPullRequest.mockResolvedValue("https://github.com/o/r/pull/1");

    ai.generatePullRequest.mockResolvedValue({
      title: "feat: add pr command",
      body: "## Description\n\nAdds `eckra pr`.",
    });
    clipboard.copyToClipboard.mockResolvedValue(true);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test("fills in the repo template with AI and creates the PR", async () => {
    screen.prompt.mockResolvedValueOnce({ action: "create" });

    await doPullRequest(null);

    expect(pr.findPrTemplates).toHaveBeenCalledWith("/repo");
    expect(ai.generatePullRequest).toHaveBeenCalledWith({
      commits,
      diff: "diff",
      stat: "stat",
      branch: "feat/pr",
      base: "master",
      template: template.content,
      instruction: null,
    });
    expect(pr.createPullRequest).toHaveBeenCalledWith({
      title: "feat: add pr command",
      body: "## Description\n\nAdds `eckra pr`.",
      base: "master",
      draft: false,
    });
  });

  test("generates without a template when the repo has none", async () => {
    pr.findPrTemplates.mockReturnValue([]);
    screen.prompt.mockResolvedValueOnce({ action: "create" });

    await doPullRequest(null);

    expect(ai.generatePullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ template: undefined })
    );
    expect(pr.createPullRequest).toHaveBeenCalled();
  });

  test("asks which template to use when there are several", async () => {
    const other = {
      name: ".github/PULL_REQUEST_TEMPLATE/bug.md",
      content: "B",
    };
    pr.findPrTemplates.mockReturnValue([template, other]);
    screen.prompt
      .mockResolvedValueOnce({ selected: other })
      .mockResolvedValueOnce({ action: "create" });

    await doPullRequest(null);

    expect(ai.generatePullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ template: "B" })
    );
  });

  test("backing out of the template picker stops the flow", async () => {
    pr.findPrTemplates.mockReturnValue([template, { name: "b", content: "B" }]);
    screen.prompt.mockResolvedValueOnce({ selected: "back" });

    await doPullRequest(null);

    expect(ai.generatePullRequest).not.toHaveBeenCalled();
    expect(pr.createPullRequest).not.toHaveBeenCalled();
  });

  test("'No template' still generates a pull request", async () => {
    pr.findPrTemplates.mockReturnValue([template, { name: "b", content: "B" }]);
    screen.prompt
      .mockResolvedValueOnce({ selected: null })
      .mockResolvedValueOnce({ action: "create" });

    await doPullRequest(null);

    expect(ai.generatePullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ template: undefined })
    );
    expect(pr.createPullRequest).toHaveBeenCalled();
  });

  test("--yes skips the review menu; --draft and --title are honored", async () => {
    await doPullRequest(null, { yes: true, draft: true, title: "My title" });

    expect(screen.prompt).not.toHaveBeenCalled();
    expect(pr.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ title: "My title", draft: true })
    );
  });

  test("'Create as draft' creates a draft", async () => {
    screen.prompt.mockResolvedValueOnce({ action: "draft" });

    await doPullRequest(null);

    expect(pr.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ draft: true })
    );
  });

  test("edited title and body are what gets created", async () => {
    screen.prompt
      .mockResolvedValueOnce({ action: "title" })
      .mockResolvedValueOnce({ title: " New title " })
      .mockResolvedValueOnce({ action: "body" })
      .mockResolvedValueOnce({ body: "New body\n" })
      .mockResolvedValueOnce({ action: "create" });

    await doPullRequest(null);

    expect(pr.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ title: "New title", body: "New body" })
    );
  });

  test("cancel creates nothing and pushes nothing", async () => {
    pr.getPushState.mockResolvedValue({ upstream: null, unpushed: null });
    screen.prompt.mockResolvedValueOnce({ action: "back" });

    await doPullRequest(null);

    expect(pr.pushBranch).not.toHaveBeenCalled();
    expect(pr.createPullRequest).not.toHaveBeenCalled();
  });

  test("--no-ai uses the template as the body", async () => {
    pr.fallbackPrContent.mockReturnValue({
      title: "feat: add pr command",
      body: template.content.trim(),
    });

    await doPullRequest(null, { yes: true, noAi: true });

    expect(ai.generatePullRequest).not.toHaveBeenCalled();
    expect(pr.fallbackPrContent).toHaveBeenCalledWith(
      commits,
      "feat/pr",
      template.content
    );
    expect(pr.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ body: template.content.trim() })
    );
  });

  test("falls back to the template when the AI fails", async () => {
    ai.generatePullRequest.mockRejectedValue(new Error("boom"));
    screen.prompt.mockResolvedValueOnce({ action: "create" });

    await doPullRequest(null);

    expect(screen.fail).toHaveBeenCalledWith(
      expect.anything(),
      "AI error: boom"
    );
    expect(pr.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "fallback title",
        body: "fallback body",
      })
    );
  });

  test("pushes an unpublished branch after confirmation", async () => {
    pr.getPushState.mockResolvedValue({ upstream: null, unpushed: null });
    screen.prompt
      .mockResolvedValueOnce({ action: "create" })
      .mockResolvedValueOnce({ push: true });

    await doPullRequest(null);

    expect(pr.pushBranch).toHaveBeenCalledWith("feat/pr", "origin");
    expect(pr.createPullRequest).toHaveBeenCalled();
  });

  test("does not create the PR when the push is declined", async () => {
    pr.getPushState.mockResolvedValue({ upstream: "origin/x", unpushed: 2 });
    screen.prompt
      .mockResolvedValueOnce({ action: "create" })
      .mockResolvedValueOnce({ push: false });

    await doPullRequest(null);

    expect(pr.pushBranch).not.toHaveBeenCalled();
    expect(pr.createPullRequest).not.toHaveBeenCalled();
  });

  describe("when the branch already has an open pull request", () => {
    const existing = {
      number: 9,
      title: "old title",
      url: "https://github.com/o/r/pull/9",
      baseRefName: "develop",
    };

    beforeEach(() => {
      pr.findExistingPr.mockResolvedValue(existing);
      pr.resolveBaseRef.mockResolvedValue("origin/develop");
      pr.updatePullRequest.mockResolvedValue(existing.url);
    });

    test("Back leaves it untouched", async () => {
      screen.prompt.mockResolvedValueOnce({ action: "back" });

      await doPullRequest(null);

      expect(ai.generatePullRequest).not.toHaveBeenCalled();
      expect(pr.updatePullRequest).not.toHaveBeenCalled();
      expect(pr.createPullRequest).not.toHaveBeenCalled();
    });

    test("rewrites the title and description against the PR's own base", async () => {
      screen.prompt
        .mockResolvedValueOnce({ action: "update" })
        .mockResolvedValueOnce({ action: "create" });

      await doPullRequest(null);

      expect(pr.getDefaultBranch).not.toHaveBeenCalled();
      expect(pr.resolveBaseRef).toHaveBeenCalledWith("develop", "origin");
      expect(ai.generatePullRequest).toHaveBeenCalledWith(
        expect.objectContaining({ base: "develop" })
      );
      expect(pr.updatePullRequest).toHaveBeenCalledWith({
        number: 9,
        title: "feat: add pr command",
        body: "## Description\n\nAdds `eckra pr`.",
      });
      expect(pr.createPullRequest).not.toHaveBeenCalled();

      const review = screen.prompt.mock.calls[1][0][0].choices;
      expect(review[0]).toEqual({
        name: "Update pull request #9",
        value: "create",
      });
      expect(review.map((c) => c.value)).not.toContain("draft");
    });

    test("pushes new commits before updating", async () => {
      pr.getPushState.mockResolvedValue({ upstream: "origin/x", unpushed: 1 });
      screen.prompt
        .mockResolvedValueOnce({ action: "update" })
        .mockResolvedValueOnce({ action: "create" })
        .mockResolvedValueOnce({ push: true });

      await doPullRequest(null);

      expect(pr.pushBranch).toHaveBeenCalledWith("feat/pr", "origin");
      expect(pr.updatePullRequest).toHaveBeenCalled();
    });

    test("--update skips the question; with --yes also the review", async () => {
      await doPullRequest(null, { update: true, yes: true });

      expect(screen.prompt).not.toHaveBeenCalled();
      expect(pr.updatePullRequest).toHaveBeenCalled();
    });

    test("--yes alone never rewrites an existing pull request", async () => {
      await doPullRequest(null, { yes: true });

      expect(ai.generatePullRequest).not.toHaveBeenCalled();
      expect(pr.updatePullRequest).not.toHaveBeenCalled();
      expect(pr.createPullRequest).not.toHaveBeenCalled();
    });

    test("does not offer to move commits when the PR is from the base branch", async () => {
      git.getCurrentBranch.mockResolvedValue("develop");
      screen.prompt.mockResolvedValueOnce({ action: "back" });

      await doPullRequest(null);

      expect(pr.moveCommitsToNewBranch).not.toHaveBeenCalled();
    });
  });

  test("--update without an open pull request stops", async () => {
    await doPullRequest(null, { update: true });

    expect(ai.generatePullRequest).not.toHaveBeenCalled();
    expect(pr.createPullRequest).not.toHaveBeenCalled();
    expect(pr.updatePullRequest).not.toHaveBeenCalled();
  });

  test("stops when there are no commits to open a pull request for", async () => {
    pr.getPrCommits.mockResolvedValue([]);
    await doPullRequest(null);

    git.getCurrentBranch.mockResolvedValue("master");
    await doPullRequest(null);

    expect(pr.moveCommitsToNewBranch).not.toHaveBeenCalled();
    expect(ai.generatePullRequest).not.toHaveBeenCalled();
    expect(pr.createPullRequest).not.toHaveBeenCalled();
  });

  describe("commits made directly on the base branch", () => {
    beforeEach(() => {
      git.getCurrentBranch.mockResolvedValue("master");
      pr.suggestBranchName.mockReturnValue("feat/add-pr-command");
      pr.availableBranchName.mockImplementation(async (name) => name);
      pr.isValidBranchName.mockResolvedValue(true);
      pr.branchExists.mockResolvedValue(false);
      pr.getPushState.mockResolvedValue({ upstream: null, unpushed: null });
    });

    test("moves them to a new branch and opens the PR from it", async () => {
      screen.prompt
        .mockResolvedValueOnce({ name: " feat/my-branch " })
        .mockResolvedValueOnce({ action: "create" })
        .mockResolvedValueOnce({ push: true });

      await doPullRequest(null);

      expect(pr.moveCommitsToNewBranch).toHaveBeenCalledWith(
        "feat/my-branch",
        "master",
        "origin/master"
      );
      expect(ai.generatePullRequest).toHaveBeenCalledWith(
        expect.objectContaining({ branch: "feat/my-branch", base: "master" })
      );
      expect(pr.pushBranch).toHaveBeenCalledWith("feat/my-branch", "origin");
      expect(pr.createPullRequest).toHaveBeenCalled();
    });

    test("an empty branch name cancels without touching anything", async () => {
      screen.prompt.mockResolvedValueOnce({ name: "" });

      await doPullRequest(null);

      expect(pr.moveCommitsToNewBranch).not.toHaveBeenCalled();
      expect(pr.createPullRequest).not.toHaveBeenCalled();
    });

    test("rejects invalid and existing branch names", async () => {
      screen.prompt.mockResolvedValueOnce({ name: "" });

      await doPullRequest(null);
      const { validate } = screen.prompt.mock.calls[0][0][0];

      pr.isValidBranchName.mockResolvedValueOnce(false);
      expect(await validate("a..b")).toBe("Invalid branch name");
      pr.branchExists.mockResolvedValueOnce(true);
      expect(await validate("taken")).toBe("taken already exists");
      expect(await validate("fine")).toBe(true);
    });

    test("--yes uses the suggested branch name", async () => {
      await doPullRequest(null, { yes: true });

      expect(screen.prompt).not.toHaveBeenCalled();
      expect(pr.moveCommitsToNewBranch).toHaveBeenCalledWith(
        "feat/add-pr-command",
        "master",
        "origin/master"
      );
      expect(pr.createPullRequest).toHaveBeenCalled();
    });

    test("stops when the commits cannot be moved", async () => {
      pr.moveCommitsToNewBranch.mockRejectedValue(new Error("nope"));
      screen.prompt.mockResolvedValueOnce({ name: "feat/x" });

      await doPullRequest(null);

      expect(pr.createPullRequest).not.toHaveBeenCalled();
    });
  });

  test("prints a prefilled link when gh is not installed", async () => {
    pr.isGhAvailable.mockResolvedValue(false);
    pr.buildCompareUrl.mockReturnValue("https://github.com/o/r/compare/x");
    screen.prompt.mockResolvedValueOnce({ action: "create" });

    await doPullRequest(null);

    expect(pr.findExistingPr).not.toHaveBeenCalled();
    expect(pr.createPullRequest).not.toHaveBeenCalled();
    expect(clipboard.copyToClipboard).toHaveBeenCalledWith(
      "## Description\n\nAdds `eckra pr`."
    );
    expect(logSpy.mock.calls.flat().join("\n")).toContain(
      "https://github.com/o/r/compare/x"
    );
  });
});
