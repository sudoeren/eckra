const {
  getGitStatus,
  getCurrentBranch,
  getRemotes,
  createTag,
} = require("../../helpers/git");
const { copyToClipboard } = require("../../helpers/clipboard");
const { isGhAvailable } = require("../../helpers/gh");
const {
  parseRemoteUrl,
  detectForge,
  resolvePrRemotes,
  getBranchPushRemote,
} = require("../../helpers/pr");
const {
  CHANGELOG_FILE,
  buildReleaseNotes,
  parseVersion,
  bumpVersion,
  suggestBump,
  compareLink,
  writeChangelog,
  hasChangelog,
  getPackageVersion,
  bumpPackageVersion,
  commitReleaseFiles,
  tagExists,
  pushRelease,
  createGithubRelease,
  buildReleaseUrl,
} = require("../../helpers/release");
const { s, pause, link } = require("../common");
const {
  open,
  menuItem,
  backItem,
  sep,
  prompt,
  spinner,
  done,
  fail,
  confirmAction,
} = require("../screen");
const { renderMarkdown } = require("../markdown");

const BUMPS = ["patch", "minor", "major"];

/**
 * Pick the version to release. Returns null when the user backs out.
 * `first` is set for a repository without tags: its current version has
 * never been released, so releasing it as it is comes first.
 */
async function askVersion(current, suggested, prefix, first = false) {
  const { kind } = await prompt([
    {
      type: "list",
      name: "kind",
      message: s.muted(`Next version (current: ${current}):`),
      choices: [
        ...(first
          ? [
              menuItem(
                `keep   ${prefix}${current}` + s.muted("  (first release)"),
                "primary",
                "keep"
              ),
            ]
          : []),
        ...BUMPS.map((bump) =>
          menuItem(
            `${bump.padEnd(6)} ${prefix}${bumpVersion(current, bump)}` +
              (bump === suggested
                ? s.muted("  (suggested by the commits)")
                : ""),
            bump === suggested ? "primary" : "text",
            bump
          )
        ),
        menuItem("Custom version", "text", "custom"),
        backItem(),
      ],
      default: first ? "keep" : suggested,
      pageSize: 8,
    },
  ]);
  if (kind === "back") return null;
  if (kind === "keep") return current;
  if (kind !== "custom") return bumpVersion(current, kind);

  const { version } = await prompt([
    {
      type: "input",
      name: "version",
      message: s.muted("Version (e.g. 1.6.0, empty to cancel):"),
      validate: async (value) => {
        const v = value.trim().replace(/^v/i, "");
        if (!v) return true;
        if (!parseVersion(v)) return "Use a semantic version like 1.6.0";
        if (await tagExists(prefix + v)) return `${prefix}${v} already exists`;
        return true;
      },
    },
  ]);
  return version.trim().replace(/^v/i, "") || null;
}

/**
 * Publish a release from the current branch: write the notes (AI or
 * grouped commits), then on confirmation update CHANGELOG.md and the
 * package version, commit, tag, push and create the GitHub release.
 *
 * Options:
 * - version / bump: exact version, or "patch" | "minor" | "major"
 * - draft / prerelease: flags for the GitHub release
 * - changelog / bumpPackage: false to skip that step
 * - noAi: group commits by type instead of AI-written notes
 * - instruction: optional direction for the AI
 * - yes: skip the review menu and the confirmation
 */
