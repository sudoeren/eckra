const axios = require("axios");
const { getConfig } = require("./config");

/**
 * Generate commit message using LM Studio
 */
async function generateCommitMessage(diff, filesList) {
  const config = getConfig();

  const prompt = `You are a Git commit message generator. Based on the following changes, create a short, descriptive commit message in Conventional Commits format.

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

  try {
    const response = await axios.post(
      `${config.lmStudioUrl}/v1/chat/completions`,
      {
        model: config.model,
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that generates concise and meaningful Git commit messages following Conventional Commits specification.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 100,
        stream: false,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );

    if (response.data && response.data.choices && response.data.choices[0]) {
      let message = response.data.choices[0].message.content.trim();
      // Clean up the message
      message = message.replace(/^["']|["']$/g, "");
      message = message.split("\n")[0]; // Take only first line
      return message;
    }

    throw new Error("Invalid response from LM Studio");
  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      throw new Error(
        `Could not connect to LM Studio. Please make sure LM Studio is running at ${config.lmStudioUrl}.`,
      );
    }
    if (error.response) {
      throw new Error(
        `LM Studio error: ${error.response.status} - ${error.response.statusText}`,
      );
    }
    throw error;
  }
}

/**
 * Check if LM Studio is available
 */
async function checkLMStudioConnection() {
  const config = getConfig();

  try {
    const response = await axios.get(`${config.lmStudioUrl}/v1/models`, {
      timeout: 5000,
    });
    return {
      connected: true,
      models: response.data?.data || [],
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message,
    };
  }
}

/**
 * Generate multiple commit message suggestions
 */
async function generateCommitSuggestions(diff, filesList, count = 3) {
  const config = getConfig();

  const prompt = `You are a Git commit message generator. Based on the following changes, suggest ${count} different commit messages. Each should be in Conventional Commits format.

Changed files:
${filesList.join("\n")}

Diff:
${diff.substring(0, 3000)}

Write ${count} different commit messages, each on a new line. Write only the messages, do not add numbers or explanations.`;

  try {
    const response = await axios.post(
      `${config.lmStudioUrl}/v1/chat/completions`,
      {
        model: config.model,
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that generates concise and meaningful Git commit messages.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 200,
        stream: false,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );

    if (response.data && response.data.choices && response.data.choices[0]) {
      let content = response.data.choices[0].message.content.trim();

      // Clean backtick blocks
      content = content.replace(/```[\s\S]*?```/g, "");
      content = content.replace(/`/g, "");

      const suggestions = content
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

      // If empty, provide default suggestions
      if (suggestions.length === 0) {
        return [
          "chore: update files",
          "refactor: improve code",
          "feat: add changes",
        ];
      }

      return suggestions;
    }

    throw new Error("Invalid response from LM Studio");
  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      throw new Error(`Could not connect to LM Studio.`);
    }
    throw error;
  }
}

module.exports = {
  generateCommitMessage,
  checkLMStudioConnection,
  generateCommitSuggestions,
};
