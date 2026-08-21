const inquirer = require("inquirer");
const autocomplete = require("inquirer-autocomplete-prompt");
const { execSync } = require("child_process");
const {
  getConfig,
  saveConfig,
  resetConfig,
  DEFAULT_CONFIG,
  maskSecret,
  listAIConnections,
  getAIConnection,
  saveAIConnection,
  deleteAIConnection,
  renameAIConnection,
  setActiveAIConnection,
} = require("../../helpers/config");
const {
  checkAIConnection,
  testProviderConnection,
  fetchOpenRouterModels,
  fetchOpenAIModels,
  fetchAnthropicModels,
  fetchGeminiModels,
  fetchOllamaModels,
  fetchLMStudioModels,
  fetchOpenCodeGoModels,
  fetchDeepSeekModels,
  fetchBedrockModels,
  fetchOllamaCloudModels,
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

const PROVIDER_CHOICES = [
  { name: "Ollama (Local)", value: "ollama" },
  { name: "Ollama Cloud", value: "ollamacloud" },
  { name: "LM Studio (Local)", value: "lmstudio" },
  { name: "OpenAI", value: "openai" },
  { name: "Anthropic (Claude)", value: "anthropic" },
  { name: "OpenRouter", value: "openrouter" },
  { name: "Google Gemini", value: "gemini" },
  { name: "OpenCode Go", value: "opencodego" },
  { name: "DeepSeek", value: "deepseek" },
  { name: "Amazon Bedrock", value: "bedrock" },
  { name: "Amazon Bedrock Mantle", value: "bedrockmantle" },
];

const PROVIDER_LABELS = Object.fromEntries(
  PROVIDER_CHOICES.map((c) => [c.value, c.name.replace(/\s*\(.*\)$/, "")])
);

const MODEL_KEY_BY_PROVIDER = {
  openai: "openaiModel",
  anthropic: "anthropicModel",
  gemini: "geminiModel",
  ollama: "ollamaModel",
  openrouter: "openrouterModel",
  opencodego: "opencodeGoModel",
  deepseek: "deepseekModel",
  bedrock: "bedrockModel",
  bedrockmantle: "bedrockMantleModel",
  ollamacloud: "ollamaCloudModel",
  lmstudio: "model",
};

/**
 * Persist provider credentials/model answers. When a saved connection with
 * the same provider is active its entry is updated (staying active);
 * otherwise the legacy flat config keys are written. Returns where the
 * data landed: `{ target: "connection", name }` or `{ target: "legacy" }`.
 */
function saveProviderSettings(provider, answers) {
  const config = getConfig();
  const active =
    typeof config.activeAiConnection === "string"
      ? config.activeAiConnection
      : "";
  const existing = active ? getAIConnection(active) : null;
  if (existing && existing.provider === provider) {
    const { name, ...fields } = existing;
    saveAIConnection(
      name,
      { ...fields, ...answers, provider },
      {
        activate: true,
      }
    );
    return { target: "connection", name };
  }
  saveConfig({ ...answers, aiProvider: provider });
  return { target: "legacy" };
}

/**
 * Test provider connection with a spinner, then save or let user decide.
 * Returns the persist result, or null when nothing was saved.
 */
async function testAndSaveProvider(provider, fullConfig, answers) {
  const spin = spinner("Testing connection...");
  spin.start();
  const result = await testProviderConnection(provider, fullConfig);
  spin.stop();

  if (result.connected) {
    console.log(s.success("  ✓ Connection successful!"));
    const saved = saveProviderSettings(provider, answers);
    if (saved.target === "connection") {
      console.log(s.success(`  ✓ Updated connection "${saved.name}"`));
    } else {
      console.log(s.success("  ✓ Provider configured: " + provider));
    }
    return saved;
  }
  console.log(
    s.error("  ✗ Connection failed: " + (result.error || "Unknown error"))
  );
  const { saveAnyway } = await prompt([
    {
      type: "confirm",
      name: "saveAnyway",
      message: s.muted("Save settings anyway?"),
      default: false,
    },
  ]);
  if (saveAnyway) {
    const saved = saveProviderSettings(provider, answers);
    console.log(s.success("  ✓ Settings saved (connection pending)"));
    return saved;
  }
  console.log(s.muted("  Settings not saved."));
  return null;
}

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
 * After configuring a provider, offer to keep it as a named connection so
 * the user can switch between providers/accounts anytime. Activated on save
 * since it mirrors what was just configured and tested.
 */
async function offerSaveConnection(provider, answers) {
  console.log();
  const { saveConn } = await prompt([
    {
      type: "confirm",
      name: "saveConn",
      message: s.muted("Save this configuration for quick switching?"),
      default: true,
    },
  ]);
  if (!saveConn) return;

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

  try {
    const cleanName = String(connName).trim();
    saveAIConnection(cleanName, { provider, ...answers }, { activate: true });
    resetAIConnectionCache();
    console.log(s.success(`  ✓ Saved connection "${cleanName}" — now active`));
  } catch (err) {
    console.log(s.error(`  ✗ ${err.message}`));
  }
  await sleep(600);
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
 * Rename/delete saved connections.
 */
async function manageAIConnections(config) {
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
      message: s.muted("Manage which connection?"),
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

  const choices = [];
  if (name !== activeName) {
    choices.push(menuItem("Switch to this connection", "text", "switch"));
  }
  choices.push(menuItem("Rename", "text", "rename"));
  choices.push(menuItem("Delete", "danger", "delete"));
  choices.push(sep());
  choices.push(backItem());

  const { act } = await prompt([
    {
      type: "list",
      name: "act",
      message: s.muted(`"${name}" — what should I do?`),
      choices,
      pageSize: 10,
    },
  ]);
  if (act === "back") return;

  if (act === "switch") {
    try {
      setActiveAIConnection(name);
      resetAIConnectionCache();
      console.log(s.success(`\n  ✓ Switched to "${name}"`));
    } catch (err) {
      console.log(s.error(`\n  ✗ ${err.message}`));
    }
    await sleep(600);
    return;
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
    return;
  }

  if (act === "delete") {
    const confirmed = await confirmAction(
      `Delete connection "${name}"? This cannot be undone.`
    );
    if (!confirmed) return;
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
  }
}

/**
 * Get the required API key field name for a provider (null if no key needed)
 */
function getRequiredKeyField(provider) {
  const keyFields = {
    openai: "openaiApiKey",
    anthropic: "anthropicApiKey",
    openrouter: "openrouterApiKey",
    gemini: "geminiApiKey",
    opencodego: "opencodeGoApiKey",
    deepseek: "deepseekApiKey",
    bedrock: "bedrockApiKey",
    bedrockmantle: "bedrockMantleApiKey",
    ollamacloud: "ollamaCloudApiKey",
  };
  return keyFields[provider] || null;
}

/**
 * Get configuration questions for a provider (excluding model selection)
 */
function getProviderQuestions(provider, config) {
  switch (provider) {
    case "openai":
      return [
        {
          type: "input",
          name: "openaiApiKey",
          message: "OpenAI API Key:",
          default: config.openaiApiKey,
        },
      ];
    case "anthropic":
      return [
        {
          type: "input",
          name: "anthropicApiKey",
          message: "Anthropic API Key:",
          default: config.anthropicApiKey,
        },
      ];
    case "ollama":
      return [
        {
          type: "input",
          name: "ollamaUrl",
          message: "Ollama URL:",
          default: config.ollamaUrl,
        },
      ];
    case "openrouter":
      return [
        {
          type: "input",
          name: "openrouterApiKey",
          message: "OpenRouter API Key:",
          default: config.openrouterApiKey,
        },
      ];
    case "gemini":
      return [
        {
          type: "input",
          name: "geminiApiKey",
          message: "Google Gemini API Key:",
          default: config.geminiApiKey,
        },
      ];
    case "opencodego":
      return [
        {
          type: "input",
          name: "opencodeGoApiKey",
          message: "OpenCode Go API Key:",
          default: config.opencodeGoApiKey,
        },
      ];
    case "deepseek":
      return [
        {
          type: "input",
          name: "deepseekApiKey",
          message: "DeepSeek API Key:",
          default: config.deepseekApiKey,
        },
      ];
    case "bedrock":
      return [
        {
          type: "input",
          name: "bedrockApiKey",
          message: "Amazon Bedrock API Key:",
          default: config.bedrockApiKey,
        },
        {
          type: "input",
          name: "bedrockRegion",
          message: "AWS Region:",
          default: config.bedrockRegion || DEFAULT_CONFIG.bedrockRegion,
        },
      ];
    case "bedrockmantle":
      return [
        {
          type: "input",
          name: "bedrockMantleApiKey",
          message: "Amazon Bedrock Mantle API Key:",
          default: config.bedrockMantleApiKey,
        },
        {
          type: "input",
          name: "bedrockMantleRegion",
          message: "AWS Region:",
          default:
            config.bedrockMantleRegion || DEFAULT_CONFIG.bedrockMantleRegion,
        },
      ];
    case "ollamacloud":
      return [
        {
          type: "input",
          name: "ollamaCloudApiKey",
          message: "Ollama Cloud API Key:",
          default: config.ollamaCloudApiKey,
        },
      ];
    default:
      return [
        {
          type: "input",
          name: "lmStudioUrl",
          message: "LM Studio URL:",
          default: config.lmStudioUrl,
        },
      ];
  }
}

/**
 * Prompt for model selection using autocomplete with models fetched from the provider's API
 */
async function promptModelSearch(provider, answers, config) {
  let models;
  let currentModel;
  let configKey;
  let fetchLabel;

  switch (provider) {
    case "openai":
      configKey = "openaiModel";
      currentModel = config.openaiModel || DEFAULT_CONFIG.openaiModel;
      fetchLabel = "Fetching models from OpenAI...";
      break;
    case "anthropic":
      configKey = "anthropicModel";
      currentModel = config.anthropicModel || DEFAULT_CONFIG.anthropicModel;
      fetchLabel = "Loading Anthropic models...";
      break;
    case "gemini":
      configKey = "geminiModel";
      currentModel = config.geminiModel || DEFAULT_CONFIG.geminiModel;
      fetchLabel = "Fetching models from Gemini...";
      break;
    case "ollama":
      configKey = "ollamaModel";
      currentModel = config.ollamaModel || DEFAULT_CONFIG.ollamaModel;
      fetchLabel = "Fetching models from Ollama...";
      break;
    case "openrouter":
      configKey = "openrouterModel";
      currentModel = config.openrouterModel || DEFAULT_CONFIG.openrouterModel;
      fetchLabel = "Fetching models from OpenRouter...";
      break;
    case "opencodego":
      configKey = "opencodeGoModel";
      currentModel = config.opencodeGoModel || DEFAULT_CONFIG.opencodeGoModel;
      fetchLabel = "Fetching models from OpenCode Go...";
      break;
    case "deepseek":
      configKey = "deepseekModel";
      currentModel = config.deepseekModel || DEFAULT_CONFIG.deepseekModel;
      fetchLabel = "Fetching models from DeepSeek...";
      break;
    case "bedrock":
      configKey = "bedrockModel";
      currentModel = config.bedrockModel || DEFAULT_CONFIG.bedrockModel;
      fetchLabel = "Fetching models from Amazon Bedrock...";
      break;
    case "bedrockmantle":
      configKey = "bedrockMantleModel";
      currentModel =
        config.bedrockMantleModel || DEFAULT_CONFIG.bedrockMantleModel;
      fetchLabel = "Fetching models from Bedrock Mantle...";
      break;
    case "ollamacloud":
      configKey = "ollamaCloudModel";
      currentModel = config.ollamaCloudModel || DEFAULT_CONFIG.ollamaCloudModel;
      fetchLabel = "Fetching models from Ollama Cloud...";
      break;
    case "lmstudio":
    default:
      configKey = "model";
      currentModel = config.model || DEFAULT_CONFIG.model;
      fetchLabel = "Fetching models from LM Studio...";
      break;
  }

  const spin = spinner(fetchLabel);
  spin.start();

  switch (provider) {
    case "openai":
      models = await fetchOpenAIModels(
        answers.openaiApiKey || config.openaiApiKey
      );
      break;
    case "anthropic":
      models = await fetchAnthropicModels();
      break;
    case "gemini":
      models = await fetchGeminiModels(
        answers.geminiApiKey || config.geminiApiKey
      );
      break;
    case "ollama":
      models = await fetchOllamaModels(answers.ollamaUrl || config.ollamaUrl);
      break;
    case "openrouter":
      models = await fetchOpenRouterModels(
        answers.openrouterApiKey || config.openrouterApiKey
      );
      break;
    case "opencodego":
      models = await fetchOpenCodeGoModels(
        answers.opencodeGoApiKey || config.opencodeGoApiKey
      );
      break;
    case "deepseek":
      models = await fetchDeepSeekModels(
        answers.deepseekApiKey || config.deepseekApiKey
      );
      break;
    case "bedrock":
      models = await fetchBedrockModels(
        answers.bedrockRegion || config.bedrockRegion,
        answers.bedrockApiKey || config.bedrockApiKey,
        "runtime"
      );
      break;
    case "bedrockmantle":
      models = await fetchBedrockModels(
        answers.bedrockMantleRegion || config.bedrockMantleRegion,
        answers.bedrockMantleApiKey || config.bedrockMantleApiKey,
        "mantle"
      );
      break;
    case "ollamacloud":
      models = await fetchOllamaCloudModels(
        answers.ollamaCloudApiKey || config.ollamaCloudApiKey
      );
      break;
    case "lmstudio":
    default:
      models = await fetchLMStudioModels(
        answers.lmStudioUrl || config.lmStudioUrl
      );
      break;
  }

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
 * Ask provider configuration and return answers (handles model selection with autocomplete for all providers)
 */
async function askProviderConfig(provider, config) {
  const questions = getProviderQuestions(provider, config);
  const answers = questions.length > 0 ? await prompt(questions) : {};

  const modelAnswers = await promptModelSearch(provider, answers, config);

  return { ...answers, ...modelAnswers };
}

/**
 * Print the current AI configuration: active provider/connection plus
 * provider-specific details (model, API key or URL/region).
 */
function showAISettingsSummary(config) {
  const provider = config.aiProvider || "lmstudio";
  const providerLabel = PROVIDER_LABELS[provider] || provider;

  console.log(s.muted("  Provider: ") + s.text(providerLabel));
  console.log(
    s.muted("  Connection: ") +
      s.text(config.activeAiConnection || "(none — base settings)")
  );

  if (config.aiProvider === "openai") {
    console.log(s.muted("  Model: ") + s.text(config.openaiModel));
    console.log(
      s.muted("  API Key: ") +
        s.text(
          config.openaiApiKey ? "****" + config.openaiApiKey.slice(-4) : "None"
        )
    );
  } else if (config.aiProvider === "anthropic") {
    console.log(s.muted("  Model: ") + s.text(config.anthropicModel));
    console.log(
      s.muted("  API Key: ") +
        s.text(
          config.anthropicApiKey
            ? "****" + config.anthropicApiKey.slice(-4)
            : "None"
        )
    );
  } else if (config.aiProvider === "ollama") {
    console.log(s.muted("  URL: ") + s.text(config.ollamaUrl));
    console.log(s.muted("  Model: ") + s.text(config.ollamaModel));
  } else if (config.aiProvider === "openrouter") {
    console.log(s.muted("  Model: ") + s.text(config.openrouterModel));
    console.log(
      s.muted("  API Key: ") +
        s.text(
          config.openrouterApiKey
            ? "****" + config.openrouterApiKey.slice(-4)
            : "None"
        )
    );
  } else if (config.aiProvider === "gemini") {
    console.log(s.muted("  Model: ") + s.text(config.geminiModel));
    console.log(
      s.muted("  API Key: ") +
        s.text(
          config.geminiApiKey ? "****" + config.geminiApiKey.slice(-4) : "None"
        )
    );
  } else if (config.aiProvider === "opencodego") {
    console.log(s.muted("  Model: ") + s.text(config.opencodeGoModel));
    console.log(
      s.muted("  API Key: ") +
        s.text(
          config.opencodeGoApiKey
            ? "****" + config.opencodeGoApiKey.slice(-4)
            : "None"
        )
    );
  } else if (config.aiProvider === "deepseek") {
    console.log(s.muted("  Model: ") + s.text(config.deepseekModel));
    console.log(
      s.muted("  API Key: ") +
        s.text(
          config.deepseekApiKey
            ? "****" + config.deepseekApiKey.slice(-4)
            : "None"
        )
    );
  } else if (config.aiProvider === "bedrock") {
    console.log(
      s.muted("  Region: ") +
        s.text(config.bedrockRegion || DEFAULT_CONFIG.bedrockRegion)
    );
    console.log(s.muted("  Model: ") + s.text(config.bedrockModel));
    console.log(
      s.muted("  API Key: ") +
        s.text(
          config.bedrockApiKey
            ? "****" + config.bedrockApiKey.slice(-4)
            : "None"
        )
    );
  } else if (config.aiProvider === "bedrockmantle") {
    console.log(
      s.muted("  Region: ") +
        s.text(config.bedrockMantleRegion || DEFAULT_CONFIG.bedrockMantleRegion)
    );
    console.log(s.muted("  Model: ") + s.text(config.bedrockMantleModel));
    console.log(
      s.muted("  API Key: ") +
        s.text(
          config.bedrockMantleApiKey
            ? "****" + config.bedrockMantleApiKey.slice(-4)
            : "None"
        )
    );
  } else if (config.aiProvider === "ollamacloud") {
    console.log(s.muted("  Model: ") + s.text(config.ollamaCloudModel));
    console.log(
      s.muted("  API Key: ") +
        s.text(
          config.ollamaCloudApiKey
            ? "****" + config.ollamaCloudApiKey.slice(-4)
            : "None"
        )
    );
  } else {
    console.log(s.muted("  LM Studio URL: ") + s.text(config.lmStudioUrl));
    console.log(s.muted("  Model: ") + s.text(config.model));
  }
}

/**
 * Pick a different AI provider and configure/test/save it.
 */
async function changeProviderFlow(config) {
  const { provider } = await prompt([
    {
      type: "autocomplete",
      name: "provider",
      message: s.muted("Select AI Provider (type to search):"),
      source: (_answers, input) => {
        if (!input) return PROVIDER_CHOICES;
        const term = input.toLowerCase();
        return PROVIDER_CHOICES.filter(
          (c) =>
            c.name.toLowerCase().includes(term) ||
            c.value.toLowerCase().includes(term)
        );
      },
      default: config.aiProvider,
      pageSize: 15,
    },
  ]);

  // Check if this provider requires an API key and it's not yet configured
  const keyField = getRequiredKeyField(provider);
  const needsSetup = keyField && !config[keyField];

  let answers = {};
  if (needsSetup) {
    console.log(
      s.muted("\n  This provider requires configuration. Let's set it up:\n")
    );
    answers = await askProviderConfig(provider, config);
  }

  const saved = await testAndSaveProvider(
    provider,
    { ...config, ...answers },
    answers
  );
  if (saved && saved.target !== "connection") {
    await offerSaveConnection(provider, answers);
  }
}

/**
 * Re-configure credentials/model for the currently active provider.
 */
async function configureProviderFlow(config) {
  const provider = config.aiProvider || "lmstudio";
  const answers = await askProviderConfig(provider, config);
  const saved = await testAndSaveProvider(
    provider,
    { ...config, ...answers },
    answers
  );
  if (saved && saved.target !== "connection") {
    await offerSaveConnection(provider, answers);
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
        menuItem("Change Provider", "text", "provider"),
        menuItem("Configure Provider Settings", "text", "configure"),
        menuItem("Switch Provider / Account", "text", "switch"),
        menuItem("Manage Saved Providers", "text", "manage"),
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

  if (action === "provider") {
    await changeProviderFlow(config);
    return true;
  }

  if (action === "configure") {
    await configureProviderFlow(config);
    return true;
  }

  if (action === "switch") {
    await switchAIConnection(config);
    return true;
  }

  if (action === "manage") {
    await manageAIConnections(config);
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
 * provider/connection/model summary and lets the user change the model,
 * re-configure the provider, switch providers, or pick another saved
 * connection — staying in the menu until they exit. Model changes are
 * written into the active connection when one is set, otherwise into
 * base settings.
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
          menuItem("Change Model", "primary", "model"),
          menuItem("Configure Provider Settings", "text", "configure"),
          menuItem("Change Provider", "text", "provider"),
          menuItem("Switch Provider / Account", "text", "switch"),
          sep(),
          backItem(),
        ],
        pageSize: 10,
      },
    ]);

    running = false;

    if (action === "model") {
      const provider = config.aiProvider || "lmstudio";
      const result = await promptModelSearch(provider, {}, config);
      saveProviderSettings(provider, result);
      resetAIConnectionCache();
      console.log(s.success("\n  ✓ Model updated!"));
      await sleep(600);
      running = true;
    } else if (action === "configure") {
      await configureProviderFlow(config);
      running = true;
    } else if (action === "provider") {
      await changeProviderFlow(config);
      running = true;
    } else if (action === "switch") {
      await switchAIConnection(config);
      running = true;
    }
  }
}

