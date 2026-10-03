const { getCurrentBranch, getRemotes } = require("../../helpers/git");
const { generatePullRequest } = require("../../helpers/ai");
const { copyToClipboard } = require("../../helpers/clipboard");
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
  updatePullRequest,
  listPullRequests,
  summarizeChecks,
  checkoutPullRequest,
  mergePullRequest,
  openPullRequestInBrowser,
} = require("../../helpers/pr");
const { s, pause, link, truncate, cols, timeAgo } = require("../common");
const {
  open,
  emptyState,
  confirmAction,
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

function showPreview(
  { title, body, reviewers = [], labels = [] },
  { base, branch, template, issue }
) {
  console.log(s.muted(`\n  ${branch} → ${base}`));
  if (template) console.log(s.dim(`  Template: ${template.name}`));
  if (issue) console.log(s.dim(`  Issue: #${issue.number} ${issue.title}`));
  if (reviewers.length) {
    console.log(s.dim(`  Reviewers: ${reviewers.join(", ")}`));
  }
  if (labels.length) console.log(s.dim(`  Labels: ${labels.join(", ")}`));
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

async function askReviewers(current) {
  const { reviewers } = await prompt([
    {
      type: "input",
      name: "reviewers",
      message: s.muted("Reviewers (comma-separated logins, empty for none):"),
      default: current.join(", "),
    },
  ]);
  return parseList(reviewers);
}

/**
 * Pick labels from the repository's own list; when it can't be fetched,
 * fall back to typing them.
 */
async function askLabels(current) {
  const spin = spinner("Loading labels...");
  spin.start();
  const available = await listLabels();
  spin.stop();

  if (available.length === 0) {
    const { labels } = await prompt([
      {
        type: "input",
        name: "labels",
        message: s.muted("Labels (comma-separated, empty for none):"),
        default: current.join(", "),
      },
    ]);
    return parseList(labels);
  }

  const { labels } = await prompt([
    {
      type: "checkbox",
      name: "labels",
      message: s.muted("Labels (space to select, enter to confirm):"),
      choices: available.map((name) => ({
        name,
        value: name,
        checked: current.includes(name),
      })),
      pageSize: 15,
    },
  ]);
  return labels;
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
 * and the GitHub CLI creates it. When the branch already has an open pull
 * request, its title and description can be rewritten from the current
 * commits instead.
 *
 * Options:
 * - base: target branch (default: the remote's default branch)
 * - title: use this title instead of the generated one
 * - draft: create as a draft
 * - yes: skip the review menu and the push confirmation
 * - noAi: don't call the AI; use the template / commit list as the body
 * - instruction: optional direction for the AI
 * - update: rewrite the branch's open pull request without asking
 * - reviewers / labels: comma-separated lists (or arrays) to request/apply
 */
async function doPullRequest(_info, opts = {}) {
  const {
    base: baseOpt = null,
    title: titleOpt = null,
    draft = false,
    yes = false,
    noAi = false,
    instruction = null,
    update = false,
    reviewers: reviewersOpt = null,
    labels: labelsOpt = null,
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

  const hasGh = await isGhAvailable();
  const existing = hasGh ? await findExistingPr() : null;
  if (update && !existing) {
    return stop(`No open pull request for ${branch} to update.`);
  }

  // An open pull request keeps the base it was opened against.
  const base =
    baseOpt || existing?.baseRefName || (await getDefaultBranch(REMOTE));
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

  if (existing) {
    console.log(s.muted(`  A pull request is already open for ${branch}:\n`));
    console.log(s.text(`    #${existing.number} ${existing.title}`));
    console.log("    " + s.primary(link(existing.url)) + "\n");

    if (!update) {
      // Without --update, --yes must not rewrite someone's description.
      if (yes) return;
      const { action } = await prompt([
        {
          type: "list",
          name: "action",
          message: s.muted("What would you like to do?"),
          choices: [
            menuItem("Update its title and description", "primary", "update"),
            backItem(),
          ],
          pageSize: 5,
        },
      ]);
      if (action === "back") return;
    }
  } else if (branch === base) {
    branch = await moveOffBaseBranch({ commits, base, baseRef, yes });
    if (!branch) return;
  }

  const template = await pickTemplate(findPrTemplates(await getRepoRoot()));
  if (template === undefined) return;

  // A number in the branch name only counts when it is a real open issue.
  const issue = hasGh ? await getOpenIssue(extractIssueNumber(branch)) : null;
  const context = { base, branch, template, remote, issue };

  const withIssue = (generated) => ({
    ...generated,
    body: ensureIssueReference(generated.body, issue),
  });

  const generate = async () => {
    const fallback = withIssue(
      fallbackPrContent(commits, branch, template?.content)
    );
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
        issue,
      });
      spin.stop();
      return withIssue(generated);
    } catch (err) {
      fail(spin, `AI error: ${err.message}`);
      return fallback;
    }
  };

  const content = {
    ...(await generate()),
    reviewers: parseList(reviewersOpt),
    labels: parseList(labelsOpt),
  };
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
            existing
              ? `Update pull request #${existing.number}`
              : draft
                ? "Create draft pull request"
                : "Create pull request",
            "success",
            "create"
          ),
          ...(draft || existing
            ? []
            : [menuItem("Create as draft", "primary", "draft")]),
          sep(),
          menuItem("Edit title", "text", "title"),
          menuItem("Edit body (opens your editor)", "text", "body"),
          ...(hasGh
            ? [
                menuItem(
                  existing ? "Add reviewers" : "Reviewers",
                  "text",
                  "reviewers"
                ),
                menuItem(existing ? "Add labels" : "Labels", "text", "labels"),
              ]
            : []),
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
    } else if (action === "reviewers") {
      content.reviewers = await askReviewers(content.reviewers);
    } else if (action === "labels") {
      content.labels = await askLabels(content.labels);
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

  if (existing) {
    const spinUpdate = spinner(`Updating pull request #${existing.number}...`);
    spinUpdate.start();
    try {
      const url = await updatePullRequest({
        number: existing.number,
        title: content.title,
        body: content.body,
        reviewers: content.reviewers,
        labels: content.labels,
      });
      done(spinUpdate, "Pull request updated!");
      console.log("\n  " + s.primary(link(url || existing.url)) + "\n");
    } catch (err) {
      fail(spinUpdate, `Update failed: ${err.message}`);
    }
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
      reviewers: content.reviewers,
      labels: content.labels,
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

const CHECK_TONES = {
  passed: "success",
  failed: "error",
  pending: "warning",
  none: "dim",
};

function checksLabel(checks) {
  if (checks.state === "none") return "no checks";
  if (checks.state === "failed") {
    return `${checks.failed}/${checks.total} checks failed`;
  }
  if (checks.state === "pending") {
    return `${checks.pending}/${checks.total} checks running`;
  }
  return `${checks.total} checks passed`;
}

const REVIEW_LABELS = {
  APPROVED: ["approved", "success"],
  CHANGES_REQUESTED: ["changes requested", "error"],
  REVIEW_REQUIRED: ["review required", "warning"],
};

function reviewLabel(pr) {
  const [text, tone] = REVIEW_LABELS[pr.reviewDecision] || ["no review", "dim"];
  return s[tone](text);
}

function prChoice(pr) {
  const checks = summarizeChecks(pr.statusCheckRollup);
  const mark =
    { passed: "✓", failed: "✗", pending: "●", none: "·" }[checks.state] || "·";
  const title = truncate(pr.title, Math.max(20, cols() - 40));
  return {
    name:
      `  ${s[CHECK_TONES[checks.state]](mark)} ` +
      s.primary(`#${pr.number}`) +
      ` ${s.text(title)}` +
      (pr.isDraft ? s.dim(" (draft)") : "") +
      s.dim(`  ${pr.author?.login || ""}`),
    value: pr,
    short: `#${pr.number}`,
  };
}

function updatedAgo(date) {
  const ago = timeAgo(date);
  return ago === "now" ? "just now" : `${ago} ago`;
}

function showPullRequest(pr) {
  const checks = summarizeChecks(pr.statusCheckRollup);

  open(`#${pr.number} ${pr.title}`, `${pr.headRefName} → ${pr.baseRefName}`);
  console.log(
    s.muted("  Author:   ") +
      s.text(pr.author?.login || "unknown") +
      s.dim(`  · updated ${updatedAgo(pr.updatedAt)}`)
  );
  console.log(
    s.muted("  State:    ") + s.text(pr.isDraft ? "draft" : "ready for review")
  );
  console.log(
    s.muted("  Checks:   ") + s[CHECK_TONES[checks.state]](checksLabel(checks))
  );
  checks.failing.forEach((name) =>
    console.log(s.error(`              ✗ ${name}`))
  );
  console.log(s.muted("  Review:   ") + reviewLabel(pr));
  if (pr.mergeable === "CONFLICTING") {
    console.log(s.muted("  Merge:    ") + s.error("has conflicts"));
  }
  console.log(s.muted("  Link:     ") + s.primary(link(pr.url)));
  console.log();
}

/**
 * Ask how to merge and confirm. Returns true once the pull request is
 * merged (the list is stale then), false otherwise.
 */
async function mergeFlow(pr) {
  const { method } = await prompt([
    {
      type: "list",
      name: "method",
      message: s.muted("How should it be merged?"),
      choices: [
        menuItem("Merge commit", "text", "merge"),
        menuItem("Squash and merge", "text", "squash"),
        menuItem("Rebase and merge", "text", "rebase"),
        backItem(),
      ],
      pageSize: 6,
    },
  ]);
  if (method === "back") return false;

  const checks = summarizeChecks(pr.statusCheckRollup);
  if (checks.state === "failed" || checks.state === "pending") {
    console.log(s.warning(`\n  ⚠ ${checksLabel(checks)}.`));
  }
  const ok = await confirmAction(
    `Merge #${pr.number} into ${pr.baseRefName} (${method})? This cannot be undone.`,
    { tone: "error" }
  );
  if (!ok) return false;

  const { deleteBranch } = await prompt([
    {
      type: "confirm",
      name: "deleteBranch",
      message: s.muted(`Delete the ${pr.headRefName} branch afterwards?`),
      default: false,
    },
  ]);

  const spin = spinner(`Merging #${pr.number}...`);
  spin.start();
  try {
    await mergePullRequest(pr.number, method, { deleteBranch });
    done(spin, `#${pr.number} merged into ${pr.baseRefName}`);
    await pause();
    return true;
  } catch (err) {
    fail(spin, `Merge failed: ${err.message}`);
    await pause();
    return false;
  }
}

/**
 * One pull request: status and what can be done with it. Returns true when
 * the list should be reloaded.
 */
async function pullRequestDetails(pr) {
  for (;;) {
    showPullRequest(pr);

    const { action } = await prompt([
      {
        type: "list",
        name: "action",
        message: s.muted("What would you like to do?"),
        choices: [
          menuItem("Checkout", "primary", "checkout"),
          menuItem("Merge", "warning", "merge"),
          menuItem("Open in browser", "text", "web"),
          backItem(),
        ],
        pageSize: 6,
      },
    ]);

    if (action === "back") return false;
    if (action === "merge") {
      if (await mergeFlow(pr)) return true;
      continue;
    }

    const spin = spinner(
      action === "checkout" ? `Checking out #${pr.number}...` : "Opening..."
    );
    spin.start();
    try {
      if (action === "checkout") {
        await checkoutPullRequest(pr.number);
        done(spin, `Switched to ${pr.headRefName}`);
      } else {
        await openPullRequestInBrowser(pr.number);
        done(spin, "Opened in your browser");
      }
    } catch (err) {
      fail(spin, err.message);
    }
    await pause();
  }
}

/**
 * Browse the repository's open pull requests: CI status and reviews at a
 * glance, then checkout, merge or open one.
 */
async function doPullRequestList() {
  for (;;) {
    open("Pull Requests");

    const spin = spinner("Loading pull requests...");
    spin.start();
    let prs;
    try {
      prs = await listPullRequests();
      spin.stop();
    } catch (err) {
      fail(spin, err.message);
      await pause();
      return;
    }

    if (prs.length === 0) {
      emptyState("No open pull requests.");
      await pause();
      return;
    }

    const { selected } = await prompt([
      {
        type: "list",
        name: "selected",
        message: s.muted("Open pull requests:"),
        choices: [...prs.map(prChoice), sep(), backItem("Back", null)],
        pageSize: 15,
      },
    ]);
    if (!selected) return;

    await pullRequestDetails(selected);
  }
}

/**
 * Pull request hub shown from the Branch menu.
 */
async function doPullRequestMenu() {
  for (;;) {
    open("Pull Request");

    const { action } = await prompt([
      {
        type: "list",
        name: "action",
        message: s.muted("What would you like to do?"),
        choices: [
          menuItem("Open or update for this branch", "primary", "create"),
          menuItem("Browse open pull requests", "text", "list"),
          backItem(),
        ],
        pageSize: 6,
      },
    ]);

    if (action === "back") return;
    if (action === "create") await doPullRequest();
    else await doPullRequestList();
  }
}

module.exports = { doPullRequest, doPullRequestList, doPullRequestMenu };
