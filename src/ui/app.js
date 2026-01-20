const chalk = require("chalk");
const inquirer = require("inquirer");
const ora = require("ora");
const fs = require("fs");
const path = require("path");

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
  listTags,
  createTag,
  deleteTag,
  pushTags,
  searchCommits,
  cherryPick,
  getOtherBranchCommits,
  removeRemote,
  setRemoteUrl,
  getRepoStats,
  squashCommits,
  dropLastCommit,
  getConflictDetails,
  acceptOurs,
  acceptTheirs,
  abortMerge,
  getBlame,
  getTrackedFiles,
  listWorktrees,
  addWorktree,
  addWorktreeNewBranch,
  removeWorktree,
} = require("../helpers/git");

const {
  generateCommitSuggestions,
  checkLMStudioConnection,
} = require("../helpers/lmstudio");

const { getConfig, saveConfig } = require("../helpers/config");

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════

const s = {
  brand: chalk.hex("#00D9FF").bold,
  primary: chalk.hex("#00D9FF"),
  success: chalk.hex("#00FF88"),
  warning: chalk.hex("#FFB800"),
  error: chalk.hex("#FF4757"),
  muted: chalk.hex("#6B7280"),
  text: chalk.hex("#E5E7EB"),
  dim: chalk.hex("#4B5563"),
  white: chalk.white,
  bold: chalk.bold,
};

const icons = {
  staged: "●",
  modified: "◐",
  untracked: "○",
  branch: "",
  commit: "◆",
  push: "↑",
  pull: "↓",
  check: "✓",
  cross: "✗",
  arrow: "→",
  dot: "·",
  star: "★",
  folder: "📁",
  tag: "🏷",
};

// ═══════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════

const clear = () => console.clear();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cols = () => process.stdout.columns || 80;
const rows = () => process.stdout.rows || 24;

function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
  if (seconds < 60) return "şimdi";
  if (seconds < 3600) return Math.floor(seconds / 60) + " dk";
  if (seconds < 86400) return Math.floor(seconds / 3600) + " saat";
  if (seconds < 604800) return Math.floor(seconds / 86400) + " gün";
  return Math.floor(seconds / 604800) + " hafta";
}

function box(content, title = "") {
  const width = Math.min(cols() - 4, 70);
  const top = title
    ? s.dim("╭─") +
      s.muted(` ${title} `) +
      s.dim("─".repeat(width - title.length - 5) + "╮")
    : s.dim("╭" + "─".repeat(width - 2) + "╮");
  const bottom = s.dim("╰" + "─".repeat(width - 2) + "╯");
  const lines = content.split("\n").map((line) => {
    const padded = line.padEnd(width - 4);
    return s.dim("│") + " " + padded + " " + s.dim("│");
  });
  return [top, ...lines, bottom].join("\n");
}

// ═══════════════════════════════════════════════════════════════
// HEADER & STATUS
// ═══════════════════════════════════════════════════════════════

function header() {
  console.log();
  console.log(s.brand("  ╔═╗╔═╗╦╔═╦═╗╔═╗"));
  console.log(s.brand("  ║╣ ║  ╠╩╗╠╦╝╠═╣"));
  console.log(s.brand("  ╚═╝╚═╝╩ ╩╩╚═╩ ╩"));
  console.log();
}

async function getStatusInfo() {
  try {
    const status = await getGitStatus();
    const branch = status.current || "master";
    const staged = status.staged.length;
    const modified = status.modified.length;
    const untracked = status.not_added.length;
    const conflicts = status.conflicted.length;
    const clean = staged === 0 && modified === 0 && untracked === 0;

    return { branch, staged, modified, untracked, conflicts, clean, status };
  } catch {
    return null;
  }
}

