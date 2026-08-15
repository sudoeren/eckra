const { getGit, getGitStatus, pushToRemote, pullFromRemote, getCurrentBranch } = require("../../helpers/git");
const { s, pause, sleep } = require("../common");
const { prompt, spinner, done, fail } = require("../screen");

async function doPush(silent = false) {
  const spin = spinner("Pushing...");
  spin.start();

  try {
    await pushToRemote();
    done(spin, "Push successful!");
    if (!silent) await sleep(800);
  } catch (err) {
    fail(spin, "Push error");

    if (err.message.includes("no upstream")) {
      const branch = await getCurrentBranch();
      let setUpstream = true;

      if (!silent) {
        const answer = await prompt([
          {
            type: "confirm",
            name: "setUpstream",
            message: s.warning(`Set upstream? (-u origin ${branch})`),
            default: true,
          },
        ]);
        setUpstream = answer.setUpstream;
      }

      if (setUpstream) {
        const spin2 = spinner("Setting upstream...");
        spin2.start();
        try {
          await getGit().push(["-u", "origin", branch]);
          done(spin2, "Push successful!");
        } catch (e) {
          fail(spin2, e.message);
        }
      }
    } else {
      console.log(s.error(`
  ${err.message}
`));
    }
    if (!silent) await pause();
  }
}

async function doPull() {
  const spin = spinner("Pulling...");
  spin.start();

  try {
    const result = await pullFromRemote();

    if (result.summary?.changes > 0) {
      done(spin, `${result.summary.changes} files updated`);
    } else {
      done(spin, "Already up to date!");
    }
    await sleep(800);
  } catch (err) {
    fail(spin, err.message);
    await pause();
  }
}

module.exports = { doPush, doPull };
