#!/usr/bin/env node

const { Command } = require("commander");
const { getGitStatus } = require("./helpers/git");
const { version } = require("../package.json");
const { s } = require("./ui/common");
const {
  getConfig,
  getConfigPath,
  getRawConfig,
  setConfigValue,
  unsetConfigValue,
  resetConfig,
  isValidConfigKey,
  maskSecret,
} = require("./helpers/config");

// Lazy load app functions
const app = () => require("./ui/app");

const program = new Command();

async function checkGitRepo() {
  try {
    await getGitStatus();
    return true;
  } catch {
    console.log(s.error("\n  ⚠️  This folder is not a Git repository!\n"));
    console.log(s.muted("  Solution: Run git init command\n"));
    return false;
  }
}

program
  .name("eckra")
  .description("AI-powered Git management CLI")
  .version(version, "-v, --version");

program
  .command("easy")
  .alias("e")
  .description("Full workflow: Stage all, AI commit, and Push")
  .action(async () => {
    if (await checkGitRepo()) {
      await app().easyWorkflow();
    }
  });

program
  .command("start")
  .alias("s")
  .description("Start interactive interface")
  .action(async () => {
    if (await checkGitRepo()) {
      await app().startApp();
    }
  });

program
  .command("status")
  .alias("st")
  .description("Show Git status")
  .action(async () => {
    if (await checkGitRepo()) {
      await app().quickStatus();
    }
  });

program
  .command("commit")
  .alias("c")
  .description("Generate an AI commit message and commit (aicommits-style)")
  .option("-m, --message <message>", "Commit with this message (skips AI)")
  .option("-a, --all", "Stage all changes before generating")
  .option("-y, --yes", "Skip the confirmation prompt")
  .option(
    "-g, --generate <count>",
    "Generate N messages to pick from (default 1)"
  )
  .option("--instruction <text>", "Optional instruction for the AI")
  .option("--no-commit", "Only generate and show the message, do not commit")
  .action(async (options) => {
    if (await checkGitRepo()) {
      await app().quickCommit(options.message, {
        all: options.all,
        yes: options.yes,
        generate: options.generate,
        instruction: options.instruction,
        noCommit: options.commit === false,
      });
    }
  });

program
  .command("push")
  .alias("p")
  .description("Push operation")
  .action(async () => {
    if (await checkGitRepo()) {
      await app().quickPush();
    }
  });

program
  .command("story")
  .alias("t")
  .description("AI-generated project story from commit history")
  .option("-n, --count <number>", "Number of commits to analyze (default: 50)")
  .action(async (options) => {
    if (await checkGitRepo()) {
      await app().quickTimeline(options.count);
    }
  });

// ─── eckra config ───────────────────────────────────────────────
// Non-interactive config view/edit. Works outside git repos.

const SECRET_KEY_RE = /key|token|secret/i;

function maskForDisplay(key, value, showSecrets) {
  if (value == null || value === "") return "(not set)";
  if (showSecrets) return value;
  if (SECRET_KEY_RE.test(key)) return maskSecret(value);
  return value;
}

function configUsage() {
  console.log(
    s.muted(
      "Usage: eckra config <list|get|set|unset|reset|path> [key] [value] [--local] [--show-secrets]"
    )
  );
}

async function runConfigCommand(command, key, value, options) {
  const { local = false, showSecrets = false } = options || {};

  if (!command || command === "list") {
    const config = local ? getRawConfig({ local }) : getConfig();
    const out = {};
    for (const [k, v] of Object.entries(config)) {
      out[k] = maskForDisplay(k, v, showSecrets);
    }
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (command === "path") {
    console.log(getConfigPath({ local }));
    return;
  }

  if (command === "reset") {
    resetConfig({ local });
    console.log(
      s.success(
        local
          ? "  ✓ Local config (.eckrarc) removed."
          : "  ✓ Config reset to defaults: " + getConfigPath()
      )
    );
    return;
  }

  if (command === "get") {
    if (!key) {
      configUsage();
      process.exitCode = 1;
      return;
    }
    if (!isValidConfigKey(key)) {
      console.log(s.error(`  ✗ Unknown config key: "${key}"`));
      process.exitCode = 1;
      return;
    }
    const config = local ? getRawConfig({ local }) : getConfig();
    console.log(maskForDisplay(key, config[key], showSecrets));
    return;
  }

  if (command === "set") {
    if (!key || value === undefined) {
      configUsage();
      process.exitCode = 1;
      return;
    }
    try {
      setConfigValue(key, value, { local });
      console.log(
        s.success(
          `  ✓ ${key} = ${maskForDisplay(key, value, showSecrets)}  (${getConfigPath({ local })})`
        )
      );
    } catch (err) {
      console.log(s.error(`  ✗ ${err.message}`));
      process.exitCode = 1;
    }
    return;
  }

  if (command === "unset") {
    if (!key) {
      configUsage();
      process.exitCode = 1;
      return;
    }
    try {
      const removed = unsetConfigValue(key, { local });
      if (removed) {
        console.log(
          s.success(`  ✓ Removed "${key}" from ${getConfigPath({ local })}`)
        );
      } else {
        console.log(s.muted(`  ℹ "${key}" was not set.`));
      }
    } catch (err) {
      console.log(s.error(`  ✗ ${err.message}`));
      process.exitCode = 1;
    }
    return;
  }

  console.log(s.error(`  ✗ Unknown config command: "${command}"`));
  configUsage();
  process.exitCode = 1;
}

program
  .command("config")
  .alias("cfg")
  .description("View or edit eckra configuration (non-interactive)")
  .argument("[command]", "list, get, set, unset, reset, path")
  .argument("[key]", "Config key (for get/set/unset)")
  .argument("[value]", "Value (for set)")
  .option(
    "--local",
    "Operate on the local .eckrarc file instead of global config"
  )
  .option("--show-secrets", "Show full API keys when displaying config")
  .action(runConfigCommand);

// ─── eckra doctor ──────────────────────────────────────────────
// Diagnostic health check: git + config + AI provider.

const DOCTOR_STATUS_ICONS = {
  pass: "✓",
  warn: "⚠",
  fail: "✗",
  skip: "○",
  info: "•",
};

const DOCTOR_STATUS_TONE = {
  pass: s.success,
  warn: s.warning,
  fail: s.error,
  skip: s.muted,
  info: s.muted,
};

async function runDoctorCommand(options) {
  const { runDoctorCheck } = require("./helpers/doctor");
  const report = await runDoctorCheck({
    skipProvider: options.provider === false,
  });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    let lastCategory = null;
    for (const check of report.checks) {
      if (check.category !== lastCategory) {
        console.log();
        console.log(s.bold(`  ${check.category}`));
        lastCategory = check.category;
      }
      const icon = DOCTOR_STATUS_ICONS[check.status] || "•";
      const tone = DOCTOR_STATUS_TONE[check.status] || s.text;
      console.log(
        `  ${tone(icon)} ${s.text(check.label)} — ${s.muted(check.detail)}`
      );
    }
    console.log();
    console.log(
      `${s.success(`  Summary: ${report.passed} passed`)}` +
        `${report.warnings > 0 ? `, ${s.warning(`${report.warnings} warning${report.warnings === 1 ? "" : "s"}`)}` : ""}` +
        `${report.failed > 0 ? `, ${s.error(`${report.failed} failed`)}` : ""}`
    );
    console.log();
  }

  if (report.failed > 0) process.exitCode = 1;
}

