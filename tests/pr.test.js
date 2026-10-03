const fs = require("fs");
const os = require("os");
const path = require("path");
const childProcess = require("child_process");

jest.mock("child_process", () => ({ execFile: jest.fn() }));

const {
  findPrTemplates,
  parseRemoteUrl,
  buildCompareUrl,
  fallbackPrContent,
  extractIssueNumber,
  ensureIssueReference,
  parseList,
  getOpenIssue,
  listLabels,
  suggestBranchName,
  createPullRequest,
  updatePullRequest,
  findExistingPr,
  listPullRequests,
  summarizeChecks,
  mergePullRequest,
  checkoutPullRequest,

  isGhAvailable,
} = require("../src/helpers/pr");
const { parsePullRequestResponse } = require("../src/helpers/ai");

function mockGh(impl) {
  childProcess.execFile.mockImplementation((_bin, args, _opts, cb) => {
    const result = impl(args);
    if (result instanceof Error) cb(result, "", result.stderr || "");
    else cb(null, result, "");
  });
}

describe("PR template discovery", () => {
  let root;

  const write = (rel, content) => {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "eckra-pr-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test("returns nothing when the repo has no template", () => {
    expect(findPrTemplates(root)).toEqual([]);
  });

  test("finds .github/PULL_REQUEST_TEMPLATE.md", () => {
    write(".github/PULL_REQUEST_TEMPLATE.md", "## Description\n");

    expect(findPrTemplates(root)).toEqual([
      { name: ".github/PULL_REQUEST_TEMPLATE.md", content: "## Description\n" },
    ]);
  });

  test("matches the file name case-insensitively in root and docs", () => {
    write("pull_request_template.md", "root");
    write("docs/Pull_Request_Template.md", "docs");

    expect(findPrTemplates(root).map((t) => t.name)).toEqual([
      "pull_request_template.md",
      "docs/Pull_Request_Template.md",
    ]);
  });

  test("lists every file of a PULL_REQUEST_TEMPLATE directory", () => {
    write(".github/PULL_REQUEST_TEMPLATE/feature.md", "feature");
    write(".github/PULL_REQUEST_TEMPLATE/bugfix.md", "bugfix");
    write(".github/PULL_REQUEST_TEMPLATE/notes.json", "{}");

    expect(findPrTemplates(root).map((t) => t.name)).toEqual([
      ".github/PULL_REQUEST_TEMPLATE/bugfix.md",
      ".github/PULL_REQUEST_TEMPLATE/feature.md",
    ]);
  });

  test("skips empty templates", () => {
    write(".github/pull_request_template.md", "  \n");

    expect(findPrTemplates(root)).toEqual([]);
  });
});

describe("parseRemoteUrl", () => {
  test.each([
    ["https://github.com/sudoeren/eckra.git"],
    ["https://github.com/sudoeren/eckra"],
    ["git@github.com:sudoeren/eckra.git"],
    ["ssh://git@github.com:22/sudoeren/eckra.git"],
  ])("parses %s", (url) => {
    expect(parseRemoteUrl(url)).toEqual({
      host: "github.com",
      owner: "sudoeren",
      repo: "eckra",
    });
  });

  test("returns null for local paths and empty input", () => {
    expect(parseRemoteUrl("")).toBeNull();
    expect(parseRemoteUrl("/srv/git/eckra.git")).toBeNull();
  });
});

describe("buildCompareUrl", () => {
  const remote = { host: "github.com", owner: "sudoeren", repo: "eckra" };

  test("prefills the title and body", () => {
    const url = buildCompareUrl(remote, "main", "feat/pr", {
      title: "feat: add pr",
      body: "## Description",
    });

    expect(url).toBe(
      "https://github.com/sudoeren/eckra/compare/main...feat%2Fpr?expand=1&title=feat%3A%20add%20pr&body=%23%23%20Description"
    );
  });

  test("drops a body that would make the link too long", () => {
    const url = buildCompareUrl(remote, "main", "x", {
      title: "t",
      body: "a".repeat(10000),
    });

    expect(url).toContain("&title=t");
    expect(url).not.toContain("&body=");
  });

  test("returns null for non-GitHub hosts", () => {
    expect(
      buildCompareUrl({ host: "gitlab.com", owner: "a", repo: "b" }, "m", "x")
    ).toBeNull();
    expect(buildCompareUrl(null, "m", "x")).toBeNull();
  });
});