function statusLine(info) {
  if (!info) return s.error("  ✗ git repository değil\n");

  const parts = [s.primary(`${icons.branch} ${info.branch}`)];

  if (info.conflicts > 0) {
    parts.push(s.error(`${info.conflicts} conflict`));
  } else if (info.clean) {
    parts.push(s.success("✓ clean"));
  } else {
    if (info.staged > 0) parts.push(s.success(`${icons.staged}${info.staged}`));
    if (info.modified > 0)
      parts.push(s.warning(`${icons.modified}${info.modified}`));
    if (info.untracked > 0)
      parts.push(s.muted(`${icons.untracked}${info.untracked}`));
  }

  return "  " + parts.join(s.dim(" │ ")) + "\n";
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════

async function startApp() {
  let running = true;

  while (running) {
    clear();
    header();

    const info = await getStatusInfo();
    console.log(statusLine(info));

    if (!info) {
      console.log(s.muted("  Git repository'de değilsiniz."));
      console.log(
        s.muted("  Bir git projesine gidin veya 'git init' çalıştırın.\n"),
      );
      await inquirer.prompt([
        { type: "input", name: "x", message: s.muted("Enter'a bas...") },
      ]);
      return;
    }

    // Akıllı menü - duruma göre seçenekler
    const choices = [];

    // Conflict varsa öncelik
    if (info.conflicts > 0) {
      choices.push({ name: s.error("  ⚠ Conflict Çöz"), value: "conflict" });
      choices.push({
        type: "separator",
        line: s.dim("  ─────────────────────"),
      });
    }

    // Ana işlemler
    if (info.modified > 0 || info.untracked > 0) {
      choices.push({
        name:
          `  ${s.success("+")} Stage` +
          s.muted(` (${info.modified + info.untracked} dosya)`),
        value: "stage",
      });
    }

    if (info.staged > 0 || info.modified > 0 || info.untracked > 0) {
      choices.push({
        name:
          `  ${s.primary("◆")} Commit` +
          (info.staged > 0 ? s.muted(` (${info.staged} staged)`) : ""),
        value: "commit",
      });
    }

    choices.push({ name: `  ${s.primary("↑")} Push`, value: "push" });
    choices.push({ name: `  ${s.primary("↓")} Pull`, value: "pull" });

    choices.push({ type: "separator", line: s.dim("  ─────────────────────") });

    choices.push({ name: `  ${s.text("◎")} Durum`, value: "status" });
    choices.push({ name: `  ${s.text("⎇")} Branch`, value: "branch" });
    choices.push({ name: `  ${s.text("◷")} Log`, value: "log" });
    choices.push({ name: `  ${s.text("⋯")} Daha Fazla`, value: "more" });

    choices.push({ type: "separator", line: s.dim("  ─────────────────────") });
    choices.push({ name: s.muted("  ✕ Çıkış"), value: "exit" });

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: s.muted("Ne yapmak istersin?"),
        choices,
        pageSize: 15,
        loop: false,
      },
    ]);

    switch (action) {
      case "stage":
        await doStage(info);
        break;
      case "commit":
        await doCommit(info);
        break;
      case "push":
        await doPush();
        break;
      case "pull":
        await doPull();
        break;
      case "status":
        await doStatus();
        break;
      case "branch":
        await doBranch();
        break;
      case "log":
        await doLog();
        break;
      case "more":
        await doMore();
        break;
      case "conflict":
        await doConflict();
        break;
      case "exit":
        running = false;
        break;
    }
  }

  clear();
  console.log(s.muted("\n  👋 Görüşürüz!\n"));
}

// ═══════════════════════════════════════════════════════════════
// STAGE
// ═══════════════════════════════════════════════════════════════

async function doStage(info) {
  clear();
  header();
  console.log(s.bold("  Stage\n"));

  const status = info?.status || (await getGitStatus());
  const files = [...status.modified, ...status.not_added];

  if (files.length === 0) {
    console.log(s.muted("  Değişiklik yok.\n"));
    await pause();
    return;
  }

  // Dosyaları kategorize et
  const modifiedFiles = status.modified.map((f) => ({
    name: `  ${s.warning("~")} ${f}`,
    value: f,
    short: f,
  }));

  const untrackedFiles = status.not_added.map((f) => ({
    name: `  ${s.muted("+")} ${f}`,
    value: f,
    short: f,
  }));

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("Ne yapayım?"),
      choices: [
        { name: s.success("  ✓ Tümünü Stage Et"), value: "all" },
        { name: s.text("  ◉ Dosya Seç"), value: "select" },
        { name: s.muted("  ← Geri"), value: "back" },
      ],
    },
  ]);

  if (action === "back") return;

  if (action === "all") {
    const spin = ora({ text: s.muted(" Staging..."), spinner: "dots" }).start();
    await stageAll();
    spin.succeed(s.success(" Tümü staged!"));
    await sleep(500);

    // Direkt commit'e yönlendir
    const { goCommit } = await inquirer.prompt([
      {
        type: "confirm",
        name: "goCommit",
        message: s.muted("Commit yapmak ister misin?"),
        default: true,
      },
    ]);

    if (goCommit) await doCommit();
    return;
  }

  // Dosya seç
  const { selected } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selected",
      message: s.muted("Dosyaları seç (space ile):"),
      choices: [
        ...(modifiedFiles.length > 0
          ? [{ type: "separator", line: s.muted("  Modified") }]
          : []),
        ...modifiedFiles,
        ...(untrackedFiles.length > 0
          ? [{ type: "separator", line: s.muted("  Untracked") }]
          : []),
        ...untrackedFiles,
      ],
      pageSize: rows() - 10,
    },
  ]);

  if (selected.length > 0) {
    await stageFiles(selected);
    console.log(s.success(`\n  ✓ ${selected.length} dosya staged!`));

    const { goCommit } = await inquirer.prompt([
      {
        type: "confirm",
        name: "goCommit",
        message: s.muted("Commit yapmak ister misin?"),
        default: true,
      },
    ]);

    if (goCommit) await doCommit();
  }
}

// ═══════════════════════════════════════════════════════════════
// COMMIT
// ═══════════════════════════════════════════════════════════════

