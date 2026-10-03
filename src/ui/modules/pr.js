const { getCurrentBranch, getRemotes } = require("../../helpers/git");
const { generatePullRequest } = require("../../helpers/ai");
const { copyToClipboard } = require("../../helpers/clipboard");
const {
  findPrTemplates,
  parseRemoteUrl,
  buildCompareUrl,
  fallbackPrContent,
  suggestBranchName,
  branchExists,
  isValidBranchName,
  availableBranchName,
  moveCommitsToNewBranch,
  getRepoRoot,
  getDefaultBranch,
  resolveBaseRef,
  getPrCommits,
  getPrDiff,
  getPushState,
  pushBranch,
  isGhAvailable,
  findExistingPr,
  createPullRequest,
} = require("../../helpers/pr");
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
} = require("../screen");

const REMOTE = "origin";

/**
 * The template to fill in: the only one, the picked one, or null for none.
 * Returns undefined when the user backs out of the picker.
 */
async function pickTemplate(templates) {
  if (templates.length <= 1) return templates[0] || null;

  const { selected } = await prompt([
    {
      type: "list",
      name: "selected",
      message: s.muted("Which pull request template?"),
      choices: [
        ...templates.map((tpl) => menuItem(tpl.name, "text", tpl)),
        menuItem("No template", "muted", null),
        sep(),
        backItem(),
      ],
      pageSize: 15,
    },
  ]);
  return selected === "back" ? undefined : selected;
}

function showPreview({ title, body }, { base, branch, template }) {
  console.log(s.muted(`\n  ${branch} → ${base}`));
  if (template) console.log(s.dim(`  Template: ${template.name}`));
  console.log(s.muted("\n  Title:\n"));
  console.log(s.text("    " + title));
  console.log(s.muted("\n  Body:\n"));
  (body || "(empty)")
    .split("\n")
    .forEach((line) => console.log(s.text("    " + line)));
  console.log();
}

/**
 * The user committed straight onto the base branch and forgot to branch
 * off first. Offer to move those commits to a new branch (and put the local
 * base branch back where the remote is) so a pull request can be opened.
 * Returns the new branch name, or null when the user cancels or it fails.
 */
async function moveOffBaseBranch({ commits, base, baseRef, yes }) {
  console.log(
    s.warning(`  You committed on ${base} without creating a branch:\n`)
  );
  commits.slice(0, 5).forEach((c) => {
    console.log(s.text(`    ${c.message.split("\n")[0]}`));
  });
  if (commits.length > 5) {
    console.log(s.muted(`    … and ${commits.length - 5} more`));
  }
  console.log(
    s.muted(
      `\n  eckra can move ${commits.length === 1 ? "it" : "them"} to a new branch and put ${base} back to ${baseRef}.`
    )
  );
  console.log(s.muted("  Uncommitted changes stay as they are.\n"));

  const suggested = await availableBranchName(suggestBranchName(commits));
  let name = suggested;
  if (!yes) {
    const answer = await prompt([
      {
        type: "input",
        name: "name",
        message: s.muted("New branch name (empty to cancel):"),
        default: suggested,
        validate: async (v) => {
          const value = v.trim();
          if (!value) return true;
          if (!(await isValidBranchName(value))) return "Invalid branch name";
          if (await branchExists(value)) return `${value} already exists`;
          return true;
        },
      },
    ]);
    name = answer.name.trim();
    if (!name) return null;
  }

  const spin = spinner(`Moving commits to ${name}...`);
  spin.start();
  try {
    await moveCommitsToNewBranch(name, base, baseRef);
    done(
      spin,
      `Moved ${commits.length} commit(s) to ${name}; ${base} is back at ${baseRef}`
    );
    return name;
  } catch (err) {
    fail(spin, `Could not move the commits: ${err.message}`);
    await pause();
    return null;
  }
}

/**
 * Make sure the branch (with all its commits) is on the remote before the
 * pull request is opened. Returns false when the user declines or it fails.
 */
async function ensurePushed(branch, yes) {
  const { upstream, unpushed } = await getPushState();
  if (upstream && unpushed === 0) return true;

  if (!yes) {
    const { push } = await prompt([
      {
        type: "confirm",
        name: "push",
        message: s.warning(
          upstream
            ? `${unpushed} unpushed commit(s). Push ${branch} to ${REMOTE}?`
            : `${branch} is not on ${REMOTE} yet. Push it?`
        ),
        default: true,
      },
    ]);
    if (!push) return false;
  }

  const spin = spinner("Pushing...");
  spin.start();
  try {
    await pushBranch(branch, REMOTE);
    done(spin, "Push successful!");
    return true;
  } catch (err) {
    fail(spin, `Push error: ${err.message}`);
    return false;
  }
}

/**
 * Without the GitHub CLI the pull request can't be created from here, so
 * hand over a prefilled "compare" link instead.
 */
async function showBrowserFallback(content, { remote, base, branch }) {
  const url = buildCompareUrl(remote, base, branch, content);
  if (!url) {
    console.log(
      s.warning(
        "\n  ⚠ Install the GitHub CLI (https://cli.github.com) to open pull requests from eckra."
      )
    );
    return;
  }

  console.log(s.muted("\n  Open this link to create the pull request:\n"));
  console.log("  " + s.primary(link(url)));
  if (content.body && !url.includes("&body=")) {
    const copied = await copyToClipboard(content.body);
    console.log(
      copied
        ? s.success("\n  ✓ Body copied to clipboard (too long for the link).")
        : s.warning("\n  ⚠ Body is too long for the link; paste it manually.")
    );
  }
  console.log();
}

