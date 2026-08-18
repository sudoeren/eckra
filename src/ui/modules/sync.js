const {
  getGit,
  pushToRemote,
  pullFromRemote,
  getCurrentBranch,
} = require("../../helpers/git");
const { s, pause, sleep } = require("../common");
const { prompt, spinner, done, fail, confirmAction } = require("../screen");

async function doPush(silent = false, { yes = false } = {}) {
  const branch = await getCurrentBranch();

  if (!silent && !yes) {
    const ok = await confirmAction(`Push ${branch} to origin?`);
    if (!ok) {
      console.log(s.muted("  Push cancelled."));
      await pause();
      return;
    }
  }

  const spin = spinner("Pushing...");
  spin.start();

  try {
    await pushToRemote();
    done(spin, "Push successful!");
    if (!silent) await sleep(800);
  } catch (err) {
    if (err.message.includes("no upstream")) {
      spin.stop();
      let setUpstream = true;

      if (!silent) {
        const answer = await prompt([
          {
            type: "confirm",
            name: "setUpstream",
            message: s.warning(
              `No upstream branch. Set it? (-u origin ${branch})`
            ),
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
          if (!silent) await sleep(800);
        } catch (e) {
          fail(spin2, `Push error: ${e.message}`);
          if (!silent) await pause();
        }
      } else if (!silent) {
        await pause();
      }
    } else {
      fail(spin, `Push error: ${err.message}`);
      if (!silent) await pause();
    }
  }
}

async function doPull() {
  const ok = await confirmAction("Pull from origin?");
  if (!ok) {
    console.log(s.muted("  Pull cancelled."));
    await pause();
    return;
  }

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
