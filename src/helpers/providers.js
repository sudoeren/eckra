const PROVIDERS = [
  {
    id: "ollama",
    label: "Ollama",
    choiceName: "Ollama (Local)",
    fields: ["ollamaUrl", "ollamaModel"],
    modelKey: "ollamaModel",
    apiKeyField: null,
    urlField: "ollamaUrl",
    regionField: null,
    defaultModel: "qwen3.5:2b",
    fetchLabel: "Fetching models from Ollama...",
  },
  {
    id: "ollamacloud",
    label: "Ollama Cloud",
    choiceName: "Ollama Cloud",
    fields: ["ollamaCloudApiKey", "ollamaCloudModel"],
    modelKey: "ollamaCloudModel",
    apiKeyField: "ollamaCloudApiKey",
    urlField: null,
    regionField: null,
    defaultModel: "qwen3.5:2b",
    fetchLabel: "Fetching models from Ollama Cloud...",
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    choiceName: "LM Studio (Local)",
    fields: ["lmStudioUrl", "model"],
    modelKey: "model",
    apiKeyField: null,
    urlField: "lmStudioUrl",
    regionField: null,
    defaultModel: "git-commit-message/unsloth.Q4_K_M.gguf",
    fetchLabel: "Fetching models from LM Studio...",
  },
  {
    id: "openai",
    label: "OpenAI",
    choiceName: "OpenAI",
    fields: ["openaiApiKey", "openaiModel"],
    modelKey: "openaiModel",
    apiKeyField: "openaiApiKey",
    urlField: null,
    regionField: null,
    defaultModel: "gpt-5-mini",
    fetchLabel: "Fetching models from OpenAI...",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    choiceName: "Anthropic (Claude)",
    fields: ["anthropicApiKey", "anthropicModel"],
    modelKey: "anthropicModel",
    apiKeyField: "anthropicApiKey",
    urlField: null,
    regionField: null,
    defaultModel: "claude-haiku-4-5-20251001",
    fetchLabel: "Loading Anthropic models...",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    choiceName: "OpenRouter",
    fields: ["openrouterApiKey", "openrouterModel"],
    modelKey: "openrouterModel",
    apiKeyField: "openrouterApiKey",
    urlField: null,
    regionField: null,
    defaultModel: "openai/gpt-oss-120b",
    fetchLabel: "Fetching models from OpenRouter...",
  },
  {
    id: "gemini",
    label: "Gemini",
    choiceName: "Google Gemini",
    fields: ["geminiApiKey", "geminiModel"],
    modelKey: "geminiModel",
    apiKeyField: "geminiApiKey",
    urlField: null,
    regionField: null,
    defaultModel: "gemini-3.1-flash-lite",
    fetchLabel: "Fetching models from Gemini...",
  },
  {
    id: "opencodego",
    label: "OpenCode Go",
    choiceName: "OpenCode Go",
    fields: ["opencodeGoApiKey", "opencodeGoModel"],
    modelKey: "opencodeGoModel",
    apiKeyField: "opencodeGoApiKey",
    urlField: null,
    regionField: null,
    defaultModel: "deepseek-v4-flash",
    fetchLabel: "Fetching models from OpenCode Go...",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    choiceName: "DeepSeek",
    fields: ["deepseekApiKey", "deepseekModel"],
    modelKey: "deepseekModel",
    apiKeyField: "deepseekApiKey",
    urlField: null,
    regionField: null,
    defaultModel: "deepseek-chat",
    fetchLabel: "Fetching models from DeepSeek...",
  },
  {
    id: "bedrock",
    label: "Amazon Bedrock",
    choiceName: "Amazon Bedrock",
    fields: ["bedrockApiKey", "bedrockRegion", "bedrockModel"],
    modelKey: "bedrockModel",
    apiKeyField: "bedrockApiKey",
    urlField: null,
    regionField: "bedrockRegion",
    defaultRegion: "us-east-1",
    defaultModel: "us.anthropic.claude-haiku-4-5",
    fetchLabel: "Fetching models from Amazon Bedrock...",
  },
  {
    id: "bedrockmantle",
    label: "Amazon Bedrock Mantle",
    choiceName: "Amazon Bedrock Mantle",
    fields: [
      "bedrockMantleApiKey",
      "bedrockMantleRegion",
      "bedrockMantleModel",
    ],
    modelKey: "bedrockMantleModel",
    apiKeyField: "bedrockMantleApiKey",
    urlField: null,
    regionField: "bedrockMantleRegion",
    defaultRegion: "us-east-1",
    defaultModel: "us.anthropic.claude-haiku-4-5",
    fetchLabel: "Fetching models from Bedrock Mantle...",
  },
];

