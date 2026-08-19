const axios = require("axios");
const { getConfig, DEFAULT_CONFIG, normalizeUrl } = require("./config");

const MAX_DIFF_CHARS = 2000;

const COMMIT_FORMATS = [
  "plain",
  "conventional",
  "conventional+body",
  "gitmoji",
  "subject+body",
];

/**
 * Resolve the commit message format for a generation request. An explicit
 * `type` wins, otherwise the config default is used, falling back to
 * conventional+body for unknown values so existing behavior is preserved.
 */
function resolveCommitType(type) {
  const config = getConfig();
  const candidate = type || config.commitType || DEFAULT_CONFIG.commitType;
  return COMMIT_FORMATS.includes(candidate)
    ? candidate
    : DEFAULT_CONFIG.commitType;
}

/**
 * Conventional Commits type list, only relevant for the conventional-ish
 * formats. Returns an empty string otherwise.
 */
function getConventionalTypesBlock(type) {
  if (
    type !== "conventional" &&
    type !== "conventional+body" &&
    type !== "gitmoji"
  ) {
    return "";
  }
  return `Conventional Commits types:
- feat: A new feature
- fix: A bug fix
- docs: Documentation only changes
- style: Changes that do not affect the code (whitespace, formatting, missing semicolons, etc.)
- refactor: Code change that neither fixes a bug nor adds a feature
- perf: Code change that improves performance
- test: Adding missing tests or correcting existing tests
- chore: Changes to the build process or auxiliary tools

`;
}

/**
 * Format-specific instructions plus a worked example. Shared by the single
 * and multi-suggestion prompts so the two never drift apart.
 */
function getCommitFormatBlock(type, maxLength) {
  const max = maxLength || DEFAULT_CONFIG.subjectMaxLength;
  switch (type) {
    case "plain":
      return `1. **Subject line** (first line): short, plain description. Max ${max} characters. Use imperative mood ("add" not "added").
2. **Body** (optional but recommended): 1-3 bullet points explaining WHAT changed and WHY. Wrap at 72 characters.

Example:
add autocomplete search for providers

- Implement type-to-search in provider selection
- Fetch models from each provider's API`;

    case "conventional":
      return `1. **Subject line** (first line): type(scope): brief description. Max ${max} characters. Use imperative mood ("add" not "added").
2. **Body**: none (subject line only).

Example:
feat(auth): add JWT token validation`;

    case "gitmoji":
      return `1. **Subject line** (first line): a relevant emoji, then type(scope): brief description (e.g. "✨ feat(auth): add login"). Max ${max} characters. Use imperative mood ("add" not "added").
2. **Blank line**
3. **Body** (optional but recommended): 1-3 bullet points explaining WHAT changed and WHY. Wrap at 72 characters.

Example:
✨ feat(auth): add JWT token validation

- Implement token verification middleware
- Add refresh token rotation for security`;

    case "subject+body":
      return `1. **Subject line** (first line): short, plain description. Max ${max} characters. Use imperative mood ("add" not "added").
2. **Blank line**
3. **Body** (optional but recommended): 1-3 bullet points explaining WHAT changed and WHY. Wrap at 72 characters.

Example:
add JWT token validation

- Implement token verification middleware
- Add refresh token rotation for security`;

    case "conventional+body":
    default:
      return `1. **Subject line** (first line): type(scope): brief description. Max ${max} characters. Use imperative mood ("add" not "added").
2. **Blank line**
3. **Body** (optional but recommended): 1-3 bullet points explaining WHAT changed and WHY. Wrap at 72 characters.

Example:
feat: add autocomplete search for providers

- Implement type-to-search in provider selection
- Fetch models from each provider's API
- Add fallback to manual input when API fails`;
  }
}

function formatDiffForPrompt(diff, maxChars = MAX_DIFF_CHARS) {
  if (!diff || diff.length <= maxChars) return diff || "";

  const omittedChars = diff.length - maxChars;
  return `${diff.substring(0, maxChars)}\n\n[Diff truncated: ${omittedChars} characters omitted. Review the changed files list for the full scope.]`;
}

/**
 * Call the selected AI provider
 */