describe("fallbackPrContent", () => {
  test("uses the only commit's subject as the title", () => {
    expect(
      fallbackPrContent([{ message: "fix: crash\n\ndetails" }], "fix/crash")
    ).toEqual({ title: "fix: crash", body: "- fix: crash" });
  });

  test("derives the title from the branch for several commits", () => {
    const commits = [{ message: "feat: b" }, { message: "feat: a" }];

    expect(fallbackPrContent(commits, "feat/open-pr_flow")).toEqual({
      title: "open pr flow",
      body: "- feat: b\n- feat: a",
    });
  });

  test("uses the template as the body when there is one", () => {
    expect(
      fallbackPrContent([{ message: "feat: a" }], "x", "## Description\n").body
    ).toBe("## Description");
  });
});

describe("issue linking", () => {
  test.each([
    ["fix/123-crash", 123],
    ["123-foo", 123],
    ["feature/issue-45", 45],
    ["gh-7-typo", 7],
    ["user/fix_88_bug", 88],
    ["feat/v2-api", null],
    ["feat/pull-request", null],
    ["fix/1234567-too-long", null],
  ])("extractIssueNumber(%s) -> %s", (branch, expected) => {
    expect(extractIssueNumber(branch)).toBe(expected);
  });

  test("fills in a template's empty Closes placeholder", () => {
    expect(
      ensureIssueReference("## Related Issue\n\n_Closes #_\n", { number: 12 })
    ).toBe("## Related Issue\n\n_Closes #12_\n");
  });

  test("appends the reference when there is no placeholder", () => {
    expect(ensureIssueReference("body\n", { number: 12 })).toBe(
      "body\n\nCloses #12"
    );
    expect(ensureIssueReference("", { number: 12 })).toBe("Closes #12");
  });

  test("leaves a body that already links the issue alone", () => {
    expect(ensureIssueReference("Fixes #12.", { number: 12 })).toBe(
      "Fixes #12."
    );
    // #123 is a different issue
    expect(ensureIssueReference("see #123", { number: 12 })).toBe(
      "see #123\n\nCloses #12"
    );
  });

  test("does nothing without an issue", () => {
    expect(ensureIssueReference("_Closes #_", null)).toBe("_Closes #_");
  });
});

describe("parseList", () => {
  test("splits comma-separated names and drops @ and blanks", () => {
    expect(parseList("@alice, bob ,,org/team")).toEqual([
      "alice",
      "bob",
      "org/team",
    ]);
    expect(parseList(null)).toEqual([]);
    expect(parseList(["x"])).toEqual(["x"]);
  });
});

describe("suggestBranchName", () => {
  test("turns a conventional subject into type/slug", () => {
    expect(suggestBranchName([{ message: "feat(pr): add PR command" }])).toBe(
      "feat/add-pr-command"
    );
  });

  test("uses the oldest commit and strips accents", () => {
    const commits = [
      { message: "later tweak" },
      { message: "fix: çökme düzeltildi, Menü!\n\nbody" },
    ];

    expect(suggestBranchName(commits)).toBe("fix/cokme-duzeltildi-menu");
  });

  test("falls back to feature/ and keeps the slug short", () => {
    expect(suggestBranchName([{ message: "Update the readme" }])).toBe(
      "feature/update-the-readme"
    );
    expect(suggestBranchName([{ message: "!!!" }])).toBe("feature/changes");
    expect(
      suggestBranchName([{ message: `feat: ${"word ".repeat(30)}` }]).length
    ).toBeLessThanOrEqual(45);
  });
});

