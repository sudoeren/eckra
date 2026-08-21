const inquirer = require("inquirer");
const autocomplete = require("inquirer-autocomplete-prompt");
const { execSync } = require("child_process");
const {
  getConfig,
  saveConfig,
  resetConfig,
  DEFAULT_CONFIG,
  maskSecret,
  getConfigPath,
  findLocalConfig,
  listAIConnections,
  getAIConnection,
  saveAIConnection,
  deleteAIConnection,
  renameAIConnection,
  setActiveAIConnection,
} = require("../../helpers/config");
const {
  PROVIDER_CHOICES,
  PROVIDER_LABELS,
  MODEL_KEY_BY_PROVIDER,
  getProvider,
  getRequiredKeyField,
  getProviderQuestions,
  fetchModelsFor,
  getProviderFetchLabel,
  getProviderDefaultModel,
} = require("../../helpers/providers");
const {
  checkAIConnection,
  testProviderConnection,
  resetAIConnectionCache,
} = require("../../helpers/ai");
const { s, clear, sleep, pause } = require("../common");
const {
  open,
  menuItem,
  backItem,
  sep,
  prompt,
  spinner,
  done,
  fail,
  confirmAction,
} = require("../screen");

inquirer.registerPrompt("autocomplete", autocomplete);

/**
 * First free name for a new connection: "openai", "openai-2", ...
 */
function suggestConnectionName(provider, connections) {
  const names = new Set(connections.map((c) => c.name));
  if (!names.has(provider)) return provider;
  for (let i = 2; ; i++) {
    const candidate = `${provider}-${i}`;
    if (!names.has(candidate)) return candidate;
  }
}

/**
 * One-line menu label for a connection: "✓ work · OpenAI · ****1234 · gpt-5-mini"
 */
function formatConnectionLabel(connection, isActive) {
  const marker = isActive ? s.success("✓ ") : "  ";
  const providerLabel =
    PROVIDER_LABELS[connection.provider] || connection.provider;
  const details = [];
  const keyField = getRequiredKeyField(connection.provider);
  if (keyField && connection[keyField]) {
    details.push(maskSecret(connection[keyField]));
  }
  const modelKey = MODEL_KEY_BY_PROVIDER[connection.provider] || "model";
  if (connection[modelKey]) details.push(String(connection[modelKey]));
  return (
    marker +
    s.text(connection.name) +
    s.muted(
      `  (${providerLabel}${details.length > 0 ? " · " + details.join(" · ") : ""})`
    )
  );
}

/**
 * Switch the active AI connection (saved provider/account).
 */
async function switchAIConnection(config) {
  const connections = listAIConnections();
  if (connections.length === 0) {
    console.log();
    console.log(s.muted("  No saved provider connections yet."));
    console.log(
      s.muted(
        '  Configure one via "Change Provider" and save it, or run `eckra provider add`.'
      )
    );
    console.log();
    await pause();
    return;
  }

  const activeName = config.activeAiConnection || "";
  const { name } = await prompt([
    {
      type: "list",
      name: "name",
      message: s.muted("Switch to which connection?"),
      choices: [
        ...connections.map((c) => ({
          name: formatConnectionLabel(c, c.name === activeName),
          value: c.name,
          short: c.name,
        })),
        sep(),
        backItem(),
      ],
      pageSize: 15,
    },
  ]);
  if (name === "back") return;

  try {
    setActiveAIConnection(name);
    resetAIConnectionCache();
    const connection = getAIConnection(name);
    const providerLabel =
      PROVIDER_LABELS[connection.provider] || connection.provider;
    console.log(s.success(`\n  ✓ Switched to "${name}" (${providerLabel})`));
  } catch (err) {
    console.log(s.error(`\n  ✗ ${err.message}`));
  }
  await sleep(600);
}

/**
 * Manage providers: add, edit credentials/model, rename/delete.
 * Provides the full provider/model control surface requested — Switch handles
 * fast switching, this menu handles CRUD.
 */