/**
 * Interactive "add a saved connection" flow (used by `eckra provider add`).
 * Returns the new connection name, or null when nothing was saved.
 */
async function addAIConnectionFlow({ name = "", provider = "" } = {}) {
  open("Add Provider Connection");

  let selected = String(provider || "").trim();
  if (selected && !PROVIDER_CHOICES.some((c) => c.value === selected)) {
    console.log(
      s.error(
        `  ✗ Unknown provider: "${selected}". Valid: ${PROVIDER_CHOICES.map((c) => c.value).join(", ")}`
      )
    );
    return null;
  }

  if (!selected) {
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
    selected = answer.provider;
  }

  console.log();
  const answers = await askProviderConfig(selected, getConfig());

  let connName = String(name || "").trim();
  if (!connName) {
    const suggested = suggestConnectionName(selected, listAIConnections());
    const answer = await prompt([
      {
        type: "input",
        name: "connName",
        message: s.muted("Connection name:"),
        default: suggested,
        validate: (v) =>
          (v && v.trim().length > 0) || "Please enter a connection name",
      },
    ]);
    connName = String(answer.connName).trim();
  }

  try {
    saveAIConnection(connName, { provider: selected, ...answers });
  } catch (err) {
    console.log(s.error(`\n  ✗ ${err.message}`));
    return null;
  }
  console.log(s.success(`\n  ✓ Saved connection "${connName}"`));

  const { activateNow } = await prompt([
    {
      type: "confirm",
      name: "activateNow",
      message: s.muted("Switch to this connection now?"),
      default: true,
    },
  ]);
  if (activateNow) {
    setActiveAIConnection(connName);
    resetAIConnectionCache();
    console.log(s.success(`  ✓ "${connName}" is now the active connection.`));
  }

  await sleep(600);
  return connName;
}

module.exports = {
  doSettings,
  promptModelSearch,
  doModelSelector,
  addAIConnectionFlow,
};
