const chalk = require("chalk");
const inquirer = require("inquirer");
const ora = require("ora");

const {
  getGitStatus,
  stageFiles,
  stageAll,
  createCommit,
  getStagedDiff,
  pushToRemote,
  pullFromRemote,
  getBranches,
  getCurrentBranch,
  createBranch,
  switchBranch,
  deleteBranch,
  mergeBranch,
  getCommitLog,
  getRemotes,
  stashChanges,
  popStash,
  listStashes,
  addRemote,
  undoLastCommit,
  getLastCommit,
  amendCommit,
  getUnstagedDiff,
  getFileDiff,
} = require("../helpers/git");

const {
  generateCommitSuggestions,
  checkLMStudioConnection,
} = require("../helpers/lmstudio");

const { getConfig, saveConfig } = require("../helpers/config");

// ═══════════════════════════════════════════════════════════════
// TERMINAL SIZE & UTILS
// ═══════════════════════════════════════════════════════════════

function getWidth() {
  return process.stdout.columns || 80;
}

function getHeight() {
  return process.stdout.rows || 24;
}

function line(char = "─") {
  return char.repeat(Math.min(getWidth() - 4, 60));
}

function truncate(str, len) {
  if (!str) return "";
  return str.length > len ? str.substring(0, len - 1) + "…" : str.padEnd(len);
}

// ═══════════════════════════════════════════════════════════════
// COLORS (Minimal - sadece chalk built-in)
// ═══════════════════════════════════════════════════════════════

const c = {
  title: chalk.bold.white,
  primary: chalk.cyan,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  muted: chalk.gray,
  white: chalk.white,
  dim: chalk.dim,
};

// ═══════════════════════════════════════════════════════════════
// UI COMPONENTS
// ═══════════════════════════════════════════════════════════════

function clear() {
  console.clear();
}

function header() {
  const banner = `
  ███████╗ ██████╗██╗  ██╗██████╗  █████╗ 
  ██╔════╝██╔════╝██║ ██╔╝██╔══██╗██╔══██╗
  █████╗  ██║     █████╔╝ ██████╔╝███████║
  ██╔══╝  ██║     ██╔═██╗ ██╔══██╗██╔══██║
  ███████╗╚██████╗██║  ██╗██║  ██║██║  ██║
  ╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝`;
  console.log(c.white(banner));
  console.log("");
}

async function statusBar() {
  const status = await getGitStatus();

  const branch = status.current || "master";
  const staged = status.staged.length;
  const modified = status.modified.length;
  const untracked = status.not_added.length;

  const branchStr = c.primary(branch);
  const statsStr = `${c.success("+" + staged)} ${c.warning("~" + modified)} ${c.muted("?" + untracked)}`;

  console.log("");
  console.log(`  ${branchStr}  ${c.muted("|")}  ${statsStr}`);
  console.log("");
}

