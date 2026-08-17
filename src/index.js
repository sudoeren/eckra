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
  .description("AI-powered commit")
  .option("-m, --message <message>", "Manual commit message")
  .action(async (options) => {
    if (await checkGitRepo()) {
      await app().quickCommit(options.message);
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

// Default - start interactive
program.action(async () => {
  if (await checkGitRepo()) {
    await app().startApp();
  }
});

program.parse(process.argv);