async function manageProvidersMenu(config) {
  while (true) {
    const connections = listAIConnections();
    const activeName = (() => {
      const raw = config.activeAiConnection || "";
      if (raw) return raw;
      if (connections.some((c) => c.name === "default")) return "default";
      return connections[0]?.name || "";
    })();

    const choices = [];

    choices.push(menuItem("Add Provider", "primary", "__add__"));

    if (connections.length > 0) {
      choices.push(sep());
      for (const c of connections) {
        choices.push({
          name: formatConnectionLabel(c, c.name === activeName),
          value: c.name,
          short: c.name,
        });
      }
    }

    choices.push(sep());
    choices.push(backItem());

    const { name } = await prompt([
      {
        type: "list",
        name: "name",
        message: s.muted("Manage providers — add or pick one to edit:"),
        choices,
        pageSize: 15,
      },
    ]);
    if (name === "back") return;
    if (name === "__add__") {
      await connectionWizard({});
      // Refresh config view after add
      Object.assign(config, getConfig());
      continue;
    }

    const connChoices = [];
    if (name !== activeName) {
      connChoices.push(menuItem("Switch to this connection", "text", "switch"));
    }
    connChoices.push(menuItem("Edit Credentials / Model", "text", "edit"));
    connChoices.push(menuItem("Change Model only", "text", "model"));
    connChoices.push(menuItem("Rename", "text", "rename"));
    connChoices.push(menuItem("Delete", "danger", "delete"));
    connChoices.push(sep());
    connChoices.push(backItem());

    const { act } = await prompt([
      {
        type: "list",
        name: "act",
        message: s.muted(`"${name}" — what should I do?`),
        choices: connChoices,
        pageSize: 10,
      },
    ]);
    if (act === "back") continue;

    if (act === "switch") {
      try {
        setActiveAIConnection(name);
        resetAIConnectionCache();
        console.log(s.success(`\n  ✓ Switched to "${name}"`));
      } catch (err) {
        console.log(s.error(`\n  ✗ ${err.message}`));
      }
      await sleep(600);
      Object.assign(config, getConfig());
      continue;
    }

    if (act === "edit") {
      await connectionWizard({ existingName: name });
      Object.assign(config, getConfig());
      continue;
    }

    if (act === "model") {
      await changeModelForConnection(name);
      Object.assign(config, getConfig());
      continue;
    }

    if (act === "rename") {
      const { newName } = await prompt([
        {
          type: "input",
          name: "newName",
          message: s.muted("New name:"),
          default: name,
          validate: (v) =>
            (v && v.trim().length > 0) || "Please enter a connection name",
        },
      ]);
      try {
        renameAIConnection(name, newName);
        console.log(s.success(`\n  ✓ Renamed to "${String(newName).trim()}"`));
      } catch (err) {
        console.log(s.error(`\n  ✗ ${err.message}`));
      }
      await sleep(600);
      Object.assign(config, getConfig());
      continue;
    }

    if (act === "delete") {
      const confirmed = await confirmAction(
        `Delete connection "${name}"? This cannot be undone.`
      );
      if (!confirmed) continue;
      const wasActive = activeName === name;
      deleteAIConnection(name);
      resetAIConnectionCache();
      console.log(s.success(`\n  ✓ Deleted "${name}"`));
      if (wasActive) {
        console.log(
          s.muted(
            "  It was active — eckra will use your base settings until you switch."
          )
        );
      }
      await sleep(600);
      Object.assign(config, getConfig());
      continue;
    }
  }
}

/**
 * Prompt for model selection using autocomplete with models fetched from the provider's API
 */
async function promptModelSearch(provider, answers, config) {
  const fallbackProvider = "lmstudio";
  const modelKey =
    MODEL_KEY_BY_PROVIDER[provider] || MODEL_KEY_BY_PROVIDER[fallbackProvider];
  const fetchLabel =
    getProviderFetchLabel(provider) || getProviderFetchLabel(fallbackProvider);
  const configKey = modelKey;
  const currentModel =
    (config && config[configKey]) ||
    getProviderDefaultModel(provider) ||
    getProviderDefaultModel(fallbackProvider);

  const spin = spinner(fetchLabel);
  spin.start();

  const models = await fetchModelsFor(provider, answers, config);

  spin.stop();

  if (models.length === 0) {
    console.log(
      s.muted("  Could not fetch models. You can type a model name manually.")
    );
    const result = await prompt([
      {
        type: "input",
        name: configKey,
        message: "Model:",
        default: currentModel,
      },
    ]);
    return result;
  }

  const modelChoices = models.map((m) => ({
    name: m.name !== m.id ? `${m.name}  (${m.id})` : m.name,
    value: m.id,
    short: m.id,
  }));

  const result = await prompt([
    {
      type: "autocomplete",
      name: configKey,
      message: "Select Model (type to search):",
      source: (_answers, input) => {
        if (!input) return modelChoices;
        const term = input.toLowerCase();
        return modelChoices.filter(
          (c) =>
            c.name.toLowerCase().includes(term) ||
            c.value.toLowerCase().includes(term)
        );
      },
      default: currentModel,
      pageSize: 15,
    },
  ]);

  return result;
}