function section(title) {
  console.log(c.muted("\n  " + title.toLowerCase()));
  console.log(
    c.muted("  " + "─".repeat(Math.min(title.length + 6, 20))) + "\n",
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════

async function startApp() {
  let running = true;

  while (running) {
    clear();
    header();
    await statusBar();

    const status = await getGitStatus();
    const hasChanges = status.modified.length + status.not_added.length > 0;
    const hasStaged = status.staged.length > 0;

    const choices = [
      { name: "  durum", value: "status" },
      { type: "separator", line: c.muted("  " + line()) },
      {
        name: hasChanges
          ? c.white(`  stage`) +
            c.muted(` (${status.modified.length + status.not_added.length})`)
          : c.dim("  stage"),
        value: "stage",
        disabled: !hasChanges,
      },
      {
        name:
          hasStaged || hasChanges
            ? c.white(`  commit`) +
              (hasStaged ? c.muted(` (${status.staged.length})`) : "")
            : c.dim("  commit"),
        value: "commit",
        disabled: !hasStaged && !hasChanges,
      },
      { name: "  push", value: "push" },
      { name: "  pull", value: "pull" },
      { type: "separator", line: c.muted("  " + line()) },
      { name: "  branch", value: "branch" },
      { name: "  log", value: "log" },
      { name: "  stash", value: "stash" },
      { name: "  diff", value: "diff" },
      { name: c.warning("  undo"), value: "undo" },
      { name: c.primary("  amend"), value: "amend" },
      { type: "separator", line: c.muted("  " + line()) },
      { name: c.muted("  ayarlar"), value: "settings" },
      { name: c.muted("  çıkış"), value: "exit" },
    ];

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: c.muted("›"),
        choices,
        pageSize: Math.max(getHeight() - 10, 12),
        loop: false,
      },
    ]);

    switch (action) {
      case "status":
        await viewStatus();
        break;
      case "stage":
        await viewStage();
        break;
      case "commit":
        await viewCommit();
        break;
      case "push":
        await viewPush();
        break;
      case "pull":
        await viewPull();
        break;
      case "branch":
        await viewBranch();
        break;
      case "log":
        await viewLog();
        break;
      case "stash":
        await viewStash();
        break;
      case "diff":
        await viewDiff();
        break;
      case "undo":
        await viewUndo();
        break;
      case "amend":
        await viewAmend();
        break;
      case "settings":
        await viewSettings();
        break;
      case "exit":
        running = false;
        clear();
        console.log(c.muted("\n  ×\n"));
        break;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════════

async function viewStatus() {
  clear();
  header();
  section("durum");

  const status = await getGitStatus();
  const w = Math.min(getWidth() - 12, 50);

  if (status.staged.length > 0) {
    console.log(c.success("  staged"));
    status.staged.forEach((f) =>
      console.log(c.success("  + ") + truncate(f, w)),
    );
    console.log("");
  }

  if (status.modified.length > 0) {
    console.log(c.warning("  modified"));
    status.modified.forEach((f) =>
      console.log(c.warning("  ~ ") + truncate(f, w)),
    );
    console.log("");
  }

  if (status.not_added.length > 0) {
    console.log(c.muted("  untracked"));
    status.not_added.forEach((f) =>
      console.log(c.muted("  ? ") + truncate(f, w)),
    );
    console.log("");
  }

  if (
    !status.staged.length &&
    !status.modified.length &&
    !status.not_added.length
  ) {
    console.log(c.success("  ✓ temiz\n"));
  }

  await pause();
}

// ═══════════════════════════════════════════════════════════════
// STAGE
// ═══════════════════════════════════════════════════════════════

async function viewStage() {
  clear();
  header();
  section("stage");

  const status = await getGitStatus();
  const files = [...status.modified, ...status.not_added];

  if (files.length === 0) {
    console.log(c.muted("  değişiklik yok\n"));
    await pause();
    return;
  }

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: c.muted("›"),
      choices: [
        { name: c.success("  tümü"), value: "all" },
        { name: "  seç", value: "select" },
        { name: c.muted("  geri"), value: "back" },
      ],
    },
  ]);

  if (action === "back") return;

  let staged = false;

  if (action === "all") {
    const spin = ora({ text: c.muted(" ..."), spinner: "dots" }).start();
    await stageAll();
    spin.succeed(c.success(" staged"));
    staged = true;
  } else {
    const { selected } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "selected",
        message: c.muted("›"),
        choices: files.map((f) => ({
          name:
            (status.modified.includes(f) ? c.warning("~ ") : c.muted("? ")) + f,
          value: f,
        })),
        pageSize: Math.max(getHeight() - 8, 10),
      },
    ]);

    if (selected.length > 0) {
      await stageFiles(selected);
      console.log(c.success(`\n  ✓ ${selected.length} staged`));
      staged = true;
    }
  }

  // Stage sonrası akıllı yönlendirme
  if (staged) {
    const { next } = await inquirer.prompt([
      {
        type: "list",
        name: "next",
        message: c.muted("devam?"),
        choices: [
          { name: c.success("  commit yap"), value: "commit" },
          { name: c.muted("  ana menü"), value: "menu" },
        ],
      },
    ]);

    if (next === "commit") {
      await viewCommit();
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// COMMIT
// ═══════════════════════════════════════════════════════════════

async function viewCommit() {
  clear();
  header();
  section("commit");

  let status = await getGitStatus();

  if (status.staged.length === 0) {
    const hasChanges = status.modified.length + status.not_added.length > 0;
    if (!hasChanges) {
      console.log(c.muted("  değişiklik yok\n"));
      await pause();
      return;
    }

    const { doStage } = await inquirer.prompt([
      {
        type: "confirm",
        name: "doStage",
        message: c.muted("tümünü stage et?"),
        default: true,
      },
    ]);

    if (!doStage) return;
    await stageAll();
    status = await getGitStatus();
  }

  console.log(c.muted("  staged:"));
  status.staged.forEach((f) => console.log(c.success("  + ") + f));
  console.log("");

  let message;
  const lm = await checkLMStudioConnection();

  if (lm.connected) {
    const spin = ora({ text: c.muted(" ai..."), spinner: "dots" }).start();

    try {
      const diff = await getStagedDiff();
      const suggestions = await generateCommitSuggestions(
        diff,
        status.staged,
        3,
      );
      spin.stop();

      console.log(c.muted("  öneriler:\n"));

      const { choice } = await inquirer.prompt([
        {
          type: "list",
          name: "choice",
          message: c.muted("seç"),
          choices: [
            ...suggestions.map((s, i) => ({
              name: c.white(`  ${s}`),
              value: s,
            })),
            { type: "separator", line: " " },
            { name: c.primary("  ✎ kendim yazacağım"), value: "_custom" },
            { name: c.muted("  ✗ iptal"), value: "_cancel" },
          ],
        },
      ]);

      if (choice === "_cancel") return;
      if (choice === "_custom") {
        const { custom } = await inquirer.prompt([
          {
            type: "input",
            name: "custom",
            message: c.muted("›"),
            validate: (v) => v.length > 0,
          },
        ]);
        message = custom;
      } else {
        message = choice;
      }
    } catch (err) {
      spin.fail(c.error(" ai hatası"));
      const { custom } = await inquirer.prompt([
        {
          type: "input",
          name: "custom",
          message: c.muted("›"),
          validate: (v) => v.length > 0,
        },
      ]);
      message = custom;
    }
  } else {
    console.log(c.muted("  ai bağlı değil\n"));
    const { custom } = await inquirer.prompt([
      {
        type: "input",
        name: "custom",
        message: c.muted("›"),
        validate: (v) => v.length > 0,
      },
    ]);
    message = custom;
  }

  console.log(c.muted("\n  → ") + c.white(message));

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: c.muted("commit?"),
      default: true,
    },
  ]);

  if (confirm) {
    const spin = ora({ text: c.muted(" ..."), spinner: "dots" }).start();
    try {
      const result = await createCommit(message);
      spin.succeed(c.success(` ${result.commit.substring(0, 7)}`));

      const { doPush } = await inquirer.prompt([
        {
          type: "confirm",
          name: "doPush",
          message: c.muted("push?"),
          default: false,
        },
      ]);
      if (doPush) await viewPush();
    } catch (err) {
      spin.fail(c.error(" " + err.message));
      await pause();
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// PUSH
// ═══════════════════════════════════════════════════════════════

async function viewPush() {
  const spin = ora({ text: c.muted(" push..."), spinner: "dots" }).start();

  try {
    const remotes = await getRemotes();

    if (remotes.length === 0) {
      spin.stop();
      console.log(c.warning("\n  remote yok"));

      const { add } = await inquirer.prompt([
        {
          type: "confirm",
          name: "add",
          message: c.muted("ekle?"),
          default: true,
        },
      ]);

      if (add) {
        const { url } = await inquirer.prompt([
          {
            type: "input",
            name: "url",
            message: c.muted("url:"),
            validate: (v) => v.length > 0,
          },
        ]);
        await addRemote("origin", url);
        console.log(c.success("  ✓ eklendi"));
      }
      return;
    }

    await pushToRemote();
    spin.succeed(c.success(" pushed ✓"));
    await sleep(800);
    return; // Ana menüye dön
  } catch (err) {
    spin.fail(c.error(" " + err.message));

    if (err.message.includes("no upstream")) {
      const branch = await getCurrentBranch();
      const { setUpstream } = await inquirer.prompt([
        {
          type: "confirm",
          name: "setUpstream",
          message: c.muted(`upstream ayarla?`),
          default: true,
        },
      ]);

      if (setUpstream) {
        const simpleGit = require("simple-git")();
        await simpleGit.push(["-u", "origin", branch]);
        console.log(c.success("  ✓ pushed"));
      }
    }
  }

  await pause();
}

// ═══════════════════════════════════════════════════════════════
// PULL
// ═══════════════════════════════════════════════════════════════

async function viewPull() {
  const spin = ora({ text: c.muted(" pull..."), spinner: "dots" }).start();

  try {
    const result = await pullFromRemote();
    spin.succeed(c.success(" pulled"));

    if (result.summary?.changes > 0) {
      console.log(c.muted(`  ${result.summary.changes} dosya güncellendi`));

      // Pull sonrası status göster seçeneği
      const { showStatus } = await inquirer.prompt([
        {
          type: "confirm",
          name: "showStatus",
          message: c.muted("durumu göster?"),
          default: true,
        },
      ]);

      if (showStatus) {
        await viewStatus();
        return;
      }
    }
  } catch (err) {
    spin.fail(c.error(" " + err.message));
  }

  await pause();
}

// ═══════════════════════════════════════════════════════════════
// BRANCH
// ═══════════════════════════════════════════════════════════════

async function viewBranch() {
  let inMenu = true;

  while (inMenu) {
    clear();
    header();
    section("branch");

    const branches = await getBranches();
    const current = branches.current;
    const locals = branches.all.filter((b) => !b.startsWith("remotes/"));

    locals.forEach((b) => {
      console.log(b === current ? c.success("  ● " + b) : c.muted("  ○ " + b));
    });
    console.log("");

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: c.muted("›"),
        choices: [
          { name: c.success("  yeni"), value: "new" },
          { name: "  değiştir", value: "switch" },
          { name: "  merge", value: "merge" },
          { name: c.error("  sil"), value: "delete" },
          { type: "separator", line: c.muted("  " + line()) },
          { name: c.muted("  geri"), value: "back" },
        ],
      },
    ]);

    switch (action) {
      case "new":
        const { name } = await inquirer.prompt([
          {
            type: "input",
            name: "name",
            message: c.muted("isim:"),
            validate: (v) => v.length > 0 && !v.includes(" "),
          },
        ]);
        try {
          await createBranch(name);
          console.log(c.success(`  ✓ ${name}`));
          await sleep(600);
        } catch (err) {
          console.log(c.error("  " + err.message));
          await pause();
        }
        break;

      case "switch":
        const others = locals.filter((b) => b !== current);
        if (others.length === 0) {
          console.log(c.muted("  başka branch yok"));
          await pause();
        } else {
          const { target } = await inquirer.prompt([
            {
              type: "list",
              name: "target",
              message: c.muted("›"),
              choices: others,
            },
          ]);
          try {
            await switchBranch(target);
            console.log(c.success(`  ✓ ${target}`));

            // Branch değiştirdikten sonra pull öner
            const { doPull } = await inquirer.prompt([
              {
                type: "confirm",
                name: "doPull",
                message: c.muted("pull yap?"),
                default: false,
              },
            ]);
            if (doPull) {
              await viewPull();
            }
          } catch (err) {
            console.log(c.error("  " + err.message));
            await pause();
          }
        }
        break;

      case "merge":
        const mergeable = locals.filter((b) => b !== current);
        if (mergeable.length === 0) {
          console.log(c.muted("  merge edilecek branch yok"));
          await pause();
        } else {
          const { source } = await inquirer.prompt([
            {
              type: "list",
              name: "source",
              message: c.muted("›"),
              choices: mergeable,
            },
          ]);
          try {
            await mergeBranch(source);
            console.log(c.success(`  ✓ merged`));
            await sleep(600);
          } catch (err) {
            console.log(c.error("  " + err.message));
            await pause();
          }
        }
        break;

      case "delete":
        const deletable = locals.filter((b) => b !== current);
        if (deletable.length === 0) {
          console.log(c.muted("  silinecek branch yok"));
          await pause();
        } else {
          const { toDelete } = await inquirer.prompt([
            {
              type: "list",
              name: "toDelete",
              message: c.error("sil:"),
              choices: deletable,
            },
          ]);
          const { sure } = await inquirer.prompt([
            {
              type: "confirm",
              name: "sure",
              message: c.error("emin?"),
              default: false,
            },
          ]);
          if (sure) {
            try {
              await deleteBranch(toDelete, true);
              console.log(c.success(`  ✓ silindi`));
              await sleep(600);
            } catch (err) {
              console.log(c.error("  " + err.message));
              await pause();
            }
          }
        }
        break;

      case "back":
        inMenu = false;
        break;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// LOG
// ═══════════════════════════════════════════════════════════════

async function viewLog() {
  clear();
  header();
  section("log");

  const log = await getCommitLog(Math.max(getHeight() - 10, 8));
  const w = Math.min(getWidth() - 24, 45);

  log.all.forEach((commit) => {
    const hash = c.warning(commit.hash.substring(0, 7));
    const msg = truncate(commit.message, w);
    const time = c.muted(timeAgo(new Date(commit.date)));
    console.log(`  ${hash}  ${msg}  ${time}`);
  });

  console.log("");
  await pause();
}

// ═══════════════════════════════════════════════════════════════
// STASH
// ═══════════════════════════════════════════════════════════════

async function viewStash() {
  clear();
  header();
  section("stash");

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: c.muted("›"),
      choices: [
        { name: c.success("  kaydet"), value: "save" },
        { name: "  geri yükle", value: "pop" },
        { name: "  liste", value: "list" },
        { type: "separator", line: c.muted("  " + line()) },
        { name: c.muted("  geri"), value: "back" },
      ],
    },
  ]);

  switch (action) {
    case "save":
      const { msg } = await inquirer.prompt([
        { type: "input", name: "msg", message: c.muted("mesaj:") },
      ]);
      try {
        await stashChanges(msg || null);
        console.log(c.success("  ✓ kaydedildi"));
      } catch (err) {
        console.log(c.error("  " + err.message));
      }
      await pause();
      break;

    case "pop":
      try {
        await popStash();
        console.log(c.success("  ✓ yüklendi"));
      } catch (err) {
        console.log(c.error("  " + err.message));
      }
      await pause();
      break;

    case "list":
      try {
        const stashes = await listStashes();
        if (stashes.all.length === 0) {
          console.log(c.muted("  stash yok"));
        } else {
          stashes.all.forEach((s, i) =>
            console.log(c.muted(`  ${i}: `) + s.message),
          );
        }
      } catch (err) {
        console.log(c.error("  " + err.message));
      }
      await pause();
      break;
  }
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════

