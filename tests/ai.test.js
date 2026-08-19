const axios = require("axios");
const {
  generateCommitMessage,
  generateCommitSuggestions,
  resolveCommitType,
  formatDiffForPrompt,
  checkAIConnection,
  resetAIConnectionCache,
  resetModelCache,
  fetchOpenAIModels,
  fetchOllamaModels,
  fetchDeepSeekModels,
  fetchBedrockModels,
  fetchOpenCodeGoModels,
  fetchOllamaCloudModels,
} = require("../src/helpers/ai");
const configHelper = require("../src/helpers/config");

jest.mock("axios");
jest.mock("../src/helpers/config");

describe("AI Helper", () => {
  const mockDiff = "diff content";
  const mockFiles = ["file1.js"];

  beforeEach(() => {
    jest.clearAllMocks();
    resetAIConnectionCache();
    resetModelCache();
  });

  test("should mark truncated diffs in prompts", () => {
    const formatted = formatDiffForPrompt("abcdef", 3);

    expect(formatted).toContain("abc");
    expect(formatted).toContain("Diff truncated: 3 characters omitted");
  });

  test("should call OpenAI API correctly", async () => {
    configHelper.getConfig.mockReturnValue({
      aiProvider: "openai",
      openaiApiKey: "sk-test",
      openaiModel: "gpt-4o",
    });

    axios.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: "feat: openai commit" } }],
      },
    });

    const message = await generateCommitMessage(mockDiff, mockFiles);

    expect(message).toBe("feat: openai commit");
    expect(axios.post).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        model: "gpt-4o",
        messages: expect.any(Array),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test",
        }),
      })
    );
  });

  test("should verify Anthropic connection with a minimal request", async () => {
    configHelper.getConfig.mockReturnValue({
      aiProvider: "anthropic",
      anthropicApiKey: "sk-ant-test",
      anthropicModel: "claude-3",
    });

    axios.post.mockResolvedValue({ data: { content: [{ text: "ok" }] } });

    const result = await checkAIConnection();

    expect(result.connected).toBe(true);
    expect(result.note).toContain("verified");
    expect(axios.post).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        model: "claude-3",
        max_tokens: 1,
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-api-key": "sk-ant-test",
        }),
      })
    );
  });

  test("should call Anthropic API correctly", async () => {
    configHelper.getConfig.mockReturnValue({
      aiProvider: "anthropic",
      anthropicApiKey: "sk-ant-test",
      anthropicModel: "claude-3",
    });

    axios.post.mockResolvedValue({
      data: {
        content: [{ text: "feat: anthropic commit" }],
      },
    });

    const message = await generateCommitMessage(mockDiff, mockFiles);

    expect(message).toBe("feat: anthropic commit");
    expect(axios.post).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        model: "claude-3",
        system: expect.any(String), // System prompt is separate in Anthropic
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-api-key": "sk-ant-test",
        }),
      })
    );
  });

  test("should call Ollama API correctly", async () => {
    configHelper.getConfig.mockReturnValue({
      aiProvider: "ollama",
      ollamaUrl: "http://localhost:11434",
      ollamaModel: "llama3",
    });

    axios.post.mockResolvedValue({
      data: {
        message: { content: "feat: ollama commit" },
      },
    });

    const message = await generateCommitMessage(mockDiff, mockFiles);

    expect(message).toBe("feat: ollama commit");
    expect(axios.post).toHaveBeenCalledWith(
      "http://localhost:11434/api/chat",
      expect.objectContaining({
        model: "llama3",
        stream: false,
        keep_alive: "30m",
        think: false,
        options: expect.objectContaining({
          num_predict: expect.any(Number),
          num_ctx: 4096,
        }),
      }),
      expect.any(Object)
    );
  });

  test("should handle API errors gracefully", async () => {
    configHelper.getConfig.mockReturnValue({ aiProvider: "openai" });

    axios.post.mockRejectedValue({
      response: { status: 401, data: { error: "Unauthorized" } },
    });

    await expect(generateCommitMessage(mockDiff, mockFiles)).rejects.toThrow(
      "AI Provider Error (openai): 401"
    );
  });

  test("should call OpenRouter API correctly", async () => {
    configHelper.getConfig.mockReturnValue({
      aiProvider: "openrouter",
      openrouterApiKey: "sk-or-test",
      openrouterModel: "openai/gpt-4o",
    });

    axios.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: "feat: openrouter commit" } }],
      },
    });

    const message = await generateCommitMessage(mockDiff, mockFiles);

    expect(message).toBe("feat: openrouter commit");
    expect(axios.post).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        model: "openai/gpt-4o",
        messages: expect.any(Array),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-or-test",
          "HTTP-Referer": "https://github.com/eckra/eckra",
          "X-Title": "Eckra",
        }),
      })
    );
  });

  test("should call Google Gemini API correctly", async () => {
    configHelper.getConfig.mockReturnValue({
      aiProvider: "gemini",
      geminiApiKey: "AIza-test",
      geminiModel: "gemini-2.0-flash",
    });

    axios.post.mockResolvedValue({
      data: {
        candidates: [{ content: { parts: [{ text: "feat: gemini commit" }] } }],
      },
    });

    const message = await generateCommitMessage(mockDiff, mockFiles);

    expect(message).toBe("feat: gemini commit");
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining(
        "generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash"
      ),
      expect.objectContaining({
        contents: expect.any(Array),
        generationConfig: expect.objectContaining({
          temperature: expect.any(Number),
        }),
      }),
      expect.any(Object)
    );
  });

  test("should throw a meaningful error when gemini returns no candidates", async () => {
    configHelper.getConfig.mockReturnValue({
      aiProvider: "gemini",
      geminiApiKey: "AIza-test",
      geminiModel: "gemini-2.0-flash",
    });

    axios.post.mockResolvedValue({ data: { candidates: [] } });

    await expect(generateCommitMessage(mockDiff, mockFiles)).rejects.toThrow(
      /returned no candidates/
    );
  });

  test("should call OpenCode Go API correctly", async () => {
    configHelper.getConfig.mockReturnValue({
      aiProvider: "opencodego",
      opencodeGoApiKey: "ocg-test",
      opencodeGoModel: "deepseek-v4-flash",
    });

    axios.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: "feat: opencode go commit" } }],
      },
    });

    const message = await generateCommitMessage(mockDiff, mockFiles);

    expect(message).toBe("feat: opencode go commit");
    expect(axios.post).toHaveBeenCalledWith(
      "https://opencode.ai/zen/go/v1/chat/completions",
      expect.objectContaining({
        model: "deepseek-v4-flash",
        messages: expect.any(Array),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer ocg-test",
        }),
      })
    );
  });

  test("should call DeepSeek API correctly", async () => {
    configHelper.getConfig.mockReturnValue({
      aiProvider: "deepseek",
      deepseekApiKey: "ds-test",
      deepseekModel: "deepseek-chat",
    });

    axios.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: "feat: deepseek commit" } }],
      },
    });

    const message = await generateCommitMessage(mockDiff, mockFiles);

    expect(message).toBe("feat: deepseek commit");
    expect(axios.post).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.objectContaining({
        model: "deepseek-chat",
        messages: expect.any(Array),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer ds-test",
        }),
      })
    );
  });

  test("should call Amazon Bedrock API correctly", async () => {
    configHelper.getConfig.mockReturnValue({
      aiProvider: "bedrock",
      bedrockApiKey: "bk-test",
      bedrockRegion: "us-west-2",
      bedrockModel: "us.anthropic.claude-sonnet-4-6",
    });

    axios.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: "feat: bedrock commit" } }],
      },
    });

    const message = await generateCommitMessage(mockDiff, mockFiles);

    expect(message).toBe("feat: bedrock commit");
    expect(axios.post).toHaveBeenCalledWith(
      "https://bedrock-runtime.us-west-2.amazonaws.com/v1/chat/completions",
      expect.objectContaining({
        model: "us.anthropic.claude-sonnet-4-6",
        messages: expect.any(Array),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer bk-test",
        }),
      })
    );
  });

  test("should call Amazon Bedrock Mantle API correctly", async () => {
    configHelper.getConfig.mockReturnValue({
      aiProvider: "bedrockmantle",
      bedrockMantleApiKey: "bkm-test",
      bedrockMantleRegion: "eu-central-1",
      bedrockMantleModel: "openai.gpt-oss-120b",
    });

    axios.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: "feat: bedrock mantle commit" } }],
      },
    });

    const message = await generateCommitMessage(mockDiff, mockFiles);

    expect(message).toBe("feat: bedrock mantle commit");
    expect(axios.post).toHaveBeenCalledWith(
      "https://bedrock-mantle.eu-central-1.api.aws/v1/chat/completions",
      expect.objectContaining({
        model: "openai.gpt-oss-120b",
        messages: expect.any(Array),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer bkm-test",
        }),
      })
    );
  });

  test("should call Ollama Cloud API correctly", async () => {
    configHelper.getConfig.mockReturnValue({
      aiProvider: "ollamacloud",
      ollamaCloudApiKey: "oc-test",
      ollamaCloudModel: "qwen3.5:2b",
    });

    axios.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: "feat: ollama cloud commit" } }],
      },
    });

    const message = await generateCommitMessage(mockDiff, mockFiles);

    expect(message).toBe("feat: ollama cloud commit");
    expect(axios.post).toHaveBeenCalledWith(
      "https://ollama.com/v1/chat/completions",
      expect.objectContaining({
        model: "qwen3.5:2b",
        messages: expect.any(Array),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer oc-test",
        }),
      })
    );
  });

  test("should verify OpenCode Go connection via models endpoint", async () => {
    configHelper.getConfig.mockReturnValue({
      aiProvider: "opencodego",
      opencodeGoApiKey: "ocg-test",
    });

    axios.get.mockResolvedValue({
      data: { data: [{ id: "deepseek-v4-flash" }] },
    });

    const result = await checkAIConnection();

    expect(result.connected).toBe(true);
    expect(axios.get).toHaveBeenCalledWith(
      "https://opencode.ai/zen/go/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer ocg-test",
        }),
      })
    );
  });

  test("should report a missing Bedrock API key", async () => {
    configHelper.getConfig.mockReturnValue({
      aiProvider: "bedrock",
      bedrockApiKey: "",
      bedrockRegion: "us-east-1",
    });

    const result = await checkAIConnection();

    expect(result.connected).toBe(false);
    expect(result.error).toContain("Bedrock API Key is missing");
  });

  test("should report a missing Ollama Cloud API key", async () => {
    configHelper.getConfig.mockReturnValue({
      aiProvider: "ollamacloud",
      ollamaCloudApiKey: "",
    });

    const result = await checkAIConnection();

    expect(result.connected).toBe(false);
    expect(result.error).toContain("Ollama Cloud API Key is missing");
  });

  describe("model fetch caching", () => {
    test("model fetch results are cached per api key", async () => {
      axios.get.mockResolvedValue({
        data: { data: [{ id: "gpt-4o" }, { id: "gpt-5-mini" }] },
      });

      const first = await fetchOpenAIModels("sk-test");
      const second = await fetchOpenAIModels("sk-test");

      expect(first).toEqual([
        { id: "gpt-4o", name: "gpt-4o" },
        { id: "gpt-5-mini", name: "gpt-5-mini" },
      ]);
      expect(second).toEqual(first);
      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    test("changing the api key refetches models", async () => {
      axios.get.mockResolvedValue({ data: { data: [{ id: "gpt-4o" }] } });

      await fetchOpenAIModels("sk-1");
      await fetchOpenAIModels("sk-2");

      expect(axios.get).toHaveBeenCalledTimes(2);
    });

    test("empty model results are not cached", async () => {
      axios.get.mockResolvedValue({ data: { data: [] } });

      const first = await fetchOpenAIModels("sk-test");
      const second = await fetchOpenAIModels("sk-test");

      expect(first).toEqual([]);
      expect(second).toEqual([]);
      expect(axios.get).toHaveBeenCalledTimes(2);
    });

    test("ollama model fetch is cached per base url", async () => {
      axios.get.mockResolvedValue({
        data: { models: [{ name: "llama3" }] },
      });

      await fetchOllamaModels("http://localhost:11434");
      await fetchOllamaModels("http://localhost:11434");

      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    test("model cache expires after TTL", async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      axios.get.mockResolvedValue({ data: { data: [{ id: "gpt-4o" }] } });

      await fetchOpenAIModels("sk-test");
      expect(axios.get).toHaveBeenCalledTimes(1);

      jest.setSystemTime(new Date("2026-01-01T00:05:01Z"));
      await fetchOpenAIModels("sk-test");
      expect(axios.get).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    test("resetModelCache clears cached results", async () => {
      axios.get.mockResolvedValue({ data: { data: [{ id: "gpt-4o" }] } });

      await fetchOpenAIModels("sk-test");
      expect(axios.get).toHaveBeenCalledTimes(1);

      resetModelCache();
      await fetchOpenAIModels("sk-test");
      expect(axios.get).toHaveBeenCalledTimes(2);
    });

    test("deepseek model fetch is cached per api key", async () => {
      axios.get.mockResolvedValue({
        data: { data: [{ id: "deepseek-chat" }] },
      });

      const first = await fetchDeepSeekModels("sk-test");
      const second = await fetchDeepSeekModels("sk-test");

      expect(first).toEqual([{ id: "deepseek-chat", name: "deepseek-chat" }]);
      expect(second).toEqual(first);
      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    test("bedrock model fetch uses the runtime and mantle endpoints", async () => {
      axios.get.mockResolvedValue({
        data: {
          data: [{ id: "us.anthropic.claude-sonnet-4-6" }],
        },
      });

      await fetchBedrockModels("eu-central-1", "bk-test", "runtime");
      expect(axios.get).toHaveBeenCalledWith(
        "https://bedrock-runtime.eu-central-1.amazonaws.com/v1/models",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer bk-test",
          }),
        })
      );

      await fetchBedrockModels("eu-central-1", "bk-test", "mantle");
      expect(axios.get).toHaveBeenCalledWith(
        "https://bedrock-mantle.eu-central-1.api.aws/v1/models",
        expect.any(Object)
      );
    });

    test("opencode go model fetch is cached per api key", async () => {
      axios.get.mockResolvedValue({
        data: {
          data: [{ id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" }],
        },
      });

      await fetchOpenCodeGoModels("ocg-test");
      await fetchOpenCodeGoModels("ocg-test");

      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    test("ollama cloud model fetch is cached per api key", async () => {
      axios.get.mockResolvedValue({
        data: { data: [{ id: "qwen3.5:2b" }] },
      });

      await fetchOllamaCloudModels("oc-test");
      await fetchOllamaCloudModels("oc-test");

      expect(axios.get).toHaveBeenCalledTimes(1);
    });
  });

  describe("Commit message formats", () => {
    beforeEach(() => {
      configHelper.getConfig.mockReturnValue({
        aiProvider: "openai",
        openaiApiKey: "sk-test",
        openaiModel: "gpt-4o",
      });
    });

    function userPrompt() {
      const [, body] = axios.post.mock.calls[0];
      return body.messages.find((m) => m.role === "user").content;
    }

    test("defaults to conventional+body when no type is given", async () => {
      axios.post.mockResolvedValue({
        data: { choices: [{ message: { content: "feat: ok" } }] },
      });

      await generateCommitMessage(mockDiff, mockFiles);

      expect(userPrompt()).toContain("type(scope): brief description");
      expect(userPrompt()).toContain("Conventional Commits types");
    });

    test("builds a gitmoji prompt when type is gitmoji", async () => {
      axios.post.mockResolvedValue({
        data: { choices: [{ message: { content: "✨ feat: ok" } }] },
      });

      await generateCommitMessage(mockDiff, mockFiles, { type: "gitmoji" });

      expect(userPrompt()).toContain("a relevant emoji");
      expect(userPrompt()).toContain("✨ feat(auth): add login");
    });

    test("builds a plain prompt without conventional types", async () => {
      axios.post.mockResolvedValue({
        data: { choices: [{ message: { content: "add stuff" } }] },
      });

      await generateCommitMessage(mockDiff, mockFiles, { type: "plain" });

      expect(userPrompt()).toContain("short, plain description");
      expect(userPrompt()).not.toContain("Conventional Commits types");
    });

    test("truncates the subject to the configured subjectMaxLength", async () => {
      configHelper.getConfig.mockReturnValue({
        aiProvider: "openai",
        openaiApiKey: "sk-test",
        openaiModel: "gpt-4o",
        subjectMaxLength: 10,
      });
      axios.post.mockResolvedValue({
        data: {
          choices: [{ message: { content: "a very long subject line here" } }],
        },
      });

      const message = await generateCommitMessage(mockDiff, mockFiles);

      expect(message.split("\n")[0].length).toBe(10);
    });

    test("maxLength option overrides the configured subject length", async () => {
      configHelper.getConfig.mockReturnValue({
        aiProvider: "openai",
        openaiApiKey: "sk-test",
        openaiModel: "gpt-4o",
        subjectMaxLength: 50,
      });
      axios.post.mockResolvedValue({
        data: {
          choices: [{ message: { content: "a very long subject line here" } }],
        },
      });

      const message = await generateCommitMessage(mockDiff, mockFiles, {
        maxLength: 12,
      });

      expect(message.split("\n")[0].length).toBe(12);
    });

    test("falls back to the default format for unknown types", async () => {
      axios.post.mockResolvedValue({
        data: { choices: [{ message: { content: "feat: ok" } }] },
      });

      await generateCommitMessage(mockDiff, mockFiles, { type: "bogus" });

      expect(userPrompt()).toContain("type(scope): brief description");
    });

    test("resolveCommitType prefers the passed type over config", () => {
      configHelper.getConfig.mockReturnValue({ commitType: "plain" });

      expect(resolveCommitType("gitmoji")).toBe("gitmoji");
      expect(resolveCommitType(null)).toBe("plain");
      expect(resolveCommitType("bogus")).toBe("conventional+body");
    });

    test("multi-suggestion generation respects the requested format", async () => {
      axios.post.mockResolvedValue({
        data: {
          choices: [
            {
              message: {
                content: "fix: one\n\n- body\n---\nfeat: two\n\n- body",
              },
            },
          ],
        },
      });

      const suggestions = await generateCommitSuggestions(
        mockDiff,
        mockFiles,
        2,
        null,
        { type: "conventional+body" }
      );

      expect(suggestions).toEqual([
        "fix: one\n\n- body",
        "feat: two\n\n- body",
      ]);
      expect(userPrompt()).toContain('Separate each with "---"');
    });
  });
});