async function callProvider(
  provider,
  messages,
  temperature = 0.3,
  max_tokens = 100
) {
  const config = getConfig();
  let url, headers, body;

  switch (provider) {
    case "openai":
      url = "https://api.openai.com/v1/chat/completions";
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.openaiApiKey}`,
      };
      body = {
        model: config.openaiModel || DEFAULT_CONFIG.openaiModel,
        messages,
        temperature,
        max_tokens,
      };
      break;

    case "anthropic": {
      url = "https://api.anthropic.com/v1/messages";
      headers = {
        "Content-Type": "application/json",
        "x-api-key": config.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      };
      // Anthropic messages format is slightly different (system is a separate field)
      const systemMessage = messages.find((m) => m.role === "system")?.content;
      const userMessages = messages.filter((m) => m.role !== "system");
      body = {
        model: config.anthropicModel || DEFAULT_CONFIG.anthropicModel,
        system: systemMessage,
        messages: userMessages,
        max_tokens,
        temperature,
      };
      break;
    }

    case "ollama":
      url = `${config.ollamaUrl || "http://localhost:11434"}/api/chat`;
      headers = { "Content-Type": "application/json" };
      body = {
        model: config.ollamaModel,
        messages,
        temperature,
        stream: false,
        // Keep the model loaded between calls so repeated commit
        // generation doesn't pay a cold-start reload each time.
        keep_alive: "30m",
        // Reasoning models (e.g. Qwen 3.5) spend all their token budget on
        // a huge "thinking" block and return empty content, taking ~50s per
        // call. Disabling thinking makes them answer directly and fast.
        think: false,
        options: {
          // Bound generation so the model doesn't ramble, and give the
          // context enough room so a large diff is not silently truncated.
          num_predict: max_tokens,
          num_ctx: 4096,
        },
      };
      break;

    case "openrouter":
      url = "https://openrouter.ai/api/v1/chat/completions";
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.openrouterApiKey}`,
        "HTTP-Referer": "https://github.com/eckra/eckra",
        "X-Title": "Eckra",
      };
      body = {
        model: config.openrouterModel || DEFAULT_CONFIG.openrouterModel,
        messages,
        temperature,
        max_tokens,
      };
      break;

    case "gemini": {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel || DEFAULT_CONFIG.geminiModel}:generateContent`;
      headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": config.geminiApiKey,
      };
      // Gemini uses a different message format
      const geminiContents = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));
      const geminiSystemInstruction = messages.find(
        (m) => m.role === "system"
      )?.content;
      body = {
        contents: geminiContents,
        generationConfig: {
          temperature,
          maxOutputTokens: max_tokens,
        },
      };
      if (geminiSystemInstruction) {
        body.systemInstruction = { parts: [{ text: geminiSystemInstruction }] };
      }
      break;
    }

    case "lmstudio":
    default:
      url = `${config.lmStudioUrl || "http://localhost:1234"}/v1/chat/completions`;
      headers = { "Content-Type": "application/json" };
      body = {
        model: config.model,
        messages,
        temperature,
        max_tokens,
        stream: false,
      };
      break;

    case "opencodego":
      url = "https://opencode.ai/zen/go/v1/chat/completions";
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.opencodeGoApiKey}`,
      };
      body = {
        model: config.opencodeGoModel || DEFAULT_CONFIG.opencodeGoModel,
        messages,
        temperature,
        max_tokens,
      };
      break;

    case "deepseek":
      url = "https://api.deepseek.com/chat/completions";
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.deepseekApiKey}`,
      };
      body = {
        model: config.deepseekModel || DEFAULT_CONFIG.deepseekModel,
        messages,
        temperature,
        max_tokens,
      };
      break;

    case "bedrock":
      url = `https://bedrock-runtime.${config.bedrockRegion || DEFAULT_CONFIG.bedrockRegion}.amazonaws.com/v1/chat/completions`;
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.bedrockApiKey}`,
      };
      body = {
        model: config.bedrockModel || DEFAULT_CONFIG.bedrockModel,
        messages,
        temperature,
        max_tokens,
      };
      break;

    case "bedrockmantle":
      url = `https://bedrock-mantle.${config.bedrockMantleRegion || DEFAULT_CONFIG.bedrockMantleRegion}.api.aws/v1/chat/completions`;
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.bedrockMantleApiKey}`,
      };
      body = {
        model: config.bedrockMantleModel || DEFAULT_CONFIG.bedrockMantleModel,
        messages,
        temperature,
        max_tokens,
      };
      break;

    case "ollamacloud":
      url = "https://ollama.com/v1/chat/completions";
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.ollamaCloudApiKey}`,
      };
      body = {
        model: config.ollamaCloudModel || DEFAULT_CONFIG.ollamaCloudModel,
        messages,
        temperature,
        max_tokens,
      };
      break;
  }

  try {
    const response = await axios.post(url, body, {
      headers,
      timeout: config.timeout || DEFAULT_CONFIG.timeout,
    });

    let content = "";
    if (provider === "anthropic") {
      const blocks = response.data.content;
      content = Array.isArray(blocks) && blocks[0] ? blocks[0].text || "" : "";
      if (!content) {
        throw new Error(
          "AI Provider (anthropic) returned no text. This might be due to a tool-use response, invalid model name, or safety filters."
        );
      }
    } else if (provider === "ollama") {
      content = response.data.message
        ? response.data.message.content || ""
        : "";
      if (!content) {
        throw new Error(
          "AI Provider (ollama) returned no response. Check that the model is loaded and the model name is valid."
        );
      }
    } else if (provider === "gemini") {
      const candidates = response.data.candidates;
      const parts =
        candidates &&
        candidates[0] &&
        candidates[0].content &&
        candidates[0].content.parts;
      content = parts && parts[0] ? parts[0].text || "" : "";
      if (!content) {
        throw new Error(
          `AI Provider (gemini) returned no candidates. This might be due to an invalid model name (${config.geminiModel || DEFAULT_CONFIG.geminiModel}), insufficient credits, or safety filters.`
        );
      }
    } else {
      if (!response.data.choices || response.data.choices.length === 0) {
        const modelLabels = {
          openai: config.openaiModel,
          openrouter: config.openrouterModel || DEFAULT_CONFIG.openrouterModel,
          opencodego: config.opencodeGoModel || DEFAULT_CONFIG.opencodeGoModel,
          deepseek: config.deepseekModel || DEFAULT_CONFIG.deepseekModel,
          bedrock: config.bedrockModel || DEFAULT_CONFIG.bedrockModel,
          bedrockmantle:
            config.bedrockMantleModel || DEFAULT_CONFIG.bedrockMantleModel,
          ollamacloud:
            config.ollamaCloudModel || DEFAULT_CONFIG.ollamaCloudModel,
        };
        throw new Error(
          `AI Provider (${provider}) returned no choices. This might be due to an invalid model name (${modelLabels[provider] || "unknown"}), insufficient credits, or safety filters.`
        );
      }
      content = response.data.choices[0].message.content;
    }

    return (content || "").toString().trim();
  } catch (error) {
    if (error.response) {
      throw new Error(
        `AI Provider Error (${provider}): ${error.response.status} - ${JSON.stringify(error.response.data)}`
      );
    }
    throw error;
  }
}