async function viewSettings() {
  clear();
  header();
  section("ayarlar");

  const config = getConfig();
  const lm = await checkLMStudioConnection();

  console.log(c.muted("  url   ") + config.lmStudioUrl);
  console.log(c.muted("  model ") + config.model);
  console.log(
    c.muted("  ai    ") +
      (lm.connected ? c.success("bağlı") : c.error("bağlı değil")),
  );
  console.log("");

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: c.muted("›"),
      choices: [
        { name: "  url değiştir", value: "url" },
        { name: "  model değiştir", value: "model" },
        { name: "  test", value: "test" },
        { type: "separator", line: c.muted("  " + line()) },
        { name: c.muted("  geri"), value: "back" },
      ],
    },
  ]);

  switch (action) {
    case "url":
      const { newUrl } = await inquirer.prompt([
        {
          type: "input",
          name: "newUrl",
          message: c.muted("url:"),
          default: config.lmStudioUrl,
        },
      ]);
      saveConfig({ lmStudioUrl: newUrl });
      console.log(c.success("  ✓"));
      await pause();
      break;

    case "model":
      const { newModel } = await inquirer.prompt([
        {
          type: "input",
          name: "newModel",
          message: c.muted("model:"),
          default: config.model,
        },
      ]);
      saveConfig({ model: newModel });
      console.log(c.success("  ✓"));
      await pause();
      break;

    case "test":
      const spin = ora({ text: c.muted(" ..."), spinner: "dots" }).start();
      const result = await checkLMStudioConnection();
      if (result.connected) {
        spin.succeed(c.success(" bağlı"));
        if (result.models?.length > 0) {
          result.models.forEach((m) => console.log(c.muted("  ") + m.id));
        }
      } else {
        spin.fail(c.error(" bağlantı yok"));
      }
      await pause();
      break;
  }
}