async function doCommit(info) {
  clear();
  header();
  console.log(s.bold("  Commit\n"));

  let status = info?.status || (await getGitStatus());

  // Hiç değişiklik yoksa
  if (
    status.staged.length === 0 &&
    status.modified.length === 0 &&
    status.not_added.length === 0
  ) {
    console.log(s.muted("  Commit edilecek değişiklik yok.\n"));
    await pause();
    return;
  }

  // Staged yoksa önce stage et
  if (status.staged.length === 0) {
    const { doStageFirst } = await inquirer.prompt([
      {
        type: "confirm",
        name: "doStageFirst",
        message: s.warning("Staged dosya yok. Tümünü stage edeyim mi?"),
        default: true,
      },
    ]);

    if (!doStageFirst) return;
    await stageAll();
    status = await getGitStatus();
  }

  // Staged dosyaları göster
  console.log(s.muted("  Commit edilecek dosyalar:"));
  status.staged
    .slice(0, 5)
    .forEach((f) => console.log(s.success(`    + ${f}`)));
  if (status.staged.length > 5)
    console.log(s.muted(`    ... ve ${status.staged.length - 5} dosya daha`));
  console.log();

  // AI ile mesaj öner
  let message;
  const lm = await checkLMStudioConnection();

  if (lm.connected) {
    const { useAI } = await inquirer.prompt([
      {
        type: "confirm",
        name: "useAI",
        message: s.primary("AI ile commit mesajı önereyim mi?"),
        default: true,
      },
    ]);

    if (useAI) {
      const spin = ora({
        text: s.muted(" AI düşünüyor..."),
        spinner: "dots",
      }).start();

      try {
        const diff = await getStagedDiff();
        const suggestions = await generateCommitSuggestions(
          diff,
          status.staged,
          3,
        );
        spin.stop();

        console.log(s.muted("\n  AI Önerileri:\n"));

        const { selected } = await inquirer.prompt([
          {
            type: "list",
            name: "selected",
            message: s.muted("Birini seç veya kendin yaz:"),
            choices: [
              ...suggestions.map((msg, i) => ({
                name: `  ${i + 1}. ${s.text(msg)}`,
                value: msg,
              })),
              { type: "separator", line: " " },
              { name: s.primary("  ✎ Kendim yazacağım"), value: "_custom" },
              { name: s.muted("  ← İptal"), value: "_cancel" },
            ],
          },
        ]);

        if (selected === "_cancel") return;
        if (selected !== "_custom") message = selected;
      } catch (err) {
        spin.fail(s.error(" AI hatası"));
      }
    }
  }

  // Manuel mesaj
  if (!message) {
    const { custom } = await inquirer.prompt([
      {
        type: "input",
        name: "custom",
        message: s.muted("Commit mesajı:"),
        validate: (v) => v.length > 0 || "Mesaj boş olamaz",
      },
    ]);
    message = custom;
  }

  // Onay
  console.log(s.muted("\n  Mesaj: ") + s.text(message));

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: s.muted("Commit yapayım mı?"),
      default: true,
    },
  ]);

  if (!confirm) return;

  const spin = ora({
    text: s.muted(" Commit yapılıyor..."),
    spinner: "dots",
  }).start();

  try {
    const result = await createCommit(message);
    spin.succeed(s.success(` Commit: ${result.commit.substring(0, 7)}`));

    // Push öner
    const { doPushNow } = await inquirer.prompt([
      {
        type: "confirm",
        name: "doPushNow",
        message: s.muted("Push yapmak ister misin?"),
        default: false,
      },
    ]);

    if (doPushNow) await doPush();
  } catch (err) {
    spin.fail(s.error(` Hata: ${err.message}`));
    await pause();
  }
}

// ═══════════════════════════════════════════════════════════════
// PUSH
// ═══════════════════════════════════════════════════════════════

async function doPush() {
  const spin = ora({
    text: s.muted(" Push yapılıyor..."),
    spinner: "dots",
  }).start();

  try {
    await pushToRemote();
    spin.succeed(s.success(" Push başarılı!"));
    await sleep(800);
  } catch (err) {
    spin.fail(s.error(" Push hatası"));

    if (err.message.includes("no upstream")) {
      const branch = await getCurrentBranch();
      const { setUpstream } = await inquirer.prompt([
        {
          type: "confirm",
          name: "setUpstream",
          message: s.warning(`Upstream ayarlansın mı? (-u origin ${branch})`),
          default: true,
        },
      ]);

      if (setUpstream) {
        const spin2 = ora({
          text: s.muted(" Upstream ayarlanıyor..."),
          spinner: "dots",
        }).start();
        try {
          const simpleGit = require("simple-git")();
          await simpleGit.push(["-u", "origin", branch]);
          spin2.succeed(s.success(" Push başarılı!"));
        } catch (e) {
          spin2.fail(s.error(` ${e.message}`));
        }
      }
    } else {
      console.log(s.error(`\n  ${err.message}\n`));
    }
    await pause();
  }
}

// ═══════════════════════════════════════════════════════════════
// PULL
// ═══════════════════════════════════════════════════════════════