describe("parsePullRequestResponse", () => {
  test("splits the TITLE/BODY format", () => {
    expect(
      parsePullRequestResponse(
        "TITLE: feat: add pr command\nBODY:\n## Description\n\nAdds it."
      )
    ).toEqual({
      title: "feat: add pr command",
      body: "## Description\n\nAdds it.",
    });
  });

  test("strips code fences and quotes", () => {
    expect(
      parsePullRequestResponse(
        '```\nTITLE: "fix: x"\nBODY:\n```markdown\n## Summary\n```\n```'
      )
    ).toEqual({ title: "fix: x", body: "## Summary" });
  });

  test("falls back to first line as title without markers", () => {
    expect(parsePullRequestResponse("# Add pr\n\nBody text")).toEqual({
      title: "Add pr",
      body: "Body text",
    });
  });

  test("throws on an empty answer", () => {
    expect(() => parsePullRequestResponse("")).toThrow(/title/);
  });
});

describe("GitHub CLI calls", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("createPullRequest passes the body through a temp file", async () => {
    let bodySeen = null;
    let bodyFile = null;
    mockGh((args) => {
      bodyFile = args[args.indexOf("--body-file") + 1];
      bodySeen = fs.readFileSync(bodyFile, "utf8");
      return "Creating pull request...\nhttps://github.com/o/r/pull/7\n";
    });

    const url = await createPullRequest({
      title: "feat: x",
      body: "## Description",
      base: "main",
      draft: true,
    });

    expect(url).toBe("https://github.com/o/r/pull/7");
    expect(bodySeen).toBe("## Description");
    expect(fs.existsSync(bodyFile)).toBe(false);
    expect(childProcess.execFile.mock.calls[0][1]).toEqual([
      "pr",
      "create",
      "--title",
      "feat: x",
      "--body-file",
      bodyFile,
      "--base",
      "main",
      "--draft",
    ]);
  });

  test("updatePullRequest edits the title and body of that PR", async () => {
    let bodySeen = null;
    mockGh((args) => {
      bodySeen = fs.readFileSync(args[args.indexOf("--body-file") + 1], "utf8");
      return "https://github.com/o/r/pull/7\n";
    });

    const url = await updatePullRequest({
      number: 7,
      title: "feat: y",
      body: "new body",
    });

    expect(url).toBe("https://github.com/o/r/pull/7");
    expect(bodySeen).toBe("new body");
    expect(childProcess.execFile.mock.calls[0][1].slice(0, 5)).toEqual([
      "pr",
      "edit",
      "7",
      "--title",
      "feat: y",
    ]);
  });

  test("reviewers and labels are passed to create and added on update", async () => {
    mockGh(() => "https://github.com/o/r/pull/7\n");

    await createPullRequest({
      title: "t",
      body: "b",
      reviewers: ["alice", "org/team"],
      labels: ["bug"],
    });
    await updatePullRequest({
      number: 7,
      title: "t",
      body: "b",
      reviewers: ["alice"],
      labels: ["bug", "ui"],
    });

    const [create, update] = childProcess.execFile.mock.calls.map((c) => c[1]);
    expect(create.slice(6)).toEqual([
      "--reviewer",
      "alice",
      "--reviewer",
      "org/team",
      "--label",
      "bug",
    ]);
    expect(update.slice(7)).toEqual([
      "--add-reviewer",
      "alice",
      "--add-label",
      "bug",
      "--add-label",
      "ui",
    ]);
  });

  test("getOpenIssue only returns issues that exist and are open", async () => {
    mockGh(() => JSON.stringify({ number: 12, title: "Crash", state: "OPEN" }));
    expect(await getOpenIssue(12)).toEqual({ number: 12, title: "Crash" });

    mockGh(() =>
      JSON.stringify({ number: 12, title: "Crash", state: "CLOSED" })
    );
    expect(await getOpenIssue(12)).toBeNull();

    mockGh(() => new Error("not found"));
    expect(await getOpenIssue(12)).toBeNull();

    childProcess.execFile.mockClear();
    expect(await getOpenIssue(null)).toBeNull();
    expect(childProcess.execFile).not.toHaveBeenCalled();
  });

  test("listLabels returns sorted names, or nothing on failure", async () => {
    mockGh(() => JSON.stringify([{ name: "ui" }, { name: "bug" }]));
    expect(await listLabels()).toEqual(["bug", "ui"]);

    mockGh(() => new Error("boom"));
    expect(await listLabels()).toEqual([]);
  });

  test("createPullRequest surfaces gh's stderr", async () => {
    const error = new Error("Command failed");
    error.stderr = "a pull request already exists\n";
    mockGh(() => error);

    await expect(createPullRequest({ title: "t", body: "b" })).rejects.toThrow(
      "a pull request already exists"
    );
  });

  test("createPullRequest explains a missing gh binary", async () => {
    const error = new Error("spawn gh ENOENT");
    error.code = "ENOENT";
    mockGh(() => error);

    await expect(createPullRequest({ title: "t", body: "b" })).rejects.toThrow(
      /not installed/
    );
    expect(await isGhAvailable()).toBe(false);
  });

  test("findExistingPr only reports open pull requests", async () => {
    mockGh(() => JSON.stringify({ url: "u", state: "OPEN", number: 3 }));
    expect(await findExistingPr()).toMatchObject({ number: 3 });

    mockGh(() => JSON.stringify({ url: "u", state: "MERGED", number: 3 }));
    expect(await findExistingPr()).toBeNull();

    mockGh(() => new Error("no pull requests found"));
    expect(await findExistingPr()).toBeNull();
  });
});