/**
 * Print the current AI configuration: active provider/connection plus
 * provider-specific details (model, API key or URL/region).
 */
function showAISettingsSummary(config) {
  const provider = config.aiProvider || "lmstudio";
  const p = getProvider(provider);
  const providerLabel = (p && p.label) || PROVIDER_LABELS[provider] || provider;

  console.log(s.muted("  Provider: ") + s.text(providerLabel));

  let displayConnection = config.activeAiConnection;
  if (!displayConnection) {
    const all = listAIConnections() || [];
    if (all.some((c) => c.name === "default")) displayConnection = "default";
    else if (all.length > 0) displayConnection = all[0].name;
    else displayConnection = "";
  }
  console.log(
    s.muted("  Connection: ") + s.text(displayConnection || "(none)")
  );

  if (p) {
    if (p.regionField) {
      const regionVal =
        config[p.regionField] ||
        p.defaultRegion ||
        DEFAULT_CONFIG[p.regionField] ||
        "";
      console.log(s.muted("  Region: ") + s.text(regionVal));
    }
    if (p.urlField) {
      if (provider === "lmstudio") {
        console.log(
          s.muted("  LM Studio URL: ") + s.text(config[p.urlField] || "")
        );
      } else {
        console.log(s.muted("  URL: ") + s.text(config[p.urlField] || ""));
      }
    }
    const modelVal = config[p.modelKey] || p.defaultModel || "";
    console.log(s.muted("  Model: ") + s.text(modelVal));
    if (p.apiKeyField) {
      const keyVal = config[p.apiKeyField];
      console.log(
        s.muted("  API Key: ") +
          s.text(keyVal ? "****" + String(keyVal).slice(-4) : "None")
      );
    }
  } else {
    console.log(s.muted("  LM Studio URL: ") + s.text(config.lmStudioUrl));
    console.log(s.muted("  Model: ") + s.text(config.model));
  }

  console.log(s.muted("  Config file: ") + s.text(getConfigPath()));
  const localPath = findLocalConfig();
  if (localPath) {
    console.log(s.muted("  Local overrides: ") + s.text(localPath));
  }
}

/**
 * Unified connection wizard: create a new connection or edit an existing one.
 * Steps: provider (if not fixed) → credentials (prefilled) → model → test → save.
 * Returns the connection name on success, or null on cancel/failure.
 */