/**
 * Open a pull request for the current branch: AI writes the title and body
 * (filling in the repo's PR template when there is one), the user reviews,
 * and the GitHub CLI creates it.
 *
 * Options:
 * - base: target branch (default: the remote's default branch)
 * - title: use this title instead of the generated one
 * - draft: create as a draft
 * - yes: skip the review menu and the push confirmation
 * - noAi: don't call the AI; use the template / commit list as the body
 * - instruction: optional direction for the AI
 */
async function doPullRequest(_info, opts = {}) {
  const {
    base: baseOpt = null,
    title: titleOpt = null,
    draft = false,
    yes = false,
    noAi = false,
    instruction = null,
  } = opts;

  open("Pull Request");

  const stop = async (message, tone = "muted") => {
    console.log(s[tone](`  ${message}\n`));
    await pause();
  };

  const remotes = await getRemotes();
  const origin = remotes.find((r) => r.name === REMOTE);
  if (!origin) {
    return stop(`No "${REMOTE}" remote. Add one from More > Remote.`);
  }
  const remote = parseRemoteUrl(origin.refs.push || origin.refs.fetch);

  let branch = await getCurrentBranch();
  if (!branch) return stop("Detached HEAD. Switch to a branch first.");

  const base = baseOpt || (await getDefaultBranch(REMOTE));
  if (!base) {
    return stop(
      "Could not detect the base branch. Pass it with --base <branch>."
    );
  }
  const baseRef = await resolveBaseRef(base, REMOTE);
  if (!baseRef) return stop(`Base branch "${base}" not found.`, "error");

  const commits = await getPrCommits(baseRef);
  if (commits.length === 0) {
    return stop(
      branch === base
        ? `You are on ${branch}, the base branch, with nothing new to open a pull request for.`
        : `No commits on ${branch} that are not on ${base}.`
    );
  }

  const onBase = branch === base;
  if (onBase) {
    branch = await moveOffBaseBranch({ commits, base, baseRef, yes });
    if (!branch) return;
  }

  const hasGh = await isGhAvailable();
  if (hasGh && !onBase) {
    const existing = await findExistingPr();
    if (existing) {
      console.log(s.muted(`  A pull request is already open for ${branch}:\n`));
      console.log(s.text(`    #${existing.number} ${existing.title}`));
      console.log("    " + s.primary(link(existing.url)) + "\n");
      await pause();
      return;
    }
  }

  const template = await pickTemplate(findPrTemplates(await getRepoRoot()));
  if (template === undefined) return;
  const context = { base, branch, template, remote };

  const generate = async () => {
    const fallback = fallbackPrContent(commits, branch, template?.content);
    if (noAi) return fallback;

    const spin = spinner(
      template
        ? `Filling in ${template.name} with AI...`
        : "Generating AI pull request description..."
    );
    spin.start();
    try {
      const { diff, stat } = await getPrDiff(baseRef);
      const generated = await generatePullRequest({
        commits,
        diff,
        stat,
        branch,
        base,
        template: template?.content,
        instruction,
      });
      spin.stop();
      return generated;
    } catch (err) {
      fail(spin, `AI error: ${err.message}`);
      return fallback;
    }
  };

  const content = await generate();
  if (titleOpt) content.title = titleOpt;

  let asDraft = draft;
  let reviewing = !yes;
  while (reviewing) {
    showPreview(content, context);

    const { action } = await prompt([
      {
        type: "list",
        name: "action",
        message: s.muted("What would you like to do?"),
        choices: [
          menuItem(
            draft ? "Create draft pull request" : "Create pull request",
            "success",
            "create"
          ),
          ...(draft ? [] : [menuItem("Create as draft", "primary", "draft")]),
          sep(),
          menuItem("Edit title", "text", "title"),
          menuItem("Edit body (opens your editor)", "text", "body"),
          ...(noAi ? [] : [menuItem("Regenerate", "ai", "regenerate")]),
          backItem("Cancel"),
        ],
        pageSize: 12,
      },
    ]);

    if (action === "back") return;
    if (action === "create" || action === "draft") {
      asDraft = draft || action === "draft";
      reviewing = false;
    } else if (action === "title") {
      const { title } = await prompt([
        {
          type: "input",
          name: "title",
          message: s.muted("Title:"),
          default: content.title,
          validate: (v) => v.trim().length > 0 || "Title cannot be empty",
        },
      ]);
      content.title = title.trim();
    } else if (action === "body") {
      const { body } = await prompt([
        {
          type: "editor",
          name: "body",
          message: s.muted("Body:"),
          default: content.body,
          postfix: ".md",
        },
      ]);
      content.body = body.trim();
    } else if (action === "regenerate") {
      Object.assign(content, await generate());
    }
  }

  if (!content.title) {
    return stop("A pull request needs a title. Pass one with --title.");
  }
  if (yes) showPreview(content, context);

  if (!(await ensurePushed(branch, yes))) {
    await pause();
    return;
  }

  if (!hasGh) {
    await showBrowserFallback(content, context);
    await pause();
    return;
  }

  const spin = spinner("Creating pull request...");
  spin.start();
  try {
    const url = await createPullRequest({
      title: content.title,
      body: content.body,
      base,
      draft: asDraft,
    });
    done(
      spin,
      asDraft ? "Draft pull request created!" : "Pull request created!"
    );
    console.log("\n  " + s.primary(link(url)) + "\n");
  } catch (err) {
    fail(spin, `Pull request failed: ${err.message}`);
    await showBrowserFallback(content, context);
  }
  await pause();
}

module.exports = { doPullRequest };
