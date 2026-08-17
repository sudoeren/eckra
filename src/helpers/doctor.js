const fs = require("fs");
const { getGitStatus, getRemotes } = require("./git");
const { checkAIConnection, resetAIConnectionCache } = require("./ai");
const {
  getConfig,
  getConfigPath,
  isValidConfigKey,
  findLocalConfig,
} = require("./config");

const MIN_NODE_MAJOR = 20;
const VALID_THEMES = ["auto", "dark", "light"];

const PROVIDER_KEY_FIELDS = {
  openai: "openaiApiKey",
  anthropic: "anthropicApiKey",
  openrouter: "openrouterApiKey",
  gemini: "geminiApiKey",
};

const PROVIDER_MODEL_KEYS = {
  openai: "openaiModel",
  anthropic: "anthropicModel",
  openrouter: "openrouterModel",
  gemini: "geminiModel",
  ollama: "ollamaModel",
  lmstudio: "model",
};

function checkResult(category, label, status, detail) {
  return { category, label, status, detail };
}

function formatMode(mode) {
  return (mode & 0o777).toString(8).padStart(3, "0");
}

/**
 * Run all diagnostic checks and return a structured report.
 * - `skipProvider: true` skips the live AI provider network check.
 */
async function runDoctorCheck({ skipProvider = false } = {}) {
  const checks = [];
  const config = getConfig();

  // ── Runtime ──────────────────────────────────────────────────
  const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
  checks.push(
    checkResult(
      "Runtime",
      "Node.js version",
      nodeMajor >= MIN_NODE_MAJOR ? "pass" : "fail",
      `v${process.versions.node} (required >= ${MIN_NODE_MAJOR})`
    )
  );

  // ── Git ──────────────────────────────────────────────────────
  let repo = null;
  try {
    repo = await getGitStatus();
    checks.push(
      checkResult(
        "Git",
        "Git repository",
        "pass",
        `detected — branch: ${repo.current || "unknown"}`
      )
    );
  } catch {
    checks.push(
      checkResult(
        "Git",
        "Git repository",
        "skip",
        "not a git repository — run `git init` or cd into a repo (git checks skipped)"
      )
    );
  }

  if (repo) {
    const branch = repo.current || "unknown";

    if (repo.tracking) {
      const parts = [];
      if (repo.ahead > 0) parts.push(`ahead ${repo.ahead}`);
      if (repo.behind > 0) parts.push(`behind ${repo.behind}`);
      const delta = parts.length > 0 ? ` (${parts.join(", ")})` : "";
      checks.push(
        checkResult(
          "Git",
          "Upstream tracking",
          "pass",
          `${branch} → ${repo.tracking}${delta}`
        )
      );
    } else {
      checks.push(
        checkResult(
          "Git",
          "Upstream tracking",
          "warn",
          `no upstream for "${branch}" — first push needs -u (eckra handles this)`
        )
      );
    }

    if (repo.conflicted.length > 0) {
      checks.push(
        checkResult(
          "Git",
          "Merge conflicts",
          "fail",
          `${repo.conflicted.length} conflicted file(s): ${repo.conflicted.join(", ")}`
        )
      );
    } else {
      checks.push(checkResult("Git", "Merge conflicts", "pass", "none"));
    }

    const remotes = await getRemotes().catch(() => []);
    if (remotes.length > 0) {
      checks.push(
        checkResult(
          "Git",
          "Remotes",
          "pass",
          `${remotes.length} configured (${remotes.map((r) => r.name).join(", ")})`
        )
      );
    } else {
      checks.push(
        checkResult(
          "Git",
          "Remotes",
          "warn",
          "no remotes configured — push/pull unavailable"
        )
      );
    }

    const counts = [
      ["staged", repo.staged.length],
      ["modified", repo.modified.length],
      ["untracked", repo.not_added.length],
      ["deleted", repo.deleted.length],
    ].filter(([, n]) => n > 0);

    checks.push(
      checkResult(
        "Git",
        "Uncommitted changes",
        "info",
        counts.length > 0
          ? counts.map(([label, n]) => `${n} ${label}`).join(", ")
          : "working tree clean"
      )
    );
  }

  // ── Config ───────────────────────────────────────────────────
  const globalPath = getConfigPath();
  const globalExists = fs.existsSync(globalPath);

  if (globalExists) {
    checks.push(checkResult("Config", "Config file", "info", globalPath));

    let valid = true;
    try {
      JSON.parse(fs.readFileSync(globalPath, "utf8"));
    } catch {
      valid = false;
    }
    checks.push(
      checkResult(
        "Config",
        "Config JSON valid",
        valid ? "pass" : "fail",
        valid ? "parses correctly" : "malformed JSON — defaults are being used"
      )
    );

    let mode = "";
    let statError = false;
    try {
      mode = formatMode(fs.statSync(globalPath).mode);
    } catch {
      statError = true;
    }
    const permsOk = !statError && mode === "600";
    checks.push(
      checkResult(
        "Config",
        "Config file permissions",
        permsOk ? "pass" : "fail",
        permsOk
          ? `0600 (secure)`
          : `${mode} — API keys are at risk, expected 0600`
      )
    );
  } else {
    checks.push(
      checkResult(
        "Config",
        "Config file",
        "info",
        "no config file yet — using defaults (zero-config)"
      )
    );
  }

  const localPath = findLocalConfig();
  checks.push(
    checkResult(
      "Config",
      "Local override",
      "info",
      localPath ? `active — ${localPath}` : "none"
    )
  );

  const provider = config.aiProvider || "ollama";
  checks.push(checkResult("Config", "Provider configured", "info", provider));

  const keyField = PROVIDER_KEY_FIELDS[provider];
  if (!keyField) {
    checks.push(
      checkResult(
        "Config",
        "API key required",
        "pass",
        "local provider — no key needed"
      )
    );
  } else {
    const key = config[keyField];
    checks.push(
      checkResult(
        "Config",
        "API key configured",
        key ? "pass" : "fail",
        key
          ? `${keyField} set (masked)`
          : `${keyField} missing — ${provider} requires an API key`
      )
    );
  }

  const modelKey = PROVIDER_MODEL_KEYS[provider] || "model";
  const model = config[modelKey];
  checks.push(
    checkResult(
      "Config",
      "Model configured",
      model ? "pass" : "warn",
      model ? `${modelKey}: ${model}` : `${modelKey} is empty — pick a model`
    )
  );

  if (!VALID_THEMES.includes(config.theme)) {
    checks.push(
      checkResult(
        "Config",
        "Theme",
        "warn",
        `"${config.theme}" is not a valid theme (auto, dark, light)`
      )
    );
  }

  const legacyKeys = Object.keys(config).filter((k) => !isValidConfigKey(k));
  if (legacyKeys.length > 0) {
    checks.push(
      checkResult(
        "Config",
        "Legacy keys",
        "info",
        `${legacyKeys.join(", ")} — not used by eckra (safe to unset)`
      )
    );
  }

  // ── AI Provider ──────────────────────────────────────────────
  if (skipProvider) {
    checks.push(
      checkResult(
        "AI Provider",
        "Connection",
        "skip",
        "skipped (--no-provider)"
      )
    );
  } else {
    resetAIConnectionCache();
    const result = await checkAIConnection();
    if (result.connected) {
      const modelLabel = config[modelKey] || "default";
      const modelsCount = Array.isArray(result.models)
        ? `${result.models.length} models`
        : "connected";
      checks.push(
        checkResult(
          "AI Provider",
          "Connection",
          "pass",
          `${provider} · ${modelLabel} · ${modelsCount}`
        )
      );
    } else {
      checks.push(
        checkResult(
          "AI Provider",
          "Connection",
          "fail",
          result.error || "connection failed"
        )
      );
    }
  }

  const passed = checks.filter((c) => c.status === "pass").length;
  const warnings = checks.filter((c) => c.status === "warn").length;
  const failed = checks.filter((c) => c.status === "fail").length;

  return {
    checks,
    passed,
    warnings,
    failed,
    version: require("../../package.json").version,
  };
}

module.exports = { runDoctorCheck };