async function doPull() {
  const spin = ora({
    text: s.muted(" Pull yapılıyor..."),
    spinner: "dots",
  }).start();

  try {
    const result = await pullFromRemote();

    if (result.summary?.changes > 0) {
      spin.succeed(s.success(` ${result.summary.changes} dosya güncellendi`));
    } else {
      spin.succeed(s.success(" Zaten güncel!"));
    }
    await sleep(800);
  } catch (err) {
    spin.fail(s.error(` ${err.message}`));
    await pause();
  }
}

// ═══════════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════════

async function doStatus() {
  clear();
  header();
  console.log(s.bold("  Durum\n"));

  const status = await getGitStatus();
  const branch = status.current;

  console.log(s.primary(`  Branch: ${branch}\n`));

  if (status.staged.length > 0) {
    console.log(s.success("  Staged:"));
    status.staged.forEach((f) => console.log(s.success(`    + ${f}`)));
    console.log();
  }

  if (status.modified.length > 0) {
    console.log(s.warning("  Modified:"));
    status.modified.forEach((f) => console.log(s.warning(`    ~ ${f}`)));
    console.log();
  }

  if (status.not_added.length > 0) {
    console.log(s.muted("  Untracked:"));
    status.not_added.forEach((f) => console.log(s.muted(`    ? ${f}`)));
    console.log();
  }

  if (status.conflicted.length > 0) {
    console.log(s.error("  Conflicts:"));
    status.conflicted.forEach((f) => console.log(s.error(`    ! ${f}`)));
    console.log();
  }

  if (
    status.staged.length === 0 &&
    status.modified.length === 0 &&
    status.not_added.length === 0 &&
    status.conflicted.length === 0
  ) {
    console.log(s.success("  ✓ Çalışma dizini temiz!\n"));
  }

  await pause();
}

// ═══════════════════════════════════════════════════════════════
// BRANCH
// ═══════════════════════════════════════════════════════════════