// ═══════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════

async function pause() {
  await inquirer.prompt([{ type: "input", name: "_", message: c.dim("↵") }]);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function timeAgo(date) {
  const sec = Math.floor((Date.now() - date) / 1000);
  if (sec < 60) return "şimdi";
  if (sec < 3600) return Math.floor(sec / 60) + "dk";
  if (sec < 86400) return Math.floor(sec / 3600) + "sa";
  if (sec < 604800) return Math.floor(sec / 86400) + "g";
  return Math.floor(sec / 604800) + "h";
}

// ═══════════════════════════════════════════════════════════════
// UNDO
// ═══════════════════════════════════════════════════════════════

async function viewUndo() {
  clear();
  header();
  section("undo");

  try {
    const lastCommit = await getLastCommit();
    
    if (!lastCommit) {
      console.log(c.muted("  commit yok\n"));
      await pause();
      return;
    }

    console.log(c.muted("  son commit:"));
    console.log(c.white(`  ${lastCommit.hash.substring(0, 7)} `) + c.muted(lastCommit.message));
    console.log(c.muted(`  ${lastCommit.author_name} · ${timeAgo(new Date(lastCommit.date))}\n`));

    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: c.warning("geri al? (değişiklikler korunur)"),
        default: false,
      },
    ]);

    if (confirm) {
      const spin = ora({ text: c.muted(" ..."), spinner: "dots" }).start();
      await undoLastCommit();
      spin.succeed(c.success(" geri alındı"));
      console.log(c.muted("  değişiklikler staged olarak kaldı\n"));
      await pause();
    }
  } catch (err) {
    console.log(c.error("  " + err.message));
    await pause();
  }
}