async function connectionWizard({ existingName, providerHint, nameHint } = {}) {
  const existing = existingName ? getAIConnection(existingName) : null;
  let provider = providerHint || (existing ? existing.provider : null);

  if (!provider) {
    const answer = await prompt([
      {
        type: "autocomplete",
        name: "provider",
        message: s.muted("Which AI provider? (type to search):"),
        source: (_answers, input) => {
          if (!input) return PROVIDER_CHOICES;
          const term = input.toLowerCase();
          return PROVIDER_CHOICES.filter(
            (c) =>
              c.name.toLowerCase().includes(term) ||
              c.value.toLowerCase().includes(term)
          );
        },
        pageSize: 15,
      },
    ]);
    provider = answer.provider;
  }

  const baseConfig = existing ? { ...getConfig(), ...existing } : getConfig();
  let pending = existing ? { ...existing } : {};
  // Remove name so it doesn't leak into field validation
  delete pending.name;

  while (true) {
    const questionDefaults = { ...baseConfig, ...pending };
    const credQuestions = getProviderQuestions(provider, questionDefaults);
    let credAnswers = {};
    if (credQuestions.length > 0) {
      credAnswers = await prompt(credQuestions);
    }
    pending = { ...pending, ...credAnswers };

    const modelAnswers = await promptModelSearch(provider, pending, {
      ...baseConfig,
      ...pending,
    });
    pending = { ...pending, ...modelAnswers };

    const fullConfig = { ...baseConfig, ...pending, aiProvider: provider };
    const spin = spinner("Testing connection...");
    spin.start();
    const result = await testProviderConnection(provider, fullConfig);
    spin.stop();

    if (result.connected) {
      console.log(s.success("  ✓ Connection successful!"));
      break;
    }

    console.log(
      s.error("  ✗ Connection failed: " + (result.error || "Unknown error"))
    );
    const { testAction } = await prompt([
      {
        type: "list",
        name: "testAction",
        message: s.muted("What would you like to do?"),
        choices: [
          menuItem("Retry test", "text", "retry"),
          menuItem("Edit credentials / model", "text", "edit"),
          menuItem("Save anyway", "primary", "save"),
          menuItem("Cancel", "muted", "cancel"),
        ],
        pageSize: 10,
      },
    ]);
    if (testAction === "cancel") return null;
    if (testAction === "save") break;
    // retry and edit both loop again (edit will re-prompt with current pending as defaults)
  }

  // Strip anything that isn't a valid field for this provider (defensive)
  const sanitized = { provider };
  const allowed = new Set(getProvider(provider)?.fields || []);
  for (const [k, v] of Object.entries(pending)) {
    if (allowed.has(k) && v !== undefined && v !== null && v !== "") {
      sanitized[k] = v;
    }
  }

  if (existingName) {
    try {
      saveAIConnection(existingName, sanitized, { activate: true });
      resetAIConnectionCache();
      console.log(s.success(`  ✓ Updated connection "${existingName}"`));
      await sleep(600);
      return existingName;
    } catch (err) {
      console.log(s.error(`  ✗ ${err.message}`));
      return null;
    }
  }

  let cleanName = nameHint ? String(nameHint).trim() : "";
  if (!cleanName) {
    const suggested = suggestConnectionName(provider, listAIConnections());
    const { connName } = await prompt([
      {
        type: "input",
        name: "connName",
        message: s.muted("Connection name:"),
        default: suggested,
        validate: (v) =>
          (v && v.trim().length > 0) || "Please enter a connection name",
      },
    ]);
    cleanName = String(connName).trim();
  }
  try {
    saveAIConnection(cleanName, sanitized, { activate: false });
  } catch (err) {
    console.log(s.error(`  ✗ ${err.message}`));
    return null;
  }
  console.log(s.success(`\n  ✓ Saved connection "${cleanName}"`));
  const { activateNow } = await prompt([
    {
      type: "confirm",
      name: "activateNow",
      message: s.muted("Switch to this connection now?"),
      default: true,
    },
  ]);
  if (activateNow) {
    setActiveAIConnection(cleanName);
    resetAIConnectionCache();
    console.log(s.success(`  ✓ "${cleanName}" is now the active connection.`));
  }
  await sleep(600);
  return cleanName;
}

/**
 * Change only the model for an existing connection.
 */
async function changeModelForConnection(name) {
  const conn = getAIConnection(name);
  if (!conn) {
    console.log(s.error(`  ✗ No connection named "${name}"`));
    return;
  }
  const provider = conn.provider;
  const cfg = getConfig();
  const result = await promptModelSearch(
    provider,
    { ...conn },
    { ...cfg, ...conn }
  );
  const sanitized = { provider };
  const allowed = new Set(getProvider(provider)?.fields || []);
  for (const [k, v] of Object.entries({ ...conn, ...result })) {
    if (k === "name") continue;
    if (allowed.has(k) && v !== undefined && v !== null && v !== "") {
      sanitized[k] = v;
    }
  }
  try {
    saveAIConnection(name, sanitized, { activate: true });
    resetAIConnectionCache();
    console.log(s.success(`\n  ✓ Model updated for "${name}"`));
    await sleep(600);
  } catch (err) {
    console.log(s.error(`  ✗ ${err.message}`));
  }
}

/**
 * Settings menu loop: keeps the user inside Settings until they pick Back,
 * so consecutive actions (switch connection, change theme, ...) don't kick
 * them back to the main menu after every single change.
 */
async function doSettings() {
  let running = true;
  while (running) {
    running = await settingsMenu();
  }
}