/**
 * Generate commit message using the configured AI provider
 */
async function generateCommitMessage(diff, filesList, options = {}) {
  const config = getConfig();
  const type = resolveCommitType(options.type);
  const maxLength =
    options.maxLength ||
    config.subjectMaxLength ||
    DEFAULT_CONFIG.subjectMaxLength;
  const instructionText = config.aiInstruction
    ? `\nIMPORTANT USER INSTRUCTION: ${config.aiInstruction}\n`
    : "";
  const localeText =
    config.locale && config.locale !== "en"
      ? `\nWrite the commit message in the "${config.locale}" language.\n`
      : "";

  const prompt = `You are a Git commit message generator. Based on the following changes${config.aiInstruction ? " and the user instruction" : ""}, create a professional commit message.
${instructionText}
${localeText}
${getConventionalTypesBlock(type)}
Changed files:
${filesList.join("\n")}

Diff:
${formatDiffForPrompt(diff)}

Write a commit message in the following format:
${getCommitFormatBlock(type, maxLength)}

Write only the commit message, no explanations.`;

  const messages = [
    {
      role: "system",
      content:
        "You are a helpful assistant that generates professional Git commit messages.",
    },
    {
      role: "user",
      content: prompt,
    },
  ];

  let message = await callProvider(config.aiProvider, messages, 0.3, 400);

  message = message.replace(/^["']|["']$/g, "");
  message = message.trim();

  const lines = message.split("\n").map((line) => line.trimEnd());

  if (lines.length > 0 && lines[0].length > maxLength) {
    lines[0] = lines[0].substring(0, maxLength);
  }

  return lines.join("\n");
}

/**
 * Generate multiple commit message suggestions
 */
async function generateCommitSuggestions(
  diff,
  filesList,
  count = 3,
  instruction = null,
  options = {}
) {
  const config = getConfig();
  const type = resolveCommitType(options.type);
  const maxLength =
    options.maxLength ||
    config.subjectMaxLength ||
    DEFAULT_CONFIG.subjectMaxLength;
  const activeInstruction = instruction || config.aiInstruction;

  let instructionText = "";
  if (activeInstruction) {
    instructionText = `\nIMPORTANT USER INSTRUCTION: ${activeInstruction}\n`;
  }
  const localeText =
    config.locale && config.locale !== "en"
      ? `\nWrite the commit message in the "${config.locale}" language.\n`
      : "";

  const prompt = `You are a Git commit message generator. Based on the following changes${activeInstruction ? " and the user instruction" : ""}, suggest ${count} different commit messages.
${instructionText}
${localeText}
${getConventionalTypesBlock(type)}
Changed files:
${filesList.join("\n")}

Diff:
${formatDiffForPrompt(diff)}

CRITICAL FORMAT REQUIREMENTS:
Each suggestion MUST follow this format:
${getCommitFormatBlock(type, maxLength)}

Write exactly ${count} suggestions following this format. Separate each with "---" on its own line.`;

  const messages = [
    {
      role: "system",
      content:
        "You are a professional Git commit message writer. Follow the requested format precisely.",
    },
    {
      role: "user",
      content: prompt,
    },
  ];

  let lastError = null;
  const maxRetries = 2;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const content = await callProvider(
        config.aiProvider,
        messages,
        0.7,
        1000
      );

      if (!content || content.trim().length < 10) {
        throw new Error(
          `AI Provider (${config.aiProvider}) returned empty or too short response: "${content}"`
        );
      }

      const blocks = content
        .split(/^---$/m)
        .map((b) => b.trim())
        .filter((b) => b.length > 0);

      const suggestions = blocks
        .map((block) => {
          const lines = block.split("\n").map((line) => line.trimEnd());

          if (lines.length > 0 && lines[0].length > maxLength) {
            lines[0] = lines[0].substring(0, maxLength);
          }

          return lines.join("\n");
        })
        .slice(0, count);

      if (suggestions.length === 0) {
        const lines = content.split("\n").map((l) => l.trimEnd());
        if (lines.length > 0 && lines[0].length > 5) {
          return [lines.join("\n").substring(0, 200)];
        }
        throw new Error(
          `AI returned suggestions that couldn't be parsed. Raw response: "${content.substring(0, 100)}${content.length > 100 ? "..." : ""}"`
        );
      }

      return suggestions;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  throw lastError;
}

/**
 * Test a provider connection with given config values (before saving)
 */
async function testProviderConnection(provider, providerConfig) {
  try {
    if (provider === "lmstudio") {
      const url =
        normalizeUrl(providerConfig.lmStudioUrl) || "http://localhost:1234";
      await axios.get(`${url}/v1/models`, { timeout: 5000 });
      return { connected: true };
    } else if (provider === "ollama") {
      const url =
        normalizeUrl(providerConfig.ollamaUrl) || "http://localhost:11434";
      await axios.get(`${url}/api/tags`, { timeout: 5000 });
      return { connected: true };
    } else if (provider === "openai") {
      const apiKey = providerConfig.openaiApiKey;
      if (!apiKey) return { connected: false, error: "API Key is missing" };
      await axios.get("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 5000,
      });
      return { connected: true };
    } else if (provider === "anthropic") {
      const apiKey = providerConfig.anthropicApiKey;
      if (!apiKey) return { connected: false, error: "API Key is missing" };
      // Anthropic doesn't have a free list endpoint; send a minimal real request
      await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
          model: providerConfig.anthropicModel || DEFAULT_CONFIG.anthropicModel,
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        },
        {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          timeout: 8000,
        }
      );
      return { connected: true };
    } else if (provider === "openrouter") {
      const apiKey = providerConfig.openrouterApiKey;
      if (!apiKey) return { connected: false, error: "API Key is missing" };
      await axios.get("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 5000,
      });
      return { connected: true };
    } else if (provider === "gemini") {
      const apiKey = providerConfig.geminiApiKey;
      if (!apiKey) return { connected: false, error: "API Key is missing" };
      await axios.get(
        `https://generativelanguage.googleapis.com/v1beta/models`,
        {
          headers: { "x-goog-api-key": apiKey },
          timeout: 5000,
        }
      );
      return { connected: true };
    } else if (provider === "opencodego") {
      const apiKey = providerConfig.opencodeGoApiKey;
      if (!apiKey) return { connected: false, error: "API Key is missing" };
      await axios.get("https://opencode.ai/zen/go/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 8000,
      });
      return { connected: true };
    } else if (provider === "deepseek") {
      const apiKey = providerConfig.deepseekApiKey;
      if (!apiKey) return { connected: false, error: "API Key is missing" };
      await axios.get("https://api.deepseek.com/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 8000,
      });
      return { connected: true };
    } else if (provider === "bedrock") {
      const apiKey = providerConfig.bedrockApiKey;
      if (!apiKey) return { connected: false, error: "API Key is missing" };
      const region =
        providerConfig.bedrockRegion || DEFAULT_CONFIG.bedrockRegion;
      await axios.get(
        `https://bedrock-runtime.${region}.amazonaws.com/v1/models`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 8000,
        }
      );
      return { connected: true };
    } else if (provider === "bedrockmantle") {
      const apiKey = providerConfig.bedrockMantleApiKey;
      if (!apiKey) return { connected: false, error: "API Key is missing" };
      const region =
        providerConfig.bedrockMantleRegion ||
        DEFAULT_CONFIG.bedrockMantleRegion;
      await axios.get(`https://bedrock-mantle.${region}.api.aws/v1/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 8000,
      });
      return { connected: true };
    } else if (provider === "ollamacloud") {
      const apiKey = providerConfig.ollamaCloudApiKey;
      if (!apiKey) return { connected: false, error: "API Key is missing" };
      await axios.get("https://ollama.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 8000,
      });
      return { connected: true };
    }
    return { connected: true };
  } catch (error) {
    const msg = error.response
      ? `${error.response.status} - ${JSON.stringify(error.response.data).slice(0, 100)}`
      : error.message;
    return { connected: false, error: msg };
  }
}

let _aiConnectionCache = new Map();

function aiConnectionCacheKey(config) {
  const provider = config.aiProvider || "ollama";
  const fields = {
    lmstudio: config.lmStudioUrl,
    ollama: config.ollamaUrl,
    openai: config.openaiApiKey,
    anthropic: config.anthropicApiKey,
    openrouter: config.openrouterApiKey,
    gemini: config.geminiApiKey,
    opencodego: config.opencodeGoApiKey,
    deepseek: config.deepseekApiKey,
    bedrock: `${config.bedrockApiKey}|${config.bedrockRegion}`,
    bedrockmantle: `${config.bedrockMantleApiKey}|${config.bedrockMantleRegion}`,
    ollamacloud: config.ollamaCloudApiKey,
  };
  return `${provider}|${fields[provider] || ""}`;
}

/**
 * Check if the configured AI provider is available.
 * Results are cached for the session and keyed by provider + credentials,
 * so repeated opens (e.g. Settings) don't hit the network every time.
 */
async function checkAIConnection() {
  const config = getConfig();
  const key = aiConnectionCacheKey(config);
  if (_aiConnectionCache.has(key)) return _aiConnectionCache.get(key);

  const provider = config.aiProvider || "ollama";
  let result;

  try {
    if (provider === "lmstudio") {
      const response = await axios.get(`${config.lmStudioUrl}/v1/models`, {
        timeout: 5000,
      });
      result = { connected: true, models: response.data?.data || [] };
    } else if (provider === "ollama") {
      const response = await axios.get(`${config.ollamaUrl}/api/tags`, {
        timeout: 5000,
      });
      result = { connected: true, models: response.data?.models || [] };
    } else if (provider === "openai") {
      if (!config.openaiApiKey) {
        result = { connected: false, error: "OpenAI API Key is missing" };
      } else {
        // Simple check by listing models
        const response = await axios.get("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${config.openaiApiKey}` },
          timeout: 5000,
        });
        result = { connected: true, models: response.data?.data || [] };
      }
    } else if (provider === "anthropic") {
      const check = await testProviderConnection("anthropic", config);
      if (!check.connected) {
        result = check;
      } else {
        result = {
          connected: true,
          note: "Anthropic connection verified with a minimal request",
        };
      }
    } else if (provider === "openrouter") {
      if (!config.openrouterApiKey) {
        result = { connected: false, error: "OpenRouter API Key is missing" };
      } else {
        const response = await axios.get(
          "https://openrouter.ai/api/v1/models",
          {
            headers: { Authorization: `Bearer ${config.openrouterApiKey}` },
            timeout: 5000,
          }
        );
        result = { connected: true, models: response.data?.data || [] };
      }
    } else if (provider === "gemini") {
      if (!config.geminiApiKey) {
        result = {
          connected: false,
          error: "Google Gemini API Key is missing",
        };
      } else {
        const response = await axios.get(
          `https://generativelanguage.googleapis.com/v1beta/models`,
          {
            headers: { "x-goog-api-key": config.geminiApiKey },
            timeout: 5000,
          }
        );
        result = { connected: true, models: response.data?.models || [] };
      }
    } else if (provider === "opencodego") {
      if (!config.opencodeGoApiKey) {
        result = { connected: false, error: "OpenCode Go API Key is missing" };
      } else {
        const response = await axios.get(
          "https://opencode.ai/zen/go/v1/models",
          {
            headers: { Authorization: `Bearer ${config.opencodeGoApiKey}` },
            timeout: 5000,
          }
        );
        result = { connected: true, models: response.data?.data || [] };
      }
    } else if (provider === "deepseek") {
      if (!config.deepseekApiKey) {
        result = { connected: false, error: "DeepSeek API Key is missing" };
      } else {
        const response = await axios.get("https://api.deepseek.com/models", {
          headers: { Authorization: `Bearer ${config.deepseekApiKey}` },
          timeout: 5000,
        });
        result = { connected: true, models: response.data?.data || [] };
      }
    } else if (provider === "bedrock") {
      if (!config.bedrockApiKey) {
        result = {
          connected: false,
          error: "Amazon Bedrock API Key is missing",
        };
      } else {
        const region = config.bedrockRegion || DEFAULT_CONFIG.bedrockRegion;
        const response = await axios.get(
          `https://bedrock-runtime.${region}.amazonaws.com/v1/models`,
          {
            headers: { Authorization: `Bearer ${config.bedrockApiKey}` },
            timeout: 8000,
          }
        );
        result = { connected: true, models: response.data?.data || [] };
      }
    } else if (provider === "bedrockmantle") {
      if (!config.bedrockMantleApiKey) {
        result = {
          connected: false,
          error: "Amazon Bedrock Mantle API Key is missing",
        };
      } else {
        const region =
          config.bedrockMantleRegion || DEFAULT_CONFIG.bedrockMantleRegion;
        const response = await axios.get(
          `https://bedrock-mantle.${region}.api.aws/v1/models`,
          {
            headers: { Authorization: `Bearer ${config.bedrockMantleApiKey}` },
            timeout: 8000,
          }
        );
        result = { connected: true, models: response.data?.data || [] };
      }
    } else if (provider === "ollamacloud") {
      if (!config.ollamaCloudApiKey) {
        result = { connected: false, error: "Ollama Cloud API Key is missing" };
      } else {
        const response = await axios.get("https://ollama.com/v1/models", {
          headers: { Authorization: `Bearer ${config.ollamaCloudApiKey}` },
          timeout: 5000,
        });
        result = { connected: true, models: response.data?.data || [] };
      }
    } else {
      result = { connected: true };
    }
  } catch (error) {
    result = { connected: false, error: error.message };
  }

  _aiConnectionCache.set(key, result);
  return result;
}