// ═══════════════════════════════════════════════════════════════
// AMEND
// ═══════════════════════════════════════════════════════════════

async function viewAmend() {
  clear();
  header();
  section("amend");

  try {
    const lastCommit = await getLastCommit();
    
    if (!lastCommit) {
      console.log(c.muted("  commit yok\n"));
      await pause();
      return;
    }

    console.log(c.muted("  mevcut mesaj:"));
    console.log(c.white(`  "${lastCommit.message}"\n`));

    const { newMessage } = await inquirer.prompt([
      {
        type: "input",
        name: "newMessage",
        message: c.muted("yeni mesaj:"),
        default: lastCommit.message,
        validate: (v) => v.length > 0,
      },
    ]);

    if (newMessage !== lastCommit.message) {
      const spin = ora({ text: c.muted(" ..."), spinner: "dots" }).start();
      await amendCommit(newMessage);
      spin.succeed(c.success(" güncellendi"));
      await sleep(600);
    } else {
      console.log(c.muted("\n  değişiklik yok"));
      await pause();
    }
  } catch (err) {
    console.log(c.error("  " + err.message));
    await pause();
  }
}

// ═══════════════════════════════════════════════════════════════
// DIFF
// ═══════════════════════════════════════════════════════════════

function formatDiff(diff) {
  if (!diff) return c.muted("  değişiklik yok");
  
  const lines = diff.split("\n");
  let output = [];
  
  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      output.push(c.success("  " + line));
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      output.push(c.error("  " + line));
    } else if (line.startsWith("@@")) {
      output.push(c.primary("  " + line));
    } else if (line.startsWith("diff ") || line.startsWith("index ")) {
      output.push(c.muted("  " + line));
    } else {
      output.push(c.white("  " + line));
    }
  }
  
  return output.join("\n");
}

