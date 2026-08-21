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
    console.log(s.error("\n  This folder is not a Git repository!\n"));
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
    if (!(await app().ensureOnboarding())) return;
    if (await checkGitRepo()) {
      await app().easyWorkflow();
    }
  });

program
  .command("start")
  .alias("s")
  .description("Start interactive interface")
  .action(async () => {
    if (!(await app().ensureOnboarding())) return;
    if (await checkGitRepo()) {
      await app().startApp();
    }
  });

program
  .command("status")
  .alias("st")
  .description("Show Git status")
  .action(async () => {
    if (!(await app().ensureOnboarding())) return;
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
  .option(
    "-t, --type <format>",
    "Commit message format: plain, conventional, conventional+body, gitmoji, subject+body"
  )
  .option(
    "-c, --clipboard",
    "Copy the generated message to the clipboard instead of committing"
  )
  .option(
    "-n, --no-verify",
    "Bypass pre-commit and commit-msg hooks while committing"
  )
  .option(
    "-x, --exclude <files>",
    "Files or glob patterns to exclude from AI analysis (comma-separated)"
  )
  .option(
    "--max-length <number>",
    "Preferred max character length for the commit subject (default 50)"
  )
  .option("--instruction <text>", "Optional instruction for the AI")
  .option("--no-commit", "Only generate and show the message, do not commit")
  .action(async (options) => {
    if (!(await app().ensureOnboarding())) return;
    const { COMMIT_FORMATS } = require("./helpers/ai");
    if (options.type && !COMMIT_FORMATS.includes(options.type)) {
      console.log(
        s.error(
          `  ✗ Unknown commit format: "${options.type}". Valid: ${COMMIT_FORMATS.join(", ")}`
        )
      );
      process.exitCode = 1;
      return;
    }
    if (
      options.maxLength != null &&
      (!Number.isFinite(Number(options.maxLength)) ||
        Number(options.maxLength) < 1)
    ) {
      console.log(s.error(`  ✗ Invalid --max-length: "${options.maxLength}"`));
      process.exitCode = 1;
      return;
    }
    if (await checkGitRepo()) {
      await app().quickCommit(options.message, {
        all: options.all,
        yes: options.yes,
        generate: options.generate,
        instruction: options.instruction,
        noCommit: options.commit === false,
        type: options.type,
        clipboard: options.clipboard,
        noVerify: options.noVerify,
        exclude: options.exclude,
        maxLength: options.maxLength,
      });
    }
  });

program
  .command("push")
  .alias("p")
  .description("Push operation")
  .option("-y, --yes", "Skip the confirmation prompt")
  .action(async (options) => {
    if (!(await app().ensureOnboarding())) return;
    if (await checkGitRepo()) {
      await app().quickPush(options.yes);
    }
  });

program
  .command("story")
  .alias("t")
  .description("AI-generated project story from commit history")
  .option("-n, --count <number>", "Number of commits to analyze (default: 50)")
  .action(async (options) => {
    if (!(await app().ensureOnboarding())) return;
    if (await checkGitRepo()) {
      await app().quickTimeline(options.count);
    }
  });

program
  .command("graph")
  .alias("g")
  .description("Show the interactive commit graph across all branches")
  .action(async () => {
    if (!(await app().ensureOnboarding())) return;
    if (await checkGitRepo()) {
      await app().quickGraph();
    }
  });

program
  .command("setup")
  .description("Run the setup/onboarding wizard")
  .action(async () => {
    await require("./ui/modules/onboarding").doOnboarding();
  });

program
  .command("model")
  .alias("m")
  .description(
    "Show current AI settings and change the model/provider/connection"
  )
  .action(async () => {
    if (!(await app().ensureOnboarding())) return;
    await require("./ui/modules/settings").doModelSelector();
  });

// ─── eckra config ───────────────────────────────────────────────
// Non-interactive config view/edit. Works outside git repos.

const SECRET_KEY_RE = /api[_-]?key|token|secret/i;

function maskForDisplay(key, value, showSecrets) {
  if (value == null || value === "") return "(not set)";
  if (showSecrets) return value;
  if (SECRET_KEY_RE.test(key)) return maskSecret(value);
  return value;
}

function configUsage() {
  console.log(
    s.muted(
      "Usage: eckra config <list|get|set|unset|reset|path> [key... | key=value...] [--local] [--show-secrets]"
    )
  );
}

async function runConfigCommand(command, args, options) {
  const { local = false, showSecrets = false } = options || {};
  const keys = Array.isArray(args) ? args : [];

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
    if (keys.length === 0) {
      configUsage();
      process.exitCode = 1;
      return;
    }
    const config = local ? getRawConfig({ local }) : getConfig();
    let failed = false;
    for (const key of keys) {
      if (!isValidConfigKey(key)) {
        console.log(s.error(`  ✗ Unknown config key: "${key}"`));
        failed = true;
        continue;
      }
      console.log(maskForDisplay(key, config[key], showSecrets));
    }
    if (failed) process.exitCode = 1;
    return;
  }

  if (command === "set") {
    if (keys.length === 0) {
      configUsage();
      process.exitCode = 1;
      return;
    }

    // Support both `set key=value key2=value2` and the legacy `set key value`.
    let pairs;
    if (keys.every((k) => k.includes("="))) {
      pairs = keys.map((pair) => {
        const idx = pair.indexOf("=");
        return [pair.slice(0, idx), pair.slice(idx + 1)];
      });
    } else if (keys.length === 2) {
      pairs = [[keys[0], keys[1]]];
    } else {
      console.log(s.error('  ✗ Use "key=value" pairs or "set <key> <value>".'));
      process.exitCode = 1;
      return;
    }

    let failed = false;
    for (const [key, value] of pairs) {
      try {
        setConfigValue(key, value, { local });
        console.log(
          s.success(
            `  ✓ ${key} = ${maskForDisplay(key, value, showSecrets)}  (${getConfigPath({ local })})`
          )
        );
        if (key === "lazygitKey") {
          const { getLazygitKeyConflictWarning } = require("./helpers/lazygit");
          const conflict = getLazygitKeyConflictWarning(value);
          if (conflict) {
            console.log(s.warning(`  ${conflict}`));
            console.log(
              s.muted(
                "  Run 'eckra lazygit install' to re-apply the key to lazygit's config."
              )
            );
          }
        }
      } catch (err) {
        console.log(s.error(`  ✗ ${err.message}`));
        failed = true;
      }
    }
    if (failed) process.exitCode = 1;
    return;
  }

  if (command === "unset") {
    if (keys.length === 0) {
      configUsage();
      process.exitCode = 1;
      return;
    }
    for (const key of keys) {
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
  .argument("[args...]", "Config key(s) or key=value pair(s)")
  .option(
    "--local",
    "Operate on the local .eckrarc file instead of global config"
  )
  .option("--show-secrets", "Show full API keys when displaying config")
  .action(runConfigCommand);

// ─── eckra provider ────────────────────────────────────────────
// Manage saved AI provider connections: multiple providers and multiple
// accounts per provider, stored side by side in the global config.

function describeConnection(conn) {
  const parts = [conn.provider];
  const secretKey = Object.keys(conn).find((k) => SECRET_KEY_RE.test(k));
  if (secretKey && conn[secretKey]) parts.push(maskSecret(conn[secretKey]));
  const modelKey = Object.keys(conn).find((k) => /model$/i.test(k));
  if (modelKey && conn[modelKey]) parts.push(String(conn[modelKey]));
  return parts.join(" · ");
}

function providerUsage() {
  console.log(
    s.muted(
      "Usage: eckra provider <list|use|add|remove|rename|show> [name...] [--local] [--show-secrets]"
    )
  );
}

async function runProviderCommand(action, args, options) {
  const {
    listAIConnections,
    getAIConnection,
    saveAIConnection,
    deleteAIConnection,
    renameAIConnection,
    setActiveAIConnection,
    AI_PROVIDERS,
  } = require("./helpers/config");
  const names = Array.isArray(args) ? args : [];
  const { showSecrets = false } = options || {};

  if (!action || action === "list") {
    const connections = listAIConnections();
    if (connections.length === 0) {
      console.log(s.muted("  No saved provider connections yet."));
      console.log(s.muted("  Add one with: eckra provider add"));
      return;
    }
    const activeName = getConfig().activeAiConnection || "";
    console.log(s.bold("  Saved provider connections"));
    console.log();
    for (const conn of connections) {
      const marker = conn.name === activeName ? s.success("✓") : s.muted(" ");
      console.log(
        `  ${marker} ${s.text(conn.name)} ${s.muted(describeConnection(conn))}`
      );
    }
    console.log();
    console.log(
      s.muted(
        "  Active connection is marked with ✓. Switch: eckra provider use <name>"
      )
    );
    return;
  }

  if (action === "use") {
    if (options.none) {
      setActiveAIConnection("", { local: options.local });
      console.log(s.success("  ✓ Active connection cleared."));
      return;
    }
    const name = names[0];
    if (!name) {
      providerUsage();
      process.exitCode = 1;
      return;
    }
    try {
      setActiveAIConnection(name, { local: options.local });
      console.log(
        s.success(
          `  ✓ Switched to "${name}"${options.local ? " (pinned to this repo via .eckrarc)" : ""}`
        )
      );
    } catch (err) {
      console.log(s.error(`  ✗ ${err.message}`));
      process.exitCode = 1;
    }
    return;
  }

  if (action === "show") {
    const name = names[0];
    if (!name) {
      providerUsage();
      process.exitCode = 1;
      return;
    }
    const conn = getAIConnection(name);
    if (!conn) {
      console.log(s.error(`  ✗ No saved connection named "${name}"`));
      process.exitCode = 1;
      return;
    }
    const activeName = getConfig().activeAiConnection || "";
    console.log(
      s.bold(`  ${conn.name}`) +
        (conn.name === activeName ? s.success("  (active)") : "")
    );
    for (const [key, value] of Object.entries(conn)) {
      if (key === "name") continue;
      console.log(
        `  ${s.muted(key + ":")} ${s.text(maskForDisplay(key, value, showSecrets))}`
      );
    }
    return;
  }

  if (action === "add") {
    // Non-interactive when --provider/--set are supplied.
    if (options.set || (options.provider && options.name)) {
      const provider = options.provider;
      if (!provider || !AI_PROVIDERS.includes(provider)) {
        console.log(
          s.error(
            `  ✗ Unknown or missing --provider. Valid: ${AI_PROVIDERS.join(", ")}`
          )
        );
        process.exitCode = 1;
        return;
      }
      if (!options.name) {
        console.log(s.error("  ✗ --name is required for non-interactive add."));
        process.exitCode = 1;
        return;
      }
      const fields = {};
      let failed = false;
      for (const pair of options.set || []) {
        const idx = pair.indexOf("=");
        if (idx <= 0) {
          console.log(
            s.error(`  ✗ Invalid --set pair: "${pair}" (expected key=value)`)
          );
          failed = true;
          continue;
        }
        fields[pair.slice(0, idx)] = pair.slice(idx + 1);
      }
      if (failed) {
        process.exitCode = 1;
        return;
      }
      try {
        saveAIConnection(
          options.name,
          { provider, ...fields },
          { activate: Boolean(options.use) }
        );
        console.log(
          s.success(
            `  ✓ Saved connection "${options.name}" (${provider})${options.use ? " — now active" : ""}`
          )
        );
      } catch (err) {
        console.log(s.error(`  ✗ ${err.message}`));
        process.exitCode = 1;
      }
      return;
    }

    await require("./ui/modules/settings").addAIConnectionFlow({
      name: options.name,
      provider: options.provider,
    });
    return;
  }

  if (action === "remove") {
    const name = names[0];
    if (!name) {
      providerUsage();
      process.exitCode = 1;
      return;
    }
    if (!getAIConnection(name)) {
      console.log(s.error(`  ✗ No saved connection named "${name}"`));
      process.exitCode = 1;
      return;
    }
    if (!options.yes) {
      const { prompt } = require("./ui/screen");
      const { confirmed } = await prompt([
        {
          type: "confirm",
          name: "confirmed",
          message: s.warning(
            `Delete connection "${name}"? This cannot be undone.`
          ),
          default: false,
        },
      ]);
      if (!confirmed) {
        console.log(s.muted("  Cancelled."));
        return;
      }
    }
    const wasActive = (getConfig().activeAiConnection || "") === name;
    deleteAIConnection(name);
    console.log(s.success(`  ✓ Deleted "${name}"`));
    if (wasActive) {
      console.log(
        s.muted(
          "  It was active — eckra will use your base settings until you switch."
        )
      );
    }
    return;
  }

  if (action === "rename") {
    const [oldName, newName] = names;
    if (!oldName || !newName) {
      providerUsage();
      process.exitCode = 1;
      return;
    }
    try {
      renameAIConnection(oldName, newName);
      console.log(s.success(`  ✓ Renamed "${oldName}" to "${newName}"`));
    } catch (err) {
      console.log(s.error(`  ✗ ${err.message}`));
      process.exitCode = 1;
    }
    return;
  }

  console.log(s.error(`  ✗ Unknown provider action: "${action}"`));
  providerUsage();
  process.exitCode = 1;
}

program
  .command("provider")
  .alias("pv")
  .description(
    "Manage saved AI provider connections (multiple accounts/providers)"
  )
  .argument("[action]", "list, use, add, remove, rename, show")
  .argument("[args...]", "Connection name(s) or key=value pair(s)")
  .option(
    "--local",
    "With `use`: pin the active connection to this repo (.eckrarc)"
  )
  .option("--none", "With `use`: clear the active connection")
  .option("-y, --yes", "With `remove`: skip the confirmation prompt")
  .option("--provider <id>", "With `add`: provider id (e.g. openai)")
  .option("--name <name>", "With `add`: connection name")
  .option("--set <pairs...>", "With `add`: provider fields as key=value pairs")
  .option("--use", "With `add`: switch to the new connection")
  .option("--show-secrets", "Show full API keys when displaying connections")
  .action(runProviderCommand);

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

// ─── eckra update ──────────────────────────────────────────────
// Check for new versions and upgrade the global package.
// Works outside git repos, no onboarding required.

async function runUpdateCommand(options) {
  const { doUpdate } = require("./ui/modules/update");
  const result = await doUpdate({
    checkOnly: options.check,
    yes: options.yes,
    interactive: false,
  });
  if (options.check && result.outdated) process.exitCode = 1;
}

program
  .command("update")
  .alias("upgrade")
  .description(
    "Check for updates and upgrade eckra (npm install -g eckra@latest)"
  )
  .option("--check", "Only check for a new version, do not update")
  .option("-y, --yes", "Skip the confirmation prompt")
  .action(runUpdateCommand);

// ─── eckra suggest ─────────────────────────────────────────────
// Non-interactive commit message generation (used by lazygit, scripts).

async function runSuggestCommand(options) {
  const { generateSuggestedCommit } = require("./helpers/suggest");
  const { COMMIT_FORMATS } = require("./helpers/ai");

  if (options.type && !COMMIT_FORMATS.includes(options.type)) {
    process.stderr.write(
      s.error(
        `  ✗ Unknown commit format: "${options.type}". Valid: ${COMMIT_FORMATS.join(", ")}\n`
      )
    );
    process.exitCode = 1;
    return;
  }

  try {
    const message = await generateSuggestedCommit({
      all: options.all,
      instruction: options.instruction,
      type: options.type,
      exclude: options.exclude,
      maxLength: options.maxLength,
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
  .option(
    "-t, --type <format>",
    "Commit message format: plain, conventional, conventional+body, gitmoji, subject+body"
  )
  .option(
    "-x, --exclude <files>",
    "Files or glob patterns to exclude from AI analysis (comma-separated)"
  )
  .option(
    "--max-length <number>",
    "Preferred max character length for the commit subject (default 50)"
  )
  .option("--output <file>", "Write the message to a file instead of stdout")
  .action(runSuggestCommand);

// ─── eckra lazygit ─────────────────────────────────────────────
// Lazygit custom-command integration management.

async function runLazygitCommand(action) {
  if (!(await app().ensureOnboarding())) return;
  const {
    getLazygitConfigPath,
    getLazygitBlock,
    getLazygitKey,
    getLazygitKeyConflictWarning,
    ensureLazygitCommand,
    removeLazygitCommand,
  } = require("./helpers/lazygit");

  const file = getLazygitConfigPath();
  const key = getLazygitKey();

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
      s.muted("  Key: ") + s.text(`${key} (uppercase, in files view)`)
    );
    console.log(
      s.muted("  Status: ") +
        (installed
          ? s.success(`installed (${key} in files view)`)
          : s.warning("not installed"))
    );
    const conflict = getLazygitKeyConflictWarning(key);
    if (conflict) console.log(s.warning(`  ${conflict}`));
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
          s.muted(
            `  Restart lazygit. Then press ${key} (uppercase) in the files view.`
          )
        );
        const conflict = getLazygitKeyConflictWarning(key);
        if (conflict) console.log(s.warning(`  ${conflict}`));
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
  .description(
    "Manage the lazygit integration (AI commit via configurable key)"
  )
  .argument("[action]", "status, install, remove")
  .action(runLazygitCommand);

// Default - start interactive
program.action(async () => {
  if (!(await app().ensureOnboarding())) return;
  if (await checkGitRepo()) {
    await app().startApp();
  }
});

program.parse(process.argv);
