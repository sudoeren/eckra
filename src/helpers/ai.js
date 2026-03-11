const axios = require("axios");
const { getConfig } = require("./config");

/**
 * Call the selected AI provider
 */
async function callProvider(provider, messages, temperature = 0.3, max_tokens = 100) {
  const config = getConfig();
  let url, headers, body;

  switch (provider) {
    case "openai":
      url = "https://api.openai.com/v1/chat/completions";
      headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.openaiApiKey}`,
      };
      body = {
        model: config.openaiModel || "gpt-4o",
        messages,
        temperature,
        max_tokens,
      };
      break;

    case "anthropic":
      url = "https://api.anthropic.com/v1/messages";
      headers = {
        "Content-Type": "application/json",
        "x-api-key": config.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      };
      // Anthropic messages format is slightly different (system is a separate field)
      const systemMessage = messages.find(m => m.role === "system")?.content;
      const userMessages = messages.filter(m => m.role !== "system");
      body = {
        model: config.anthropicModel || "claude-3-5-sonnet-20240620",
        system: systemMessage,
        messages: userMessages,
        max_tokens,
        temperature,
      };
      break;

    case "ollama":
      url = `${config.ollamaUrl || "http://localhost:11434"}/api/chat`;
      headers = { "Content-Type": "application/json" };
      body = {
        model: config.ollamaModel || "llama3",
        messages,
        temperature,
        stream: false,
      };
      break;

    case "openrouter":
      url = "https://openrouter.ai/api/v1/chat/completions";
      headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.openrouterApiKey}`,
        "HTTP-Referer": "https://github.com/eckra/eckra",
        "X-Title": "Eckra",
      };
      body = {
        model: config.openrouterModel || "openai/gpt-4o",
        messages,
        temperature,
        max_tokens,
      };
      break;

    case "gemini":
      url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel || "gemini-2.0-flash"}:generateContent?key=${config.geminiApiKey}`;
      headers = { "Content-Type": "application/json" };
      // Gemini uses a different message format
      const geminiContents = messages
        .filter(m => m.role !== "system")
        .map(m => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));
      const geminiSystemInstruction = messages.find(m => m.role === "system")?.content;
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
      content = response.data.content[0].text;
    } else if (provider === "ollama") {
      content = response.data.message.content;
    } else if (provider === "gemini") {
      content = response.data.candidates[0].content.parts[0].text;
    } else {
      content = response.data.choices[0].message.content;
    }

    return content.trim();
  } catch (error) {
    if (error.response) {
      throw new Error(`AI Provider Error (${provider}): ${error.response.status} - ${JSON.stringify(error.response.data)}`);
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

  const prompt = `You are a Git commit message generator. Based on the following changes${config.aiInstruction ? " and the user instruction" : ""}, create a short, descriptive commit message in Conventional Commits format.
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
${diff.substring(0, 3000)}

Write only the commit message, do not add any other explanation. The message should be in English and should not exceed 72 characters.`;

  const messages = [
    {
      role: "system",
      content: "You are a helpful assistant that generates concise and meaningful Git commit messages following Conventional Commits specification.",
    },
    {
      role: "user",
      content: prompt,
    },
  ];

  let message = await callProvider(config.aiProvider, messages, 0.3, 100);
  
  // Clean up the message
  message = message.replace(/^["']|["']$/g, "");
  message = message.split("\n")[0]; // Take only first line
  return message;
}

/**
 * Generate multiple commit message suggestions
 */
async function generateCommitSuggestions(diff, filesList, count = 3, instruction = null) {
  const config = getConfig();
  const activeInstruction = instruction || config.aiInstruction;
  
  let instructionText = "";
  if (activeInstruction) {
    instructionText = `\nIMPORTANT USER INSTRUCTION: ${activeInstruction}\n`;
  }

  const prompt = `You are a Git commit message generator. Based on the following changes${activeInstruction ? " and the user instruction" : ""}, suggest ${count} different commit messages. Each should be in Conventional Commits format.
${instructionText}
Changed files:
${filesList.join("\n")}

Diff:
${diff.substring(0, 3000)}

Write ${count} different commit messages, each on a new line. Write only the messages, do not add numbers or explanations.`;

  const messages = [
    {
      role: "system",
      content: "You are a helpful assistant that generates concise and meaningful Git commit messages.",
    },
    {
      role: "user",
      content: prompt,
    },
  ];

  try {
    const content = await callProvider(config.aiProvider, messages, 0.7, 200);
    
    // Clean backtick blocks
    let cleanedContent = content.replace(/```[\s\S]*?```/g, "");
    cleanedContent = cleanedContent.replace(/`/g, "");

    const suggestions = cleanedContent
      .split("\n")
      .map((line) => {
        let cleaned = line
          .replace(/^\d+[\.)\-:]\s*/, "") // Remove numbers
          .replace(/^[-*]\s*/, "") // Remove list markers
          .replace(/^["']|["']$/g, "") // Remove quotes
          .trim();
        return cleaned;
      })
      .filter((line) => line.length > 5 && !line.startsWith("```"))
      .slice(0, count);

    if (suggestions.length === 0) {
      throw new Error("AI returned empty or invalid suggestions");
    }

    return suggestions;
  } catch (error) {
    // Re-throw the error so the UI can handle it
    throw error;
  }
}

/**
 * Check if the configured AI provider is available
 */
async function checkAIConnection() {
  const config = getConfig();
  const provider = config.aiProvider || "lmstudio";

  try {
    if (provider === "lmstudio") {
      const response = await axios.get(`${config.lmStudioUrl}/v1/models`, { timeout: 5000 });
      return { connected: true, models: response.data?.data || [] };
    } else if (provider === "ollama") {
      const response = await axios.get(`${config.ollamaUrl}/api/tags`, { timeout: 5000 });
      return { connected: true, models: response.data?.models || [] };
    } else if (provider === "openai") {
      if (!config.openaiApiKey) return { connected: false, error: "OpenAI API Key is missing" };
      // Simple check by listing models
      const response = await axios.get("https://api.openai.com/v1/models", {
        headers: { "Authorization": `Bearer ${config.openaiApiKey}` },
        timeout: 5000
      });
      return { connected: true, models: response.data?.data || [] };
    } else if (provider === "anthropic") {
        if (!config.anthropicApiKey) return { connected: false, error: "Anthropic API Key is missing" };
        return { connected: true, note: "Anthropic connection assumed (listing models not supported via simple GET)" };
    } else if (provider === "openrouter") {
      if (!config.openrouterApiKey) return { connected: false, error: "OpenRouter API Key is missing" };
      const response = await axios.get("https://openrouter.ai/api/v1/models", {
        headers: { "Authorization": `Bearer ${config.openrouterApiKey}` },
        timeout: 5000
      });
      return { connected: true, models: response.data?.data || [] };
    } else if (provider === "gemini") {
      if (!config.geminiApiKey) return { connected: false, error: "Google Gemini API Key is missing" };
      const response = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${config.geminiApiKey}`, {
        timeout: 5000
      });
      return { connected: true, models: response.data?.models || [] };
    }
    return { connected: true };
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

/**
 * Fetch available models from OpenRouter API
 */
async function fetchOpenRouterModels(apiKey) {
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
    return models.map(m => ({
      id: m.id,
      name: m.name || m.id,
      pricing: m.pricing,
    }));
  } catch (error) {
    return [];
  }
}

module.exports = {
  generateCommitMessage,
  generateCommitSuggestions,
  checkAIConnection,
  fetchOpenRouterModels,
  // Alias for backward compatibility
  checkLMStudioConnection: checkAIConnection,
};