async function viewDiff() {
  clear();
  header();
  section("diff");

  const status = await getGitStatus();
  const allFiles = [...status.staged, ...status.modified, ...status.not_added];
  
  if (allFiles.length === 0) {
    console.log(c.muted("  değişiklik yok\n"));
    await pause();
    return;
  }

  const { type } = await inquirer.prompt([
    {
      type: "list",
      name: "type",
      message: c.muted("›"),
      choices: [
        { name: c.success("  staged") + c.muted(` (${status.staged.length})`), value: "staged" },
        { name: c.warning("  unstaged") + c.muted(` (${status.modified.length})`), value: "unstaged" },
        { name: "  dosya seç", value: "file" },
        { name: c.muted("  geri"), value: "back" },
      ],
    },
  ]);

  if (type === "back") return;

  let diff;
  
  if (type === "staged") {
    diff = await getStagedDiff();
  } else if (type === "unstaged") {
    diff = await getUnstagedDiff();
  } else {
    const { file } = await inquirer.prompt([
      {
        type: "list",
        name: "file",
        message: c.muted("dosya:"),
        choices: allFiles,
        pageSize: Math.max(getHeight() - 8, 10),
      },
    ]);
    const isStaged = status.staged.includes(file);
    diff = await getFileDiff(file, isStaged);
  }

  clear();
  header();
  section("diff");
  
  console.log(formatDiff(diff));
  console.log("");
  await pause();
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

async function quickStatus() {
  await viewStatus();
}

async function quickCommit(message) {
  if (message) {
    const status = await getGitStatus();
    if (status.staged.length === 0) await stageAll();
    await createCommit(message);
    console.log(c.success("\n  ✓ commit\n"));
  } else {
    await viewCommit();
  }
}

async function quickPush() {
  await viewPush();
}

module.exports = { startApp, quickStatus, quickCommit, quickPush };