async function doBranch() {
  let inMenu = true;

  while (inMenu) {
    clear();
    header();
    console.log(s.bold("  Branch\n"));

    const branches = await getBranches();
    const current = branches.current;
    const locals = branches.all.filter((b) => !b.startsWith("remotes/"));

    // Branch listesi
    locals.forEach((b) => {
      if (b === current) {
        console.log(s.success(`  ● ${b}`));
      } else {
        console.log(s.muted(`  ○ ${b}`));
      }
    });
    console.log();

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: s.muted("Ne yapayım?"),
        choices: [
          { name: s.success("  + Yeni Branch"), value: "new" },
          { name: s.text("  ↔ Branch Değiştir"), value: "switch" },
          { name: s.text("  ⎇ Merge"), value: "merge" },
          { name: s.error("  ✕ Branch Sil"), value: "delete" },
          { type: "separator", line: " " },
          { name: s.muted("  ← Geri"), value: "back" },
        ],
      },
    ]);

    switch (action) {
      case "new":
        const { name } = await inquirer.prompt([
          {
            type: "input",
            name: "name",
            message: s.muted("Branch adı:"),
            validate: (v) => v.length > 0 && !v.includes(" "),
          },
        ]);
        try {
          await createBranch(name);
          console.log(s.success(`\n  ✓ ${name} oluşturuldu ve geçildi!`));
          await sleep(600);
        } catch (err) {
          console.log(s.error(`\n  ✗ ${err.message}`));
          await pause();
        }
        break;

      case "switch":
        const others = locals.filter((b) => b !== current);
        if (others.length === 0) {
          console.log(s.muted("\n  Başka branch yok."));
          await pause();
        } else {
          const { target } = await inquirer.prompt([
            {
              type: "list",
              name: "target",
              message: s.muted("Hangi branch'e geçeyim?"),
              choices: others,
            },
          ]);
          try {
            await switchBranch(target);
            console.log(s.success(`\n  ✓ ${target} branch'ine geçildi!`));
            await sleep(600);
          } catch (err) {
            console.log(s.error(`\n  ✗ ${err.message}`));
            await pause();
          }
        }
        break;

      case "merge":
        const mergeable = locals.filter((b) => b !== current);
        if (mergeable.length === 0) {
          console.log(s.muted("\n  Merge edilecek branch yok."));
          await pause();
        } else {
          const { source } = await inquirer.prompt([
            {
              type: "list",
              name: "source",
              message: s.muted("Hangi branch'i merge edeyim?"),
              choices: mergeable,
            },
          ]);
          try {
            await mergeBranch(source);
            console.log(s.success(`\n  ✓ ${source} merge edildi!`));
            await sleep(600);
          } catch (err) {
            console.log(s.error(`\n  ✗ ${err.message}`));
            await pause();
          }
        }
        break;

      case "delete":
        const deletable = locals.filter((b) => b !== current);
        if (deletable.length === 0) {
          console.log(s.muted("\n  Silinecek branch yok."));
          await pause();
        } else {
          const { toDelete } = await inquirer.prompt([
            {
              type: "list",
              name: "toDelete",
              message: s.muted("Hangi branch'i sileyim?"),
              choices: deletable,
            },
          ]);
          const { confirm } = await inquirer.prompt([
            {
              type: "confirm",
              name: "confirm",
              message: s.error(`${toDelete} silinsin mi?`),
              default: false,
            },
          ]);
          if (confirm) {
            try {
              await deleteBranch(toDelete);
              console.log(s.success(`\n  ✓ ${toDelete} silindi!`));
              await sleep(600);
            } catch (err) {
              console.log(s.error(`\n  ✗ ${err.message}`));
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

async function doLog() {
  clear();
  header();
  console.log(s.bold("  Commit Geçmişi\n"));

  const log = await getCommitLog(15);

  if (log.all.length === 0) {
    console.log(s.muted("  Henüz commit yok.\n"));
    await pause();
    return;
  }

  log.all.forEach((commit) => {
    const hash = s.primary(commit.hash.substring(0, 7));
    const msg = truncate(commit.message, cols() - 30);
    const time = s.muted(timeAgo(commit.date));
    console.log(`  ${hash} ${s.text(msg)}`);
    console.log(s.muted(`         ${commit.author_name} · ${time}\n`));
  });

  await pause();
}

// ═══════════════════════════════════════════════════════════════
// MORE (Gelişmiş Özellikler)
// ═══════════════════════════════════════════════════════════════

async function doMore() {
  let inMenu = true;

  while (inMenu) {
    clear();
    header();
    console.log(s.bold("  Daha Fazla\n"));

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: s.muted("Ne yapmak istersin?"),
        choices: [
          { name: s.warning("  ↩ Undo (Son commit'i geri al)"), value: "undo" },
          {
            name: s.primary("  ✎ Amend (Commit mesajını düzelt)"),
            value: "amend",
          },
          { name: s.text("  ≋ Diff (Değişiklikleri gör)"), value: "diff" },
          { type: "separator", line: " " },
          { name: s.text("  📦 Stash"), value: "stash" },
          { name: s.text("  🏷 Tag"), value: "tag" },
          { name: s.text("  🔗 Remote"), value: "remote" },
          { type: "separator", line: " " },
          { name: s.text("  📊 İstatistikler"), value: "stats" },
          { name: s.text("  🔍 Commit Ara"), value: "search" },
          { name: s.text("  📋 Blame"), value: "blame" },
          { type: "separator", line: " " },
          { name: s.text("  ⚙ Ayarlar"), value: "settings" },
          { name: s.muted("  ← Ana Menü"), value: "back" },
        ],
        pageSize: 15,
      },
    ]);

    switch (action) {
      case "undo":
        await doUndo();
        break;
      case "amend":
        await doAmend();
        break;
      case "diff":
        await doDiff();
        break;
      case "stash":
        await doStash();
        break;
      case "tag":
        await doTag();
        break;
      case "remote":
        await doRemote();
        break;
      case "stats":
        await doStats();
        break;
      case "search":
        await doSearch();
        break;
      case "blame":
        await doBlame();
        break;
      case "settings":
        await doSettings();
        break;
      case "back":
        inMenu = false;
        break;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// UNDO
// ═══════════════════════════════════════════════════════════════

async function doUndo() {
  clear();
  header();
  console.log(s.bold("  Undo\n"));

  const lastCommit = await getLastCommit();

  if (!lastCommit) {
    console.log(s.muted("  Geri alınacak commit yok.\n"));
    await pause();
    return;
  }

  console.log(s.muted("  Son commit:"));
  console.log(
    s.text(`  ${lastCommit.hash.substring(0, 7)} - ${lastCommit.message}`),
  );
  console.log(
    s.muted(`  ${lastCommit.author_name} · ${timeAgo(lastCommit.date)}\n`),
  );

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: s.warning("Bu commit geri alınsın mı? (değişiklikler korunur)"),
      default: false,
    },
  ]);

  if (confirm) {
    const spin = ora({
      text: s.muted(" Geri alınıyor..."),
      spinner: "dots",
    }).start();
    await undoLastCommit();
    spin.succeed(
      s.success(" Commit geri alındı! Değişiklikler staged olarak kaldı."),
    );
    await pause();
  }
}

// ═══════════════════════════════════════════════════════════════
// AMEND
// ═══════════════════════════════════════════════════════════════

async function doAmend() {
  clear();
  header();
  console.log(s.bold("  Amend\n"));

  const lastCommit = await getLastCommit();

  if (!lastCommit) {
    console.log(s.muted("  Düzenlenecek commit yok.\n"));
    await pause();
    return;
  }

  console.log(s.muted("  Mevcut mesaj:"));
  console.log(s.text(`  "${lastCommit.message}"\n`));

  const { newMessage } = await inquirer.prompt([
    {
      type: "input",
      name: "newMessage",
      message: s.muted("Yeni mesaj:"),
      default: lastCommit.message,
      validate: (v) => v.length > 0,
    },
  ]);

  if (newMessage !== lastCommit.message) {
    const spin = ora({
      text: s.muted(" Güncelleniyor..."),
      spinner: "dots",
    }).start();
    await amendCommit(newMessage);
    spin.succeed(s.success(" Commit mesajı güncellendi!"));
    await sleep(600);
  }
}

// ═══════════════════════════════════════════════════════════════
// DIFF
// ═══════════════════════════════════════════════════════════════

async function doDiff() {
  clear();
  header();
  console.log(s.bold("  Diff\n"));

  const status = await getGitStatus();

  if (status.staged.length === 0 && status.modified.length === 0) {
    console.log(s.muted("  Değişiklik yok.\n"));
    await pause();
    return;
  }

  const { type } = await inquirer.prompt([
    {
      type: "list",
      name: "type",
      message: s.muted("Hangi değişiklikleri göstereyim?"),
      choices: [
        {
          name: s.success(`  Staged (${status.staged.length})`),
          value: "staged",
        },
        {
          name: s.warning(`  Unstaged (${status.modified.length})`),
          value: "unstaged",
        },
        { name: s.muted("  ← Geri"), value: "back" },
      ],
    },
  ]);

  if (type === "back") return;

  const diff =
    type === "staged" ? await getStagedDiff() : await getUnstagedDiff();

  if (!diff) {
    console.log(s.muted("\n  Diff yok.\n"));
    await pause();
    return;
  }

  clear();
  console.log();

  // Renkli diff
  diff.split("\n").forEach((line) => {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      console.log(s.success(line));
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      console.log(s.error(line));
    } else if (line.startsWith("@@")) {
      console.log(s.primary(line));
    } else {
      console.log(s.muted(line));
    }
  });

  console.log();
  await pause();
}

