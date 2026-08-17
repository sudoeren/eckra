const { cherryPick } = require("../../helpers/git");
const { s, pause, truncate, cols } = require("../common");
const {
  open,
  rule,
  menuItem,
  backItem,
  sep,
  prompt,
  spinner,
  done,
  fail,
} = require("../screen");

/**
 * Shared commit list → details → cherry-pick flow used by the log and
 * search modules.
 *
 * Options:
 * - commits: array of simple-git commit objects
 * - title: optional screen title shown before the list
 * - backLabel: label of the Back choice
 * - onBack: called when Back is chosen (to rebuild the list, etc.)
 */
async function showCommitSelector({ commits, title, backLabel, onBack }) {
  if (title) open(title);

  const choices = commits.slice(0, 20).map((commit) => ({
    name: `  ${s.primary(commit.hash.substring(0, 7))} ${truncate(
      commit.message,
      cols() - 25
    )}`,
    value: commit,
  }));

  choices.push(sep());
  choices.push(backItem(backLabel));

  const { selected } = await prompt([
    {
      type: "list",
      name: "selected",
      message: s.muted("Select a commit for more options:"),
      choices,
      pageSize: 15,
      loop: true,
    },
  ]);

  if (selected === "back") return;

  open("Commit Details");
  console.log(s.muted("  Hash:    ") + s.primary(selected.hash));
  console.log(
    s.muted("  Author:  ") +
      s.text(selected.author_name + " <" + selected.author_email + ">")
  );
  console.log(
    s.muted("  Date:    ") + s.text(new Date(selected.date).toLocaleString())
  );
  console.log(rule("message"));
  console.log(s.white(selected.message));
  console.log();

  const { action } = await prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("Action:"),
      choices: [
        menuItem("Cherry-pick this commit", "success", "cherry"),
        backItem(backLabel),
      ],
    },
  ]);

  if (action === "cherry") {
    const spin = spinner("Cherry-picking...");
    spin.start();
    try {
      await cherryPick(selected.hash);
      done(spin, `Successfully cherry-picked ${selected.hash.substring(0, 7)}`);
    } catch (error) {
      fail(spin, `Cherry-pick failed: ${error.message}`);
      console.log(s.muted("\n  You may have conflicts to resolve."));
    }
    await pause();
  } else if (typeof onBack === "function") {
    await onBack();
  }
}

module.exports = { showCommitSelector };