/**
 * Clear the in-session connection cache (used when credentials change or in tests)
 */
function resetAIConnectionCache() {
  _aiConnectionCache.clear();
}

const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;
let _modelCache = new Map();

/**
 * Build a cache key for a provider model list (credential = api key or base URL)
 */
function modelCacheKey(provider, credential = "") {
  return `${provider}|${credential || ""}`;
}

function getCachedModels(key) {
  const entry = _modelCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > MODEL_CACHE_TTL_MS) {
    _modelCache.delete(key);
    return null;
  }
  return entry.models;
}

/**
 * Only successful (non-empty) model lists are cached so transient failures retry
 * on the next config open.
 */
function setCachedModels(key, models) {
  if (Array.isArray(models) && models.length > 0) {
    _modelCache.set(key, { timestamp: Date.now(), models });
  }
}

/**
 * Clear the model-list cache (used when providers/models change or in tests)
 */
function resetModelCache() {
  _modelCache.clear();
}

/**
 * Fetch available models from OpenRouter API
 */
async function fetchOpenRouterModels(apiKey) {
  const key = modelCacheKey("openrouter", apiKey);
  const cached = getCachedModels(key);
  if (cached) return cached;
  try {
    const headers = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    const response = await axios.get("https://openrouter.ai/api/v1/models", {
      headers,
      timeout: 10000,
    });
    const models = response.data?.data || [];
    const result = models.map((m) => ({
      id: m.id,
      name: m.name || m.id,
      pricing: m.pricing,
    }));
    setCachedModels(key, result);
    return result;
  } catch {
    return [];
  }
}