describe("pull request list helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("summarizeChecks counts check runs and commit statuses", () => {
    const summary = summarizeChecks([
      {
        __typename: "CheckRun",
        name: "lint",
        status: "COMPLETED",
        conclusion: "SUCCESS",
      },
      {
        __typename: "CheckRun",
        name: "skip",
        status: "COMPLETED",
        conclusion: "SKIPPED",
      },
      {
        __typename: "CheckRun",
        name: "test (24)",
        status: "COMPLETED",
        conclusion: "FAILURE",
      },
      {
        __typename: "CheckRun",
        name: "test (22)",
        status: "COMPLETED",
        conclusion: "CANCELLED",
      },
      {
        __typename: "CheckRun",
        name: "build",
        status: "IN_PROGRESS",
        conclusion: "",
      },
      { __typename: "StatusContext", context: "deploy", state: "PENDING" },
      { __typename: "StatusContext", context: "cla", state: "ERROR" },
    ]);

    expect(summary).toEqual({
      passed: 2,
      failed: 3,
      pending: 2,
      total: 7,
      failing: ["test (24)", "test (22)", "cla"],
      state: "failed",
    });
  });

  test("summarizeChecks overall state", () => {
    const run = (status, conclusion) => ({
      __typename: "CheckRun",
      status,
      conclusion,
    });

    expect(summarizeChecks([]).state).toBe("none");
    expect(summarizeChecks(null).state).toBe("none");
    expect(summarizeChecks([run("COMPLETED", "SUCCESS")]).state).toBe("passed");
    expect(
      summarizeChecks([run("COMPLETED", "SUCCESS"), run("QUEUED", "")]).state
    ).toBe("pending");
  });

  test("listPullRequests parses gh's JSON and explains failures", async () => {
    mockGh(() => JSON.stringify([{ number: 1 }]));
    expect(await listPullRequests()).toEqual([{ number: 1 }]);
    expect(childProcess.execFile.mock.calls[0][1].slice(0, 3)).toEqual([
      "pr",
      "list",
      "--json",
    ]);

    const error = new Error("Command failed");
    error.stderr = "no git remotes found\n";
    mockGh(() => error);
    await expect(listPullRequests()).rejects.toThrow("no git remotes found");
  });

  test("mergePullRequest maps the method to a gh flag", async () => {
    mockGh(() => "");

    await mergePullRequest(7, "squash", { deleteBranch: true });
    await mergePullRequest(8, "rebase");
    await checkoutPullRequest(9);

    expect(childProcess.execFile.mock.calls.map((c) => c[1])).toEqual([
      ["pr", "merge", "7", "--squash", "--delete-branch"],
      ["pr", "merge", "8", "--rebase"],
      ["pr", "checkout", "9"],
    ]);
  });

  test("mergePullRequest rejects unknown methods without calling gh", async () => {
    await expect(mergePullRequest(7, "--admin")).rejects.toThrow(
      /Unknown merge method/
    );
    expect(childProcess.execFile).not.toHaveBeenCalled();
  });
});