async function doRelease(_info, opts = {}) {
  const {
    version: versionOpt = null,
    bump: bumpOpt = null,
    draft = false,
    prerelease = false,
    noAi = false,
    instruction = null,
    yes = false,
  } = opts;

  open("Release");

  const stop = async (message, tone = "muted") => {
    console.log(s[tone](`  ${message}\n`));
    await pause();
  };

  const branch = await getCurrentBranch();
  if (!branch) return stop("Detached HEAD. Switch to a branch first.");

  const remotes = await getRemotes();
  const { pushRemote } = resolvePrRemotes(
    remotes.map((r) => r.name),
    await getBranchPushRemote(branch)
  );
  if (!pushRemote) {
    return stop(
      remotes.length === 0
        ? "No remote to publish to. Add one from More > Remote."
        : `Several remotes and no "origin". Set one with: git config branch.${branch}.pushRemote <name>`
    );
  }
  const entry = remotes.find((r) => r.name === pushRemote);
  const remote = parseRemoteUrl(entry.refs.push || entry.refs.fetch);
  // gh only helps for a hosted, non-GitLab remote.
  const hasGh =
    Boolean(remote) &&
    detectForge(remote.host) !== "gitlab" &&
    (await isGhAvailable());

  // 1. What is being released
  const spin = spinner(
    noAi ? "Collecting commits..." : "Writing release notes with AI..."
  );
  spin.start();
  let previousTag;
  let commits;
  let body;
  const writeNotes = async (ai) => {
    const built = await buildReleaseNotes({ ai, instruction });
    ({ previousTag, commits } = built);
    return built.notes;
  };
  try {
    body = await writeNotes(!noAi);
    spin.stop();
  } catch (err) {
    // No commits is final; an AI failure falls back to the grouped list.
    try {
      body = await writeNotes(false);
      fail(spin, `AI error: ${err.message}`);
    } catch (plain) {
      fail(spin, plain.message);
      await pause();
      return;
    }
  }

  // 2. Which version
  const packageVersion = await getPackageVersion();
  const parsedTag = parseVersion(previousTag);
  const prefix = parsedTag ? parsedTag.prefix : "v";
  const current = parsedTag
    ? `${parsedTag.major}.${parsedTag.minor}.${parsedTag.patch}`
    : packageVersion && parseVersion(packageVersion)
      ? packageVersion
      : "0.0.0";
  const suggested = suggestBump(commits, current);

  let version = versionOpt ? String(versionOpt).replace(/^v/i, "") : null;
  if (version && !parseVersion(version)) {
    return stop(
      `"${versionOpt}" is not a semantic version like 1.6.0.`,
      "error"
    );
  }
  // Without tags, the version in package.json has not been released yet.
  const first = !parsedTag && current !== "0.0.0";
  if (!version && (bumpOpt || yes)) {
    version =
      first && !bumpOpt ? current : bumpVersion(current, bumpOpt || suggested);
  }
  if (!version) {
    version = await askVersion(current, suggested, prefix, first);
    if (!version) return;
  }

  let changelog =
    opts.changelog === false ? false : opts.changelog || (await hasChangelog());
  let bumpPackage = opts.bumpPackage !== false && Boolean(packageVersion);
  let asDraft = draft;

  // 3. Review
  const tagOf = () => prefix + version;
  const notesOf = () => {
    const compare = compareLink(remote, previousTag, tagOf());
    return compare ? `${body}\n\n**Full Changelog**: ${compare}` : body;
  };
  const show = (state) => (state ? s.success("yes") : s.muted("no"));

  let reviewing = !yes;
  while (reviewing) {
    open("Release", `${previousTag || "first release"} → ${tagOf()}`);
    console.log(s.muted("  Commits:       ") + s.text(String(commits.length)));
    console.log(
      s.muted("  Publish from:  ") + s.text(`${branch} → ${pushRemote}`)
    );
    console.log(s.muted(`  ${CHANGELOG_FILE}:  `) + show(changelog));
    if (packageVersion) {
      console.log(s.muted("  package.json:  ") + show(bumpPackage));
    }
    console.log(s.muted("\n  Notes:\n"));
    renderMarkdown(notesOf()).forEach((line) => console.log(line));
    console.log();

    const { action } = await prompt([
      {
        type: "list",
        name: "action",
        message: s.muted("What would you like to do?"),
        choices: [
          menuItem(`Publish ${tagOf()}`, "success", "publish"),
          ...(hasGh && !draft
            ? [menuItem("Publish as draft", "primary", "draft")]
            : []),
          sep(),
          menuItem("Edit notes (opens your editor)", "text", "edit"),
          ...(noAi ? [] : [menuItem("Regenerate notes", "ai", "regenerate")]),
          menuItem("Change version", "text", "version"),
          menuItem(
            `${changelog ? "Don't update" : "Update"} ${CHANGELOG_FILE}`,
            "text",
            "changelog"
          ),
          ...(packageVersion
            ? [
                menuItem(
                  bumpPackage
                    ? "Leave package.json version alone"
                    : "Set package.json version",
                  "text",
                  "package"
                ),
              ]
            : []),
          backItem("Cancel"),
        ],
        pageSize: 12,
      },
    ]);

    if (action === "back") return;
    if (action === "publish" || action === "draft") {
      asDraft = draft || action === "draft";
      reviewing = false;
    } else if (action === "edit") {
      const answer = await prompt([
        {
          type: "editor",
          name: "body",
          message: s.muted("Notes:"),
          default: body,
          postfix: ".md",
        },
      ]);
      body = answer.body.trim() || body;
    } else if (action === "regenerate") {
      const spinAgain = spinner("Writing release notes with AI...");
      spinAgain.start();
      try {
        body = await writeNotes(true);
        spinAgain.stop();
      } catch (err) {
        fail(spinAgain, `AI error: ${err.message}`);
        await pause();
      }
    } else if (action === "version") {
      version =
        (await askVersion(current, suggested, prefix, first)) || version;
    } else if (action === "changelog") {
      changelog = !changelog;
    } else if (action === "package") {
      bumpPackage = !bumpPackage;
    }
  }

  const tag = tagOf();
  if (await tagExists(tag)) {
    return stop(`Tag ${tag} already exists.`, "error");
  }

  const status = await getGitStatus();
  if (status.files.length > 0) {
    console.log(
      s.warning(
        `\n  ⚠ ${status.files.length} uncommitted change(s) will not be part of ${tag}.`
      )
    );
  }
  if (!yes) {
    const ok = await confirmAction(
      `Tag ${tag}, push ${branch} to ${pushRemote}` +
        (hasGh ? ` and publish the ${asDraft ? "draft " : ""}release?` : "?")
    );
    if (!ok) return;
  }

  // 4. Publish. Each step reports itself, so a failure shows how far it got.
  const notes = notesOf();
  let step = spinner("Preparing release files...");
  try {
    step.start();
    const files = [];
    if (changelog) files.push(await writeChangelog({ version, body: notes }));
    if (bumpPackage) files.push(...(await bumpPackageVersion(version)));
    if (files.length > 0) {
      await commitReleaseFiles(files, `chore(release): ${tag}`);
      done(step, `Committed ${files.join(", ")}`);
    } else {
      step.stop();
    }

    step = spinner(`Tagging ${tag}...`);
    step.start();
    await createTag(tag, tag);
    done(step, `Tagged ${tag}`);

    step = spinner(`Pushing to ${pushRemote}...`);
    step.start();
    await pushRelease(pushRemote, branch, tag);
    done(step, `Pushed ${branch} and ${tag} to ${pushRemote}`);
  } catch (err) {
    fail(step, err.message);
    console.log(
      s.muted(
        "\n  The steps marked ✔ above are done; nothing after the failed step was run."
      )
    );
    await pause();
    return;
  }

  if (hasGh) {
    step = spinner("Publishing the GitHub release...");
    step.start();
    try {
      const url = await createGithubRelease({
        tag,
        title: tag,
        notes,
        draft: asDraft,
        prerelease,
      });
      done(step, asDraft ? "Draft release created!" : "Release published!");
      console.log("\n  " + s.primary(link(url)) + "\n");
      await pause();
      return;
    } catch (err) {
      fail(step, `Release failed: ${err.message}`);
    }
  }

  // The tag is pushed; hand over the page where the release is finished.
  const url = buildReleaseUrl(remote, tag, tag);
  if (url) {
    const copied = await copyToClipboard(notes);
    console.log(s.muted("\n  Open this link to publish the release:\n"));
    console.log("  " + s.primary(link(url)));
    console.log(
      copied
        ? s.success("\n  ✓ Notes copied to clipboard.")
        : s.muted("\n  Paste the notes shown above into the form.")
    );
  }
  console.log();
  await pause();
}

module.exports = { doRelease };