/**
 * Fetch available models from OpenAI API
 */
async function fetchOpenAIModels(apiKey) {
  const key = modelCacheKey("openai", apiKey);
  const cached = getCachedModels(key);
  if (cached) return cached;
  try {
    const response = await axios.get("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 10000,
    });
    const models = response.data?.data || [];
    const result = models
      .map((m) => ({ id: m.id, name: m.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
    setCachedModels(key, result);
    return result;
  } catch {
    return [];
  }
}

/**
 * Fetch available models from Anthropic (hardcoded list, no public API)
 */
async function fetchAnthropicModels() {
  const key = modelCacheKey("anthropic");
  const cached = getCachedModels(key);
  if (cached) return cached;
  const models = [
    { id: "claude-opus-4-8", name: "Claude Opus 4.8" },
    { id: "claude-opus-4-7", name: "Claude Opus 4.7" },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
    { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
    { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
  ];
  setCachedModels(key, models);
  return models;
}

/**
 * Fetch available models from Google Gemini API
 */
async function fetchGeminiModels(apiKey) {
  const key = modelCacheKey("gemini", apiKey);
  const cached = getCachedModels(key);
  if (cached) return cached;
  try {
    const response = await axios.get(
      "https://generativelanguage.googleapis.com/v1beta/models",
      {
        headers: { "x-goog-api-key": apiKey },
        timeout: 10000,
      }
    );
    const models = response.data?.models || [];
    const result = models
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => {
        const id = m.name.replace("models/", "");
        return { id, name: m.displayName || id };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    setCachedModels(key, result);
    return result;
  } catch {
    return [];
  }
}

/**
 * Fetch available models from Ollama
 */
async function fetchOllamaModels(url) {
  const baseUrl = normalizeUrl(url) || "http://localhost:11434";
  const key = modelCacheKey("ollama", baseUrl);
  const cached = getCachedModels(key);
  if (cached) return cached;
  try {
    const response = await axios.get(`${baseUrl}/api/tags`, { timeout: 10000 });
    const models = response.data?.models || [];
    const result = models
      .map((m) => ({ id: m.name, name: m.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    setCachedModels(key, result);
    return result;
  } catch {
    return [];
  }
}

/**
 * Fetch available models from LM Studio
 */
async function fetchLMStudioModels(url) {
  const baseUrl = normalizeUrl(url) || "http://localhost:1234";
  const key = modelCacheKey("lmstudio", baseUrl);
  const cached = getCachedModels(key);
  if (cached) return cached;
  try {
    const response = await axios.get(`${baseUrl}/v1/models`, {
      timeout: 10000,
    });
    const models = response.data?.data || [];
    const result = models
      .map((m) => ({ id: m.id, name: m.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
    setCachedModels(key, result);
    return result;
  } catch {
    return [];
  }
}

/**
 * Fetch available models from OpenCode Go
 */
async function fetchOpenCodeGoModels(apiKey) {
  const key = modelCacheKey("opencodego", apiKey);
  const cached = getCachedModels(key);
  if (cached) return cached;
  try {
    const response = await axios.get("https://opencode.ai/zen/go/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 10000,
    });
    const models = response.data?.data || [];
    const result = models
      .map((m) => ({ id: m.id, name: m.name || m.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
    setCachedModels(key, result);
    return result;
  } catch {
    return [];
  }
}

/**
 * Fetch available models from DeepSeek
 */
async function fetchDeepSeekModels(apiKey) {
  const key = modelCacheKey("deepseek", apiKey);
  const cached = getCachedModels(key);
  if (cached) return cached;
  try {
    const response = await axios.get("https://api.deepseek.com/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 10000,
    });
    const models = response.data?.data || [];
    const result = models
      .map((m) => ({ id: m.id, name: m.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
    setCachedModels(key, result);
    return result;
  } catch {
    return [];
  }
}

/**
 * Build the OpenAI-compatible base URL for a Bedrock endpoint
 * (`runtime` = bedrock-runtime, `mantle` = bedrock-mantle)
 */
function bedrockBaseUrl(region, endpoint) {
  if (endpoint === "mantle") {
    return `https://bedrock-mantle.${region}.api.aws/v1`;
  }
  return `https://bedrock-runtime.${region}.amazonaws.com/v1`;
}

/**
 * Fetch available models from Amazon Bedrock (runtime or mantle endpoint)
 */
async function fetchBedrockModels(region, apiKey, endpoint = "runtime") {
  const normalizedEndpoint = endpoint === "mantle" ? "mantle" : "runtime";
  const regionValue = region || DEFAULT_CONFIG.bedrockRegion;
  const baseUrl = bedrockBaseUrl(regionValue, normalizedEndpoint);
  const key = modelCacheKey("bedrock", baseUrl);
  const cached = getCachedModels(key);
  if (cached) return cached;
  try {
    const response = await axios.get(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 10000,
    });
    const models = response.data?.data || [];
    const result = models
      .map((m) => ({ id: m.id, name: m.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
    setCachedModels(key, result);
    return result;
  } catch {
    return [];
  }
}

/**
 * Fetch available models from Ollama Cloud
 */
async function fetchOllamaCloudModels(apiKey) {
  const key = modelCacheKey("ollamacloud", apiKey);
  const cached = getCachedModels(key);
  if (cached) return cached;
  try {
    const response = await axios.get("https://ollama.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 10000,
    });
    const models = response.data?.data || [];
    const result = models
      .map((m) => ({ id: m.id, name: m.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
    setCachedModels(key, result);
    return result;
  } catch {
    return [];
  }
}

/**
 * Generate a human-readable story/timeline from commit history
 */
async function generateTimeline(commits) {
  const config = getConfig();

  const commitLines = commits.map((c) => {
    const date = new Date(c.date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    return `[${c.hash.substring(0, 7)}] ${date} by ${c.author_name}: ${c.message.split("\n")[0]}`;
  });

  const prompt = `You are a software historian. Below is the git commit history of a project in chronological order (most recent first). Analyze these commits and craft an engaging, human-readable timeline that tells the story of this project.

Format your response in these sections:

## Timeline
A chronological narrative (oldest to newest) that groups related commits into logical phases or milestones. Tell the story naturally — as if explaining the project's evolution to a new team member. For example: "The project started with basic authentication and user management. Then, the team focused on fixing critical bugs in the login flow before shipping the CI/CD pipeline..."

## Key Milestones
- Brief bullet points of the most significant turning points

## Contributors
- List unique contributors and their primary focus areas

## Patterns & Insights
- 2-3 observations about the development patterns (e.g., "frequent refactoring suggests iterative design", "many hotfix commits indicate reactive rather than planned development")

Commit history (${commits.length} commits):

${commitLines.join("\n")}

Write in a natural, narrative tone. Keep each section concise and scannable.`;

  const messages = [
    {
      role: "system",
      content:
        "You are a software historian who crafts clear, engaging narratives from git commit histories. You help developers understand the story and evolution of a codebase at a glance.",
    },
    {
      role: "user",
      content: prompt,
    },
  ];

  const content = await callProvider(config.aiProvider, messages, 0.7, 2000);
  return content;
}

module.exports = {
  COMMIT_FORMATS,
  resolveCommitType,
  formatDiffForPrompt,
  generateCommitMessage,
  generateCommitSuggestions,
  generateTimeline,
  checkAIConnection,
  resetAIConnectionCache,
  resetModelCache,
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
};