program
  .command("doctor")
  .alias("dr")
  .description("Run health checks: git, config, and AI provider connection")
  .option("--json", "Output the report as JSON")
  .option("--no-provider", "Skip the live AI provider connection check")
  .action(runDoctorCommand);

// ─── eckra suggest ─────────────────────────────────────────────
// Non-interactive commit message generation (used by lazygit, scripts).

async function runSuggestCommand(options) {
  const { generateSuggestedCommit } = require("./helpers/suggest");

  try {
    const message = await generateSuggestedCommit({
      all: options.all,
      instruction: options.instruction,
    });

    if (options.output) {
      require("fs").writeFileSync(options.output, message + "\n", "utf8");
    } else {
      process.stdout.write(message + "\n");
    }
  } catch (err) {
    process.stderr.write(s.error(`  ✗ ${err.message}\n`));
    process.exitCode = 1;
  }
}

program
  .command("suggest")
  .alias("sg")
  .description(
    "Generate an AI commit message from staged changes (non-interactive)"
  )
  .option("--all", "Stage all changes before generating")
  .option("--instruction <text>", "Optional instruction for the AI")
  .option("--output <file>", "Write the message to a file instead of stdout")
  .action(runSuggestCommand);

// ─── eckra lazygit ─────────────────────────────────────────────
// Lazygit custom-command integration management.

function runLazygitCommand(action) {
  const {
    getLazygitConfigPath,
    getLazygitBlock,
    ensureLazygitCommand,
    removeLazygitCommand,
  } = require("./helpers/lazygit");

  const file = getLazygitConfigPath();

  if (!action || action === "status") {
    const fs = require("fs");
    const fileExists = fs.existsSync(file);
    let installed;
    try {
      installed =
        fileExists &&
        fs.readFileSync(file, "utf8").includes("# --- begin eckra");
    } catch {
      installed = false;
    }

    console.log(s.bold("  Lazygit integration"));
    console.log(
      s.muted("  Config file: ") +
        s.text(file) +
        (fileExists ? "" : s.warning("  (does not exist yet)"))
    );
    console.log(
      s.muted("  Status: ") +
        (installed
          ? s.success("installed (C in files view)")
          : s.warning("not installed"))
    );
    console.log();
    console.log(s.bold("  Snippet (manual install):"));
    console.log(s.text("customCommands:"));
    console.log(s.text(getLazygitBlock()));
    return;
  }

  if (action === "install") {
    try {
      const result = ensureLazygitCommand();
      if (result.changed) {
        console.log(
          s.success(`  ✓ Lazygit integration installed: ${result.path}`)
        );
        console.log(
          s.muted("  Restart lazygit. Then press C in the files view.")
        );
      } else {
        console.log(s.muted(`  ℹ Already installed: ${result.path}`));
      }
    } catch (err) {
      console.log(s.error(`  ✗ ${err.message}`));
      process.exitCode = 1;
    }
    return;
  }

  if (action === "remove") {
    try {
      const result = removeLazygitCommand();
      if (result.changed) {
        console.log(
          s.success(`  ✓ Lazygit integration removed: ${result.path}`)
        );
      } else {
        console.log(s.muted(`  ℹ Not installed: ${result.path}`));
      }
    } catch (err) {
      console.log(s.error(`  ✗ ${err.message}`));
      process.exitCode = 1;
    }
    return;
  }

  console.log(s.error(`  ✗ Unknown lazygit action: "${action}"`));
  console.log(s.muted("  Usage: eckra lazygit [status|install|remove]"));
  process.exitCode = 1;
}

program
  .command("lazygit")
  .alias("lg")
  .description("Manage the lazygit integration (AI commit via C)")
  .argument("[action]", "status, install, remove")
  .action(runLazygitCommand);

// Default - start interactive
program.action(async () => {
  if (await checkGitRepo()) {
    await app().startApp();
  }
});

program.parse(process.argv);