// ═══════════════════════════════════════════════════════════════
// STASH
// ═══════════════════════════════════════════════════════════════

async function doStash() {
  let inMenu = true;

  while (inMenu) {
    clear();
    header();
    console.log(s.bold("  Stash\n"));

    const stashes = await listStashes();

    if (stashes.all.length > 0) {
      stashes.all.slice(0, 5).forEach((st, i) => {
        console.log(s.muted(`  ${i}: `) + s.text(st.message));
      });
      console.log();
    } else {
      console.log(s.muted("  Stash yok.\n"));
    }

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: s.muted("Ne yapayım?"),
        choices: [
          { name: s.success("  + Stash Kaydet"), value: "save" },
          { name: s.primary("  ↓ Stash Uygula (pop)"), value: "pop" },
          { name: s.muted("  ← Geri"), value: "back" },
        ],
      },
    ]);

    switch (action) {
      case "save":
        const status = await getGitStatus();
        if (status.modified.length === 0 && status.not_added.length === 0) {
          console.log(s.muted("\n  Stash edilecek değişiklik yok."));
          await pause();
        } else {
          const { message } = await inquirer.prompt([
            {
              type: "input",
              name: "message",
              message: s.muted("Stash mesajı (opsiyonel):"),
            },
          ]);
          await stashChanges(message || null);
          console.log(s.success("\n  ✓ Değişiklikler stash'lendi!"));
          await sleep(600);
        }
        break;

      case "pop":
        if (stashes.all.length === 0) {
          console.log(s.muted("\n  Pop edilecek stash yok."));
          await pause();
        } else {
          try {
            await popStash();
            console.log(s.success("\n  ✓ Stash uygulandı!"));
            await sleep(600);
          } catch (err) {
            console.log(s.error(`\n  ✗ ${err.message}`));
            await pause();
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
// TAG
// ═══════════════════════════════════════════════════════════════

async function doTag() {
  clear();
  header();
  console.log(s.bold("  Tag\n"));

  const tags = await listTags();

  if (tags.all.length > 0) {
    tags.all.slice(0, 10).forEach((t) => console.log(s.primary(`  🏷 ${t}`)));
    console.log();
  } else {
    console.log(s.muted("  Tag yok.\n"));
  }

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("Ne yapayım?"),
      choices: [
        { name: s.success("  + Yeni Tag"), value: "new" },
        { name: s.primary("  ↑ Push Tags"), value: "push" },
        { name: s.error("  ✕ Tag Sil"), value: "delete" },
        { name: s.muted("  ← Geri"), value: "back" },
      ],
    },
  ]);

  if (action === "back") return;

  if (action === "new") {
    const { name } = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: s.muted("Tag adı (örn: v1.0.0):"),
        validate: (v) => v.length > 0,
      },
    ]);
    await createTag(name);
    console.log(s.success(`\n  ✓ ${name} oluşturuldu!`));
    await sleep(600);
  }

  if (action === "push") {
    const spin = ora({
      text: s.muted(" Push tags..."),
      spinner: "dots",
    }).start();
    try {
      await pushTags();
      spin.succeed(s.success(" Tags pushed!"));
    } catch (err) {
      spin.fail(s.error(` ${err.message}`));
    }
    await pause();
  }

  if (action === "delete") {
    if (tags.all.length === 0) {
      console.log(s.muted("\n  Silinecek tag yok."));
      await pause();
    } else {
      const { toDelete } = await inquirer.prompt([
        {
          type: "list",
          name: "toDelete",
          message: s.muted("Hangi tag silinsin?"),
          choices: tags.all,
        },
      ]);
      await deleteTag(toDelete);
      console.log(s.success(`\n  ✓ ${toDelete} silindi!`));
      await sleep(600);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// REMOTE
// ═══════════════════════════════════════════════════════════════

async function doRemote() {
  clear();
  header();
  console.log(s.bold("  Remote\n"));

  const remotes = await getRemotes();

  if (remotes.length > 0) {
    remotes.forEach((r) => {
      console.log(s.primary(`  ${r.name}`));
      console.log(s.muted(`    ${r.refs.fetch || "-"}\n`));
    });
  } else {
    console.log(s.muted("  Remote yok.\n"));
  }

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("Ne yapayım?"),
      choices: [
        { name: s.success("  + Remote Ekle"), value: "add" },
        { name: s.error("  ✕ Remote Sil"), value: "remove" },
        { name: s.muted("  ← Geri"), value: "back" },
      ],
    },
  ]);

  if (action === "back") return;

  if (action === "add") {
    const { name } = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: s.muted("Remote adı:"),
        default: "origin",
      },
    ]);
    const { url } = await inquirer.prompt([
      {
        type: "input",
        name: "url",
        message: s.muted("URL:"),
        validate: (v) => v.length > 0,
      },
    ]);
    await addRemote(name, url);
    console.log(s.success(`\n  ✓ ${name} eklendi!`));
    await sleep(600);
  }

  if (action === "remove" && remotes.length > 0) {
    const { toRemove } = await inquirer.prompt([
      {
        type: "list",
        name: "toRemove",
        message: s.muted("Hangi remote silinsin?"),
        choices: remotes.map((r) => r.name),
      },
    ]);
    await removeRemote(toRemove);
    console.log(s.success(`\n  ✓ ${toRemove} silindi!`));
    await sleep(600);
  }
}