/**
 * One iteration of the Settings screen. Returns true to stay in Settings,
 * false to leave.
 */
async function settingsMenu() {
  open("Settings");

  const config = getConfig();
  const aiStatus = await checkAIConnection();

  showAISettingsSummary(config);

  console.log(s.muted("  Theme: ") + s.text(config.theme || "auto"));
  console.log(
    s.muted("  Commit Format: ") +
      s.text(config.commitType || DEFAULT_CONFIG.commitType)
  );
  console.log(
    s.muted("  AI Status: ") +
      (aiStatus.connected
        ? s.success("Connected ✓")
        : s.error(
            "Not connected ✗ (" + (aiStatus.error || "Unknown error") + ")"
          ))
  );
  console.log();

  const { action } = await prompt([
    {
      type: "list",
      name: "action",
      message: s.muted("What should I do?"),
      choices: [
        menuItem("Switch Provider / Account", "text", "switch"),
        menuItem("Manage Providers", "text", "manage"),
        menuItem("Show AI Instruction", "text", "show-instruction"),
        menuItem("Change AI Instructions", "text", "instruction"),
        menuItem("Change Commit Format", "text", "commit-type"),
        menuItem("Change Theme", "text", "theme"),
        sep(),
        menuItem("Reset & Restart Onboarding", "danger", "reset"),
        menuItem("Uninstall Eckra", "danger", "uninstall"),
        backItem(),
      ],
      pageSize: 15,
    },
  ]);

  if (action === "back") return false;

  if (action === "reset") {
    const { confirmReset } = await prompt([
      {
        type: "confirm",
        name: "confirmReset",
        message: s.error(
          "Are you sure? This will delete all your API keys and settings."
        ),
        default: false,
      },
    ]);

    if (confirmReset) {
      resetConfig();
      console.log(
        s.success("\n  ✓ Settings reset to default. Starting onboarding...")
      );
      await sleep(1000);
      await require("./onboarding").doOnboarding();
      return false;
    }
    return true;
  }

  if (action === "uninstall") {
    const { confirmUninstall } = await prompt([
      {
        type: "confirm",
        name: "confirmUninstall",
        message: s.error(
          "This will DELETE all Eckra settings, API keys, and remove the global package. Continue?"
        ),
        default: false,
      },
    ]);

    if (!confirmUninstall) return true;

    const { reallySure } = await prompt([
      {
        type: "input",
        name: "reallySure",
        message: s.error('Type "uninstall" to confirm:'),
        validate: (v) => v === "uninstall" || "Type 'uninstall' to confirm",
      },
    ]);

    if (reallySure !== "uninstall") return true;

    clear();
    console.log(s.muted("\n  Uninstalling Eckra...\n"));

    // Remove config directory
    const spinner1 = spinner("Removing config files...");
    spinner1.start();
    try {
      const configDir = require("path").join(require("os").homedir(), ".eckra");
      require("fs").rmSync(configDir, { recursive: true, force: true });
      done(spinner1, "Config files removed");
    } catch {
      fail(spinner1, "Failed to remove config files");
    }

    // Remove lazygit integration
    const spinnerLg = spinner("Removing lazygit integration...");
    spinnerLg.start();
    try {
      const { removeLazygitCommand } = require("../../helpers/lazygit");
      const result = removeLazygitCommand();
      done(
        spinnerLg,
        result.changed
          ? "Lazygit integration removed"
          : "No lazygit integration found"
      );
    } catch {
      fail(spinnerLg, "Failed to remove lazygit integration");
    }

    // Uninstall global package
    const spinner2 = spinner("Uninstalling global package...");
    spinner2.start();
    try {
      execSync("npm uninstall -g eckra", { stdio: ["pipe", "pipe", "ignore"] });
      done(spinner2, "Global package uninstalled");
    } catch {
      spinner2.fail(
        s.warning("  Global package may not be installed or npm not found")
      );
    }

    console.log();
    console.log(s.success("  Eckra has been uninstalled."));
    console.log(s.muted("  You can delete the project folder manually:"));
    console.log(
      s.dim("    rm -rf " + require("path").join(__dirname, "..", "..", ".."))
    );
    console.log();
    await sleep(2000);
    process.exit(0);
  }

  if (action === "switch") {
    await switchAIConnection(config);
    return true;
  }

  if (action === "manage") {
    await manageProvidersMenu(config);
    return true;
  }

  if (action === "show-instruction") {
    console.log();
    console.log(s.muted("  AI Instruction:"));
    console.log(
      s.text("  " + (config.aiInstruction || "No custom instruction set."))
    );
    console.log();
    await pause();
  }

  if (action === "instruction") {
    const { instruction } = await prompt([
      {
        type: "input",
        name: "instruction",
        message: s.muted("AI System Instruction:"),
        default: config.aiInstruction,
      },
    ]);
    saveConfig({ aiInstruction: instruction });
    console.log(s.success("\n  ✓ Saved!"));
    await sleep(600);
  }

  if (action === "theme") {
    const { theme } = await prompt([
      {
        type: "list",
        name: "theme",
        message: s.muted("Select Theme:"),
        choices: [
          menuItem("Auto (Detect terminal theme)", "text", "auto"),
          menuItem("Dark", "text", "dark"),
          menuItem("Light", "text", "light"),
        ],
        default: config.theme || "auto",
        pageSize: 15,
      },
    ]);
    saveConfig({ theme });
    const { resetThemeCache } = require("../common");
    resetThemeCache();
    console.log(s.success("\n  ✓ Theme changed to " + theme));
    await sleep(600);
  }

  if (action === "commit-type") {
    const { COMMIT_FORMATS } = require("../../helpers/ai");
    const COMMIT_TYPE_LABELS = {
      "conventional+body": "Conventional + body (recommended)",
      conventional: "Conventional (subject only)",
      gitmoji: "Gitmoji (emoji prefix)",
      "subject+body": "Subject + body",
      plain: "Plain (simple subject)",
    };
    const { commitType } = await prompt([
      {
        type: "list",
        name: "commitType",
        message: s.muted("Select Commit Format:"),
        choices: COMMIT_FORMATS.map((value) => ({
          name: COMMIT_TYPE_LABELS[value] || value,
          value,
        })),
        default: config.commitType || DEFAULT_CONFIG.commitType,
        pageSize: 10,
      },
    ]);
    saveConfig({ commitType });
    console.log(s.success("\n  ✓ Commit format changed to " + commitType));
    await sleep(600);
  }

  return true;
}