const PROVIDER_FIELDS = Object.fromEntries(
  PROVIDERS.map((p) => [p.id, p.fields])
);

const AI_PROVIDERS = PROVIDERS.map((p) => p.id);

const PROVIDER_CHOICES = PROVIDERS.map((p) => ({
  name: p.choiceName,
  value: p.id,
}));

const PROVIDER_LABELS = Object.fromEntries(
  PROVIDERS.map((p) => [p.id, p.label])
);

const MODEL_KEY_BY_PROVIDER = Object.fromEntries(
  PROVIDERS.map((p) => [p.id, p.modelKey])
);

function getProvider(id) {
  return PROVIDERS.find((p) => p.id === id) || null;
}

function getRequiredKeyField(provider) {
  const p = getProvider(provider);
  return p ? p.apiKeyField : null;
}

const QUESTION_MESSAGES = {
  openaiApiKey: "OpenAI API Key:",
  anthropicApiKey: "Anthropic API Key:",
  openrouterApiKey: "OpenRouter API Key:",
  geminiApiKey: "Google Gemini API Key:",
  opencodeGoApiKey: "OpenCode Go API Key:",
  deepseekApiKey: "DeepSeek API Key:",
  bedrockApiKey: "Amazon Bedrock API Key:",
  bedrockMantleApiKey: "Amazon Bedrock Mantle API Key:",
  ollamaCloudApiKey: "Ollama Cloud API Key:",
  ollamaUrl: "Ollama URL:",
  lmStudioUrl: "LM Studio URL:",
  bedrockRegion: "AWS Region:",
  bedrockMantleRegion: "AWS Region:",
};

function getProviderQuestions(provider, config = {}) {
  const p = getProvider(provider);
  if (!p) return [];
  const modelKey = p.modelKey;
  const nonModelFields = p.fields.filter((f) => f !== modelKey);
  return nonModelFields.map((field) => {
    const question = {
      type: "input",
      name: field,
      message: QUESTION_MESSAGES[field] || field + ":",
      default: config[field],
    };
    if (field === p.regionField) {
      question.default = config[field] || p.defaultRegion;
    }
    if (field === p.apiKeyField) {
      question.validate = (v) =>
        (v && String(v).trim().length > 0) || "Please enter a value";
    }
    return question;
  });
}

async function fetchModelsFor(provider, answers = {}, config = {}) {
  // Lazy require to avoid circular dependency (ai.js requires config.js)
  const ai = require("./ai");
  switch (provider) {
    case "openai":
      return ai.fetchOpenAIModels(answers.openaiApiKey || config.openaiApiKey);
    case "anthropic":
      return ai.fetchAnthropicModels();
    case "gemini":
      return ai.fetchGeminiModels(answers.geminiApiKey || config.geminiApiKey);
    case "ollama":
      return ai.fetchOllamaModels(answers.ollamaUrl || config.ollamaUrl);
    case "openrouter":
      return ai.fetchOpenRouterModels(
        answers.openrouterApiKey || config.openrouterApiKey
      );
    case "opencodego":
      return ai.fetchOpenCodeGoModels(
        answers.opencodeGoApiKey || config.opencodeGoApiKey
      );
    case "deepseek":
      return ai.fetchDeepSeekModels(
        answers.deepseekApiKey || config.deepseekApiKey
      );
    case "bedrock":
      return ai.fetchBedrockModels(
        answers.bedrockRegion || config.bedrockRegion,
        answers.bedrockApiKey || config.bedrockApiKey,
        "runtime"
      );
    case "bedrockmantle":
      return ai.fetchBedrockModels(
        answers.bedrockMantleRegion || config.bedrockMantleRegion,
        answers.bedrockMantleApiKey || config.bedrockMantleApiKey,
        "mantle"
      );
    case "ollamacloud":
      return ai.fetchOllamaCloudModels(
        answers.ollamaCloudApiKey || config.ollamaCloudApiKey
      );
    case "lmstudio":
    default:
      return ai.fetchLMStudioModels(answers.lmStudioUrl || config.lmStudioUrl);
  }
}

function getProviderFetchLabel(provider) {
  const p = getProvider(provider);
  return p ? p.fetchLabel : "Fetching models...";
}

function getProviderDefaultModel(provider) {
  const p = getProvider(provider);
  return p ? p.defaultModel : "";
}

module.exports = {
  PROVIDERS,
  PROVIDER_FIELDS,
  AI_PROVIDERS,
  PROVIDER_CHOICES,
  PROVIDER_LABELS,
  MODEL_KEY_BY_PROVIDER,
  getProvider,
  getRequiredKeyField,
  getProviderQuestions,
  fetchModelsFor,
  getProviderFetchLabel,
  getProviderDefaultModel,
};