// ═══════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════

async function doStats() {
  clear();
  header();
  console.log(s.bold("  İstatistikler\n"));

  const spin = ora({
    text: s.muted(" Hesaplanıyor..."),
    spinner: "dots",
  }).start();

  try {
    const stats = await getRepoStats();
    spin.stop();

    console.log(s.primary(`  ${stats.totalCommits}`) + s.text(" commit"));
    console.log(s.primary(`  ${stats.branches}`) + s.text(" branch"));
    console.log(s.primary(`  ${stats.tags}`) + s.text(" tag"));
    console.log();

    if (stats.firstCommit) {
      console.log(
        s.muted("  İlk commit: ") +
          s.text(new Date(stats.firstCommit.date).toLocaleDateString("tr-TR")),
      );
      console.log(
        s.muted("  Son commit: ") +
          s.text(new Date(stats.lastCommit.date).toLocaleDateString("tr-TR")),
      );
      console.log();
    }

    // Top contributors
    const authors = Object.entries(stats.authors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    if (authors.length > 0) {
      console.log(s.muted("  Top katkıda bulunanlar:"));
      authors.forEach(([name, count]) => {
        const bar = "█".repeat(
          Math.min(Math.round((count / stats.totalCommits) * 15), 15),
        );
        console.log(`  ${s.primary(bar)} ${name} (${count})`);
      });
    }
  } catch (err) {
    spin.fail(s.error(` ${err.message}`));
  }

  console.log();
  await pause();
}

// ═══════════════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════════════

async function doSearch() {
  clear();
  header();
  console.log(s.bold("  Commit Ara\n"));

  const { query } = await inquirer.prompt([
    {
      type: "input",
      name: "query",
      message: s.muted("Aranacak kelime:"),
      validate: (v) => v.length > 0,
    },
  ]);

  const spin = ora({ text: s.muted(" Aranıyor..."), spinner: "dots" }).start();

  try {
    const results = await searchCommits(query);
    spin.stop();

    if (results.all.length === 0) {
      console.log(s.muted("\n  Sonuç bulunamadı.\n"));
    } else {
      console.log(s.muted(`\n  ${results.all.length} sonuç:\n`));
      results.all.slice(0, 10).forEach((commit) => {
        console.log(
          `  ${s.primary(commit.hash.substring(0, 7))} ${s.text(truncate(commit.message, 50))}`,
        );
        console.log(
          s.muted(`         ${commit.author_name} · ${timeAgo(commit.date)}\n`),
        );
      });
    }
  } catch (err) {
    spin.fail(s.error(` ${err.message}`));
  }

  await pause();
}

// ═══════════════════════════════════════════════════════════════
// BLAME
// ═══════════════════════════════════════════════════════════════

async function doBlame() {
  clear();
  header();
  console.log(s.bold("  Blame\n"));

  const files = await getTrackedFiles();

  if (files.length === 0) {
    console.log(s.muted("  Tracked dosya yok.\n"));
    await pause();
    return;
  }

  const { file } = await inquirer.prompt([
    {
      type: "list",
      name: "file",
      message: s.muted("Dosya seç:"),
      choices: files.slice(0, 30),
      pageSize: 15,
    },
  ]);

  const spin = ora({
    text: s.muted(" Yükleniyor..."),
    spinner: "dots",
  }).start();

  try {
    const blame = await getBlame(file);
    spin.stop();

    clear();
    console.log(s.bold(`\n  ${file}\n`));

    blame.slice(0, rows() - 5).forEach((b, i) => {
      const lineNum = s.muted(String(i + 1).padStart(4));
      const hash = s.primary((b.hash || "").substring(0, 7));
      const author = s.muted(truncate(b.author || "", 10).padEnd(10));
      const code = truncate(b.line || "", cols() - 30);
      console.log(`${lineNum} ${hash} ${author} ${code}`);
    });
  } catch (err) {
    spin.fail(s.error(` ${err.message}`));
  }

  console.log();
  await pause();
}

// ═══════════════════════════════════════════════════════════════
// CONFLICT
// ═══════════════════════════════════════════════════════════════

async function doConflict() {
  clear();
  header();
  console.log(s.bold("  Conflict Çözücü\n"));

  const conflicts = await getConflictDetails();

  if (conflicts.length === 0) {
    console.log(s.success("  ✓ Conflict yok!\n"));
    await pause();
    return;
  }

  console.log(s.error(`  ${conflicts.length} dosyada conflict:\n`));
  conflicts.forEach((f) => console.log(s.warning(`  ⚠ ${f}`)));
  console.log();

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("Ne yapayım?"),
      choices: [
        {
          name: s.success("  Tümünü 'ours' yap (bizim versiyon)"),
          value: "ours",
        },
        {
          name: s.primary("  Tümünü 'theirs' yap (gelen versiyon)"),
          value: "theirs",
        },
        { name: s.error("  Merge iptal"), value: "abort" },
        { name: s.muted("  ← Geri"), value: "back" },
      ],
    },
  ]);

  if (action === "back") return;

  if (action === "ours") {
    for (const file of conflicts) await acceptOurs(file);
    console.log(s.success("\n  ✓ Tüm conflict'ler 'ours' olarak çözüldü!"));
    await sleep(600);
  }

  if (action === "theirs") {
    for (const file of conflicts) await acceptTheirs(file);
    console.log(s.success("\n  ✓ Tüm conflict'ler 'theirs' olarak çözüldü!"));
    await sleep(600);
  }

  if (action === "abort") {
    await abortMerge();
    console.log(s.warning("\n  Merge iptal edildi."));
    await sleep(600);
  }
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════

