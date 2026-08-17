const axios = require("axios");
const { getConfig, DEFAULT_CONFIG, normalizeUrl } = require("./config");

const MAX_DIFF_CHARS = 2000;

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
  }

  try {
    const response = await axios.post(url, body, { headers, timeout: 30000 });

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
async function generateCommitMessage(diff, filesList) {
  const config = getConfig();
  const instructionText = config.aiInstruction
    ? `\nIMPORTANT USER INSTRUCTION: ${config.aiInstruction}\n`
    : "";

  const prompt = `You are a Git commit message generator. Based on the following changes${config.aiInstruction ? " and the user instruction" : ""}, create a professional commit message in Conventional Commits format.
${instructionText}
Conventional Commits format:
- feat: A new feature
- fix: A bug fix
- docs: Documentation only changes
- style: Changes that do not affect the code (whitespace, formatting, missing semicolons, etc.)
- refactor: Code change that neither fixes a bug nor adds a feature
- perf: Code change that improves performance
- test: Adding missing tests or correcting existing tests
- chore: Changes to the build process or auxiliary tools

Changed files:
${filesList.join("\n")}

Diff:
${formatDiffForPrompt(diff)}

Write a commit message in the following format:

1. **Subject line** (first line): Type, scope (optional), and brief description. Max 50 characters. Use imperative mood ("add" not "added").

2. **Blank line**

3. **Body** (optional but recommended): Explain WHAT changed and WHY. Wrap at 72 characters. Use bullet points for multiple changes.

Example:
feat: add autocomplete search for providers

- Implement type-to-search in provider selection
- Fetch models from each provider's API
- Add fallback to manual input when API fails

Write only the commit message, no explanations.`;

  const messages = [
    {
      role: "system",
      content:
        "You are a helpful assistant that generates professional Git commit messages following Conventional Commits specification. Always include a subject line and a detailed body explaining the changes.",
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

  if (lines.length > 0 && lines[0].length > 50) {
    lines[0] = lines[0].substring(0, 50);
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
  instruction = null
) {
  const config = getConfig();
  const activeInstruction = instruction || config.aiInstruction;

  let instructionText = "";
  if (activeInstruction) {
    instructionText = `\nIMPORTANT USER INSTRUCTION: ${activeInstruction}\n`;
  }

  const prompt = `You are a Git commit message generator. Based on the following changes${activeInstruction ? " and the user instruction" : ""}, suggest ${count} different commit messages. Each MUST follow Conventional Commits format with a detailed body.
${instructionText}
Changed files:
${filesList.join("\n")}

Diff:
${formatDiffForPrompt(diff)}

CRITICAL FORMAT REQUIREMENTS:
Each suggestion MUST have:
1. Subject line (max 50 chars): type(scope): brief description
2. Empty line
3. Body section with 2-4 bullet points explaining WHAT changed and WHY

EXAMPLE 1:
feat(auth): add JWT token validation

- Implement token verification middleware
- Add refresh token rotation for security
- Store tokens in httpOnly cookies

EXAMPLE 2:
fix(ui): resolve dark mode contrast issues

- Update color palette for better accessibility
- Add CSS variables for theme switching
- Test with WCAG 2.1 AA standards

EXAMPLE 3:
refactor(api): optimize database queries

- Add indexes for frequently queried fields
- Implement query caching with Redis
- Reduce response time by 40%

Write exactly ${count} suggestions following this format. Separate each with "---" on its own line. Do NOT write single-line messages.`;

  const messages = [
    {
      role: "system",
      content:
        "You are a professional Git commit message writer. ALWAYS generate multi-line messages with a subject and detailed body. Never write single-line commits.",
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

          if (lines.length > 0 && lines[0].length > 50) {
            lines[0] = lines[0].substring(0, 50);
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
};