/**
 * Standalone AI settings command (`eckra model`). Shows the current
 * provider/connection/model summary and lets the user switch or manage
 * providers — staying in the menu until they exit.
 */
async function doModelSelector() {
  let running = true;
  while (running) {
    open("Model");

    const config = getConfig();
    showAISettingsSummary(config);

    console.log();
    const { action } = await prompt([
      {
        type: "list",
        name: "action",
        message: s.muted("What should I do?"),
        choices: [
          menuItem("Switch Provider / Account", "text", "switch"),
          menuItem("Manage Providers", "text", "manage"),
          sep(),
          backItem(),
        ],
        pageSize: 10,
      },
    ]);

    running = false;

    if (action === "switch") {
      await switchAIConnection(config);
      running = true;
    } else if (action === "manage") {
      await manageProvidersMenu(config);
      running = true;
    }
  }
}

/**
 * Interactive "add a saved connection" flow (used by `eckra provider add`).
 * Delegates to the unified wizard so all provider/model handling stays in one
 * place. Returns the new connection name, or null when nothing was saved.
 */
async function addAIConnectionFlow({ name = "", provider = "" } = {}) {
  open("Add Provider Connection");

  let selected = String(provider || "").trim();
  if (selected && !getProvider(selected)) {
    console.log(
      s.error(
        `  ✗ Unknown provider: "${selected}". Valid: ${PROVIDER_CHOICES.map((c) => c.value).join(", ")}`
      )
    );
    return null;
  }

  return connectionWizard({
    providerHint: selected || null,
    nameHint: String(name || "").trim() || null,
  });
}

module.exports = {
  doSettings,
  promptModelSearch,
  doModelSelector,
  addAIConnectionFlow,
  // New unified helpers (also kept as manageAIConnections for backward compat)
  manageProvidersMenu,
  manageAIConnections: manageProvidersMenu,
  connectionWizard,
  changeModelForConnection,
  showAISettingsSummary,
};