async function doSettings() {
  clear();
  header();
  console.log(s.bold("  Ayarlar\n"));

  const config = getConfig();
  const lm = await checkLMStudioConnection();

  console.log(s.muted("  LM Studio URL: ") + s.text(config.lmStudioUrl));
  console.log(s.muted("  Model: ") + s.text(config.model));
  console.log(
    s.muted("  AI Durumu: ") +
      (lm.connected ? s.success("Bağlı ✓") : s.error("Bağlı değil ✗")),
  );
  console.log();

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("Ne yapayım?"),
      choices: [
        { name: s.text("  URL Değiştir"), value: "url" },
        { name: s.text("  Model Değiştir"), value: "model" },
        { name: s.muted("  ← Geri"), value: "back" },
      ],
    },
  ]);

  if (action === "back") return;

  if (action === "url") {
    const { url } = await inquirer.prompt([
      {
        type: "input",
        name: "url",
        message: s.muted("Yeni URL:"),
        default: config.lmStudioUrl,
      },
    ]);
    saveConfig({ ...config, lmStudioUrl: url });
    console.log(s.success("\n  ✓ Kaydedildi!"));
    await sleep(600);
  }

  if (action === "model") {
    const { model } = await inquirer.prompt([
      {
        type: "input",
        name: "model",
        message: s.muted("Model adı:"),
        default: config.model,
      },
    ]);
    saveConfig({ ...config, model });
    console.log(s.success("\n  ✓ Kaydedildi!"));
    await sleep(600);
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER
// ═══════════════════════════════════════════════════════════════

async function pause() {
  await inquirer.prompt([
    {
      type: "input",
      name: "x",
      message: s.dim("Enter'a bas..."),
    },
  ]);
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

async function quickStatus() {
  await doStatus();
}

async function quickCommit(message) {
  if (message) {
    const status = await getGitStatus();
    if (status.staged.length === 0) await stageAll();
    await createCommit(message);
    console.log(s.success("\n  ✓ Commit yapıldı!\n"));
  } else {
    await doCommit();
  }
}

async function quickPush() {
  await doPush();
}

module.exports = { startApp, quickStatus, quickCommit, quickPush };
