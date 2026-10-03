const { doRelease } = require("../src/ui/modules/release");
const git = require("../src/helpers/git");
const gh = require("../src/helpers/gh");
const pr = require("../src/helpers/pr");
const release = require("../src/helpers/release");
const clipboard = require("../src/helpers/clipboard");
const screen = require("../src/ui/screen");

jest.mock("../src/helpers/git");
jest.mock("../src/helpers/gh");
jest.mock("../src/helpers/pr");
jest.mock("../src/helpers/release");
jest.mock("../src/helpers/clipboard");
jest.mock("../src/ui/markdown", () => ({
  renderMarkdown: (text) => text.split("\n"),
}));
jest.mock("../src/ui/screen", () => ({
  open: jest.fn(),
  prompt: jest.fn(),
  confirmAction: jest.fn(),
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
}));

describe("Release flow", () => {
  const commits = [{ hash: "a1", subject: "feat: x", body: "" }];
  let logSpy;

  const printed = () => logSpy.mock.calls.flat().join("\n");

  beforeEach(() => {
    jest.resetAllMocks();
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    const actualPr = jest.requireActual("../src/helpers/pr");
    const actual = jest.requireActual("../src/helpers/release");
    for (const name of ["parseRemoteUrl", "detectForge", "resolvePrRemotes"]) {
      pr[name].mockImplementation(actualPr[name]);
    }
    for (const name of [
      "parseVersion",
      "bumpVersion",
      "suggestBump",
      "compareLink",
      "buildReleaseUrl",
    ]) {
      release[name].mockImplementation(actual[name]);
    }

    git.getCurrentBranch.mockResolvedValue("master");
    git.getRemotes.mockResolvedValue([
      {
        name: "origin",
        refs: { push: "git@github.com:sudoeren/eckra.git" },
      },
    ]);
    git.getGitStatus.mockResolvedValue({ files: [] });
    pr.getBranchPushRemote.mockResolvedValue(null);
    gh.isGhAvailable.mockResolvedValue(true);

    release.buildReleaseNotes.mockResolvedValue({
      previousTag: "v1.5.7",
      commits,
      notes: "AI notes",
    });
    release.getPackageVersion.mockResolvedValue("1.5.7");
    release.hasChangelog.mockResolvedValue(true);
    release.tagExists.mockResolvedValue(false);
    release.writeChangelog.mockResolvedValue("CHANGELOG.md");
    release.bumpPackageVersion.mockResolvedValue([
      "package.json",
      "package-lock.json",
    ]);
    release.createGithubRelease.mockResolvedValue(
      "https://github.com/sudoeren/eckra/releases/tag/v1.6.0"
    );
    screen.confirmAction.mockResolvedValue(true);
    clipboard.copyToClipboard.mockResolvedValue(true);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  const notesWithLink =
    "AI notes\n\n**Full Changelog**: https://github.com/sudoeren/eckra/compare/v1.5.7...v1.6.0";

  test("suggests the version, then commits, tags, pushes and publishes", async () => {
    screen.prompt
      .mockResolvedValueOnce({ kind: "minor" })
      .mockResolvedValueOnce({ action: "publish" });

    await doRelease(null);

    const versions = screen.prompt.mock.calls[0][0][0];
    expect(versions.default).toBe("minor");
    expect(versions.choices[1].name).toContain("v1.6.0");

    expect(release.buildReleaseNotes).toHaveBeenCalledWith({
      ai: true,
      instruction: null,
    });
    expect(screen.confirmAction).toHaveBeenCalledWith(
      "Tag v1.6.0, push master to origin and publish the release?"
    );
    expect(release.writeChangelog).toHaveBeenCalledWith({
      version: "1.6.0",
      body: notesWithLink,
    });
    expect(release.bumpPackageVersion).toHaveBeenCalledWith("1.6.0");
    expect(release.commitReleaseFiles).toHaveBeenCalledWith(
      ["CHANGELOG.md", "package.json", "package-lock.json"],
      "chore(release): v1.6.0"
    );
    expect(git.createTag).toHaveBeenCalledWith("v1.6.0", "v1.6.0");
    expect(release.pushRelease).toHaveBeenCalledWith(
      "origin",
      "master",
      "v1.6.0"
    );
    expect(release.createGithubRelease).toHaveBeenCalledWith({
      tag: "v1.6.0",
      title: "v1.6.0",
      notes: notesWithLink,
      draft: false,
      prerelease: false,
    });

    const order = [
      release.commitReleaseFiles,
      git.createTag,
      release.pushRelease,
      release.createGithubRelease,
    ].map((fn) => fn.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  test("nothing happens when the confirmation is declined", async () => {
    screen.confirmAction.mockResolvedValue(false);
    screen.prompt
      .mockResolvedValueOnce({ kind: "patch" })
      .mockResolvedValueOnce({ action: "publish" });

    await doRelease(null);

    expect(release.writeChangelog).not.toHaveBeenCalled();
    expect(git.createTag).not.toHaveBeenCalled();
    expect(release.pushRelease).not.toHaveBeenCalled();
    expect(release.createGithubRelease).not.toHaveBeenCalled();
  });

  test("Cancel in the review and Back in the version picker stop early", async () => {
    screen.prompt.mockResolvedValueOnce({ kind: "back" });
    await doRelease(null);

    screen.prompt
      .mockResolvedValueOnce({ kind: "patch" })
      .mockResolvedValueOnce({ action: "back" });
    await doRelease(null);

    expect(screen.confirmAction).not.toHaveBeenCalled();
    expect(git.createTag).not.toHaveBeenCalled();
  });

  test("toggles skip the changelog and the package bump; draft is passed on", async () => {
    screen.prompt
      .mockResolvedValueOnce({ kind: "patch" })
      .mockResolvedValueOnce({ action: "changelog" })
      .mockResolvedValueOnce({ action: "package" })
      .mockResolvedValueOnce({ action: "draft" });

    await doRelease(null);

    expect(release.writeChangelog).not.toHaveBeenCalled();
    expect(release.bumpPackageVersion).not.toHaveBeenCalled();
    expect(release.commitReleaseFiles).not.toHaveBeenCalled();
    expect(git.createTag).toHaveBeenCalledWith("v1.5.8", "v1.5.8");
    expect(release.createGithubRelease).toHaveBeenCalledWith(
      expect.objectContaining({ tag: "v1.5.8", draft: true })
    );
  });

  test("edited notes and a custom version are what gets published", async () => {
    screen.prompt
      .mockResolvedValueOnce({ kind: "custom" })
      .mockResolvedValueOnce({ version: "v2.0.0" })
      .mockResolvedValueOnce({ action: "edit" })
      .mockResolvedValueOnce({ body: "Hand-written notes\n" })
      .mockResolvedValueOnce({ action: "publish" });

    await doRelease(null);

    expect(release.createGithubRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        tag: "v2.0.0",
        notes:
          "Hand-written notes\n\n**Full Changelog**: https://github.com/sudoeren/eckra/compare/v1.5.7...v2.0.0",
      })
    );
  });

  test("--yes with --bump runs without prompts", async () => {
    await doRelease(null, { yes: true, bump: "major", noAi: true });

    expect(screen.prompt).not.toHaveBeenCalled();
    expect(screen.confirmAction).not.toHaveBeenCalled();
    expect(release.buildReleaseNotes).toHaveBeenCalledWith({
      ai: false,
      instruction: null,
    });
    expect(git.createTag).toHaveBeenCalledWith("v2.0.0", "v2.0.0");
  });

  test("falls back to grouped commits when the AI fails", async () => {
    release.buildReleaseNotes
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        previousTag: "v1.5.7",
        commits,
        notes: "grouped",
      });

    await doRelease(null, { yes: true });

    expect(screen.fail).toHaveBeenCalledWith(
      expect.anything(),
      "AI error: boom"
    );
    expect(release.createGithubRelease).toHaveBeenCalledWith(
      expect.objectContaining({ notes: expect.stringContaining("grouped") })
    );
  });

  test("stops when there is nothing to release", async () => {
    release.buildReleaseNotes.mockRejectedValue(
      new Error("No commits since v1.5.7.")
    );

    await doRelease(null);

    expect(screen.fail).toHaveBeenCalledWith(
      expect.anything(),
      "No commits since v1.5.7."
    );
    expect(screen.prompt).not.toHaveBeenCalled();
  });

  test("an existing tag is never overwritten", async () => {
    release.tagExists.mockResolvedValue(true);

    await doRelease(null, { yes: true, version: "1.5.7" });

    expect(git.createTag).not.toHaveBeenCalled();
    expect(release.pushRelease).not.toHaveBeenCalled();
  });

  test("a failed push stops before the GitHub release", async () => {
    release.pushRelease.mockRejectedValue(new Error("rejected"));

    await doRelease(null, { yes: true });

    expect(git.createTag).toHaveBeenCalled();
    expect(screen.fail).toHaveBeenCalledWith(expect.anything(), "rejected");
    expect(release.createGithubRelease).not.toHaveBeenCalled();
  });

  test("without gh the tag is pushed and a release link is printed", async () => {
    gh.isGhAvailable.mockResolvedValue(false);

    await doRelease(null, { yes: true });

    expect(release.pushRelease).toHaveBeenCalled();
    expect(release.createGithubRelease).not.toHaveBeenCalled();
    expect(clipboard.copyToClipboard).toHaveBeenCalledWith(notesWithLink);
    expect(printed()).toContain(
      "https://github.com/sudoeren/eckra/releases/new?tag=v1.6.0&title=v1.6.0"
    );
  });

  test("the first release starts from the package version", async () => {
    release.buildReleaseNotes.mockResolvedValue({
      previousTag: null,
      commits: [{ hash: "a", subject: "fix: y", body: "" }],
      notes: "notes",
    });
    release.getPackageVersion.mockResolvedValue("0.3.0");

    await doRelease(null, { yes: true });

    // 0.3.0 itself was never released, so it is not bumped.
    expect(git.createTag).toHaveBeenCalledWith("v0.3.0", "v0.3.0");
    expect(release.createGithubRelease).toHaveBeenCalledWith(
      expect.objectContaining({ notes: "notes" })
    );

    screen.prompt
      .mockResolvedValueOnce({ kind: "keep" })
      .mockResolvedValueOnce({ action: "back" });
    await doRelease(null);
    const versions = screen.prompt.mock.calls[0][0][0];
    expect(versions.default).toBe("keep");
    expect(versions.choices[0].name).toContain("v0.3.0");
  });

  test("warns about uncommitted changes before publishing", async () => {
    git.getGitStatus.mockResolvedValue({ files: [{ path: "a.js" }] });

    await doRelease(null, { yes: true });

    expect(printed()).toContain(
      "1 uncommitted change(s) will not be part of v1.6.0"
    );
  });
});
