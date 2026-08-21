const {
  promptModelSearch,
  doModelSelector,
  connectionWizard,
} = require("../src/ui/modules/settings");
const ai = require("../src/helpers/ai");
const screen = require("../src/ui/screen");
const { DEFAULT_CONFIG } = require("../src/helpers/config");

jest.mock("../src/helpers/ai", () => ({
  fetchOpenAIModels: jest.fn(),
  fetchAnthropicModels: jest.fn(),
  fetchGeminiModels: jest.fn(),
  fetchOllamaModels: jest.fn(),
  fetchOpenRouterModels: jest.fn(),
  fetchLMStudioModels: jest.fn(),
  fetchOpenCodeGoModels: jest.fn(),
  fetchDeepSeekModels: jest.fn(),
  fetchBedrockModels: jest.fn(),
  fetchOllamaCloudModels: jest.fn(),
  checkAIConnection: jest.fn(),
  testProviderConnection: jest.fn(),
  resetAIConnectionCache: jest.fn(),
}));

jest.mock("../src/helpers/config", () => {
  const actual = jest.requireActual("../src/helpers/config");
  return {
    ...actual,
    getConfig: jest.fn(),
    saveConfig: jest.fn(),
    resetConfig: jest.fn(),
    listAIConnections: jest.fn(() => []),
    getAIConnection: jest.fn(),
    saveAIConnection: jest.fn(),
    deleteAIConnection: jest.fn(),
    renameAIConnection: jest.fn(),
    setActiveAIConnection: jest.fn(),
  };
});

jest.mock("../src/ui/screen", () => ({
  open: jest.fn(),
  menuItem: jest.fn((_label, _tone, value) => value),
  backItem: jest.fn(() => "back"),
  sep: jest.fn(() => "sep"),
  prompt: jest.fn(),
  spinner: () => ({ start: jest.fn(), stop: jest.fn() }),
  done: jest.fn(),
  fail: jest.fn(),
}));

jest.mock("../src/ui/common", () => ({
  s: new Proxy(
    {},
    {
      get: () => (value) => value,
    }
  ),
  clear: jest.fn(),
  sleep: jest.fn(),
  pause: jest.fn(),
}));

describe("Settings provider flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore default listAIConnections after clearAllMocks wipes implementations
    const configHelper = require("../src/helpers/config");
    configHelper.listAIConnections.mockReturnValue([]);
  });

  test("returns the selected model via autocomplete", async () => {
    screen.prompt.mockResolvedValue({ openaiModel: "gpt-4o" });
    ai.fetchOpenAIModels.mockResolvedValue([
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-5-mini", name: "GPT-5 mini" },
    ]);

    const result = await promptModelSearch(
      "openai",
      { openaiApiKey: "sk" },
      {}
    );

    expect(ai.fetchOpenAIModels).toHaveBeenCalledWith("sk");
    expect(result).toEqual({ openaiModel: "gpt-4o" });
    expect(screen.prompt).toHaveBeenCalledTimes(1);

    const question = screen.prompt.mock.calls[0][0][0];
    expect(question.type).toBe("autocomplete");
    expect(question.name).toBe("openaiModel");
  });

  test("autocomplete default comes from DEFAULT_CONFIG when unset", async () => {
    screen.prompt.mockResolvedValue({ openaiModel: "gpt-5-mini" });
    ai.fetchOpenAIModels.mockResolvedValue([
      { id: "gpt-5-mini", name: "GPT-5 mini" },
    ]);

    await promptModelSearch("openai", {}, {});

    const question = screen.prompt.mock.calls[0][0][0];
    expect(question.default).toBe(DEFAULT_CONFIG.openaiModel);
  });

  test("falls back to manual input when model fetch fails", async () => {
    ai.fetchOpenAIModels.mockResolvedValue([]);
    screen.prompt.mockResolvedValue({ openaiModel: "custom-model" });

    const result = await promptModelSearch(
      "openai",
      { openaiApiKey: "sk" },
      {}
    );

    expect(result).toEqual({ openaiModel: "custom-model" });

    const question = screen.prompt.mock.calls[0][0][0];
    expect(question.type).toBe("input");
    expect(question.name).toBe("openaiModel");
    expect(question.default).toBe(DEFAULT_CONFIG.openaiModel);
  });

  test("ollama uses its own model key and defaults", async () => {
    ai.fetchOllamaModels.mockResolvedValue([{ id: "llama3", name: "llama3" }]);
    screen.prompt.mockResolvedValue({ ollamaModel: "llama3" });

    const result = await promptModelSearch("ollama", {}, {});

    expect(result).toEqual({ ollamaModel: "llama3" });

    const question = screen.prompt.mock.calls[0][0][0];
    expect(question.name).toBe("ollamaModel");
    expect(question.default).toBe(DEFAULT_CONFIG.ollamaModel);
  });

  test("bedrock passes region, key and runtime endpoint to model fetch", async () => {
    ai.fetchBedrockModels.mockResolvedValue([
      {
        id: "us.anthropic.claude-sonnet-4-6",
        name: "us.anthropic.claude-sonnet-4-6",
      },
    ]);
    screen.prompt.mockResolvedValue({
      bedrockModel: "us.anthropic.claude-sonnet-4-6",
    });

    const result = await promptModelSearch(
      "bedrock",
      { bedrockApiKey: "bk", bedrockRegion: "eu-central-1" },
      {}
    );

    expect(ai.fetchBedrockModels).toHaveBeenCalledWith(
      "eu-central-1",
      "bk",
      "runtime"
    );
    expect(result).toEqual({ bedrockModel: "us.anthropic.claude-sonnet-4-6" });

    const question = screen.prompt.mock.calls[0][0][0];
    expect(question.name).toBe("bedrockModel");
    expect(question.default).toBe(DEFAULT_CONFIG.bedrockModel);
  });

  test("bedrock mantle uses the mantle endpoint", async () => {
    ai.fetchBedrockModels.mockResolvedValue([
      { id: "openai.gpt-oss-120b", name: "openai.gpt-oss-120b" },
    ]);
    screen.prompt.mockResolvedValue({
      bedrockMantleModel: "openai.gpt-oss-120b",
    });

    await promptModelSearch("bedrockmantle", {}, {});

    expect(ai.fetchBedrockModels).toHaveBeenCalledWith(
      undefined,
      undefined,
      "mantle"
    );
  });

  test("deepseek uses its own model key and defaults", async () => {
    ai.fetchDeepSeekModels.mockResolvedValue([
      { id: "deepseek-chat", name: "deepseek-chat" },
    ]);
    screen.prompt.mockResolvedValue({ deepseekModel: "deepseek-chat" });

    const result = await promptModelSearch("deepseek", {}, {});

    expect(result).toEqual({ deepseekModel: "deepseek-chat" });

    const question = screen.prompt.mock.calls[0][0][0];
    expect(question.name).toBe("deepseekModel");
    expect(question.default).toBe(DEFAULT_CONFIG.deepseekModel);
  });

  test("opencode go uses its own model key and defaults", async () => {
    ai.fetchOpenCodeGoModels.mockResolvedValue([
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
    ]);
    screen.prompt.mockResolvedValue({ opencodeGoModel: "deepseek-v4-flash" });

    const result = await promptModelSearch("opencodego", {}, {});

    expect(result).toEqual({ opencodeGoModel: "deepseek-v4-flash" });

    const question = screen.prompt.mock.calls[0][0][0];
    expect(question.name).toBe("opencodeGoModel");
    expect(question.default).toBe(DEFAULT_CONFIG.opencodeGoModel);
  });

  test("ollama cloud uses its own model key and defaults", async () => {
    ai.fetchOllamaCloudModels.mockResolvedValue([
      { id: "qwen3.5:2b", name: "qwen3.5:2b" },
    ]);
    screen.prompt.mockResolvedValue({ ollamaCloudModel: "qwen3.5:2b" });

    const result = await promptModelSearch("ollamacloud", {}, {});

    expect(result).toEqual({ ollamaCloudModel: "qwen3.5:2b" });

    const question = screen.prompt.mock.calls[0][0][0];
    expect(question.name).toBe("ollamaCloudModel");
    expect(question.default).toBe(DEFAULT_CONFIG.ollamaCloudModel);
  });

  test("doModelSelector offers only Switch and Manage actions", async () => {
    const configHelper = require("../src/helpers/config");
    configHelper.getConfig.mockReturnValue({ aiProvider: "openai" });
    screen.prompt.mockResolvedValue({ action: "back" });

    await doModelSelector();

    const labels = screen.menuItem.mock.calls.map((c) => c[0]);
    expect(labels).toContain("Switch Provider / Account");
    expect(labels).toContain("Manage Providers");
    expect(labels).not.toContain("Change Model");
    expect(labels).not.toContain("Configure Provider Settings");
    expect(labels).not.toContain("Change Provider");
  });

  test("doModelSelector shows the AI settings summary before the menu", async () => {
    const configHelper = require("../src/helpers/config");
    configHelper.getConfig.mockReturnValue({
      aiProvider: "openai",
      openaiApiKey: "sk-secret-1234",
      openaiModel: "gpt-4o",
      activeAiConnection: "work",
    });
    screen.prompt.mockResolvedValue({ action: "back" });
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    try {
      await doModelSelector();

      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("Provider:");
      expect(output).toContain("OpenAI");
      expect(output).toContain("Connection:");
      expect(output).toContain("work");
      expect(output).toContain("Model:");
      expect(output).toContain("gpt-4o");
      expect(output).toContain("API Key:");
      expect(output).not.toContain("sk-secret-1234");
      expect(output).toContain("Config file:");
      expect(output).toContain("config.json");
    } finally {
      logSpy.mockRestore();
    }
  });

  test("doModelSelector exits without fetching models on Back", async () => {
    screen.prompt.mockResolvedValue({ action: "back" });

    await doModelSelector();

    expect(screen.open).toHaveBeenCalledWith("Model");
    expect(ai.fetchOpenAIModels).not.toHaveBeenCalled();
    expect(screen.prompt).toHaveBeenCalledTimes(1);
  });

  test("doModelSelector switches to a saved connection", async () => {
    const configHelper = require("../src/helpers/config");
    configHelper.getConfig.mockReturnValue({ aiProvider: "openai" });
    configHelper.listAIConnections.mockReturnValue([
      { name: "work", provider: "openai" },
    ]);
    configHelper.getAIConnection.mockReturnValue({
      name: "work",
      provider: "openai",
    });
    screen.prompt
      .mockResolvedValueOnce({ action: "switch" })
      .mockResolvedValueOnce({ name: "work" })
      .mockResolvedValue({ action: "back" });

    await doModelSelector();

    expect(configHelper.setActiveAIConnection).toHaveBeenCalledWith("work");
    expect(ai.resetAIConnectionCache).toHaveBeenCalled();
  });

  test("connectionWizard creates a new connection with test and activation", async () => {
    const configHelper = require("../src/helpers/config");
    configHelper.getConfig.mockReturnValue({
      aiProvider: "openai",
      openaiApiKey: "sk-old",
      openaiModel: "gpt-5-mini",
    });
    ai.fetchOpenAIModels.mockResolvedValue([{ id: "gpt-4o", name: "GPT-4o" }]);
    ai.testProviderConnection.mockResolvedValue({ connected: true });
    screen.prompt
      .mockResolvedValueOnce({ openaiApiKey: "sk-new" }) // credentials
      .mockResolvedValueOnce({ openaiModel: "gpt-4o" }) // model
      .mockResolvedValueOnce({ activateNow: true }); // switch now?

    const result = await connectionWizard({
      providerHint: "openai",
      nameHint: "work",
    });

    expect(result).toBe("work");
    expect(ai.testProviderConnection).toHaveBeenCalledWith(
      "openai",
      expect.objectContaining({ aiProvider: "openai", openaiApiKey: "sk-new" })
    );
    expect(configHelper.saveAIConnection).toHaveBeenCalledWith(
      "work",
      { provider: "openai", openaiApiKey: "sk-new", openaiModel: "gpt-4o" },
      { activate: false }
    );
    expect(configHelper.setActiveAIConnection).toHaveBeenCalledWith("work");
  });

  test("connectionWizard retries after a failed test then saves", async () => {
    const configHelper = require("../src/helpers/config");
    configHelper.getConfig.mockReturnValue({
      aiProvider: "openai",
      openaiApiKey: "sk",
    });
    ai.fetchOpenAIModels.mockResolvedValue([{ id: "gpt-4o", name: "GPT-4o" }]);
    ai.testProviderConnection
      .mockResolvedValueOnce({ connected: false, error: "401" })
      .mockResolvedValueOnce({ connected: true });
    screen.prompt
      .mockResolvedValueOnce({ openaiApiKey: "bad-key" }) // credentials (1st)
      .mockResolvedValueOnce({ openaiModel: "gpt-4o" }) // model (1st)
      .mockResolvedValueOnce({ testAction: "retry" }) // failed test menu
      .mockResolvedValueOnce({ openaiApiKey: "good-key" }) // credentials (2nd)
      .mockResolvedValueOnce({ openaiModel: "gpt-4o" }) // model (2nd)
      .mockResolvedValueOnce({ activateNow: false }); // switch now?

    const result = await connectionWizard({
      providerHint: "openai",
      nameHint: "work",
    });

    expect(result).toBe("work");
    expect(ai.testProviderConnection).toHaveBeenCalledTimes(2);
    expect(configHelper.saveAIConnection).toHaveBeenCalledWith(
      "work",
      { provider: "openai", openaiApiKey: "good-key", openaiModel: "gpt-4o" },
      { activate: false }
    );
    expect(configHelper.setActiveAIConnection).not.toHaveBeenCalled();
  });

  test("connectionWizard cancels without saving", async () => {
    const configHelper = require("../src/helpers/config");
    configHelper.getConfig.mockReturnValue({
      aiProvider: "openai",
      openaiApiKey: "sk",
    });
    ai.fetchOpenAIModels.mockResolvedValue([{ id: "gpt-4o", name: "GPT-4o" }]);
    ai.testProviderConnection.mockResolvedValue({
      connected: false,
      error: "timeout",
    });
    screen.prompt
      .mockResolvedValueOnce({ openaiApiKey: "bad-key" }) // credentials
      .mockResolvedValueOnce({ openaiModel: "gpt-4o" }) // model
      .mockResolvedValueOnce({ testAction: "cancel" }); // failed test menu

    const result = await connectionWizard({
      providerHint: "openai",
      nameHint: "work",
    });

    expect(result).toBeNull();
    expect(configHelper.saveAIConnection).not.toHaveBeenCalled();
  });

  test("connectionWizard updates an existing connection in place", async () => {
    const configHelper = require("../src/helpers/config");
    configHelper.getAIConnection.mockReturnValue({
      name: "work",
      provider: "openai",
      openaiApiKey: "sk-old",
    });
    configHelper.getConfig.mockReturnValue({ aiProvider: "openai" });
    ai.fetchOpenAIModels.mockResolvedValue([{ id: "gpt-4o", name: "GPT-4o" }]);
    ai.testProviderConnection.mockResolvedValue({ connected: true });
    screen.prompt
      .mockResolvedValueOnce({ openaiApiKey: "sk-fixed" }) // credentials
      .mockResolvedValueOnce({ openaiModel: "gpt-4o" }); // model

    const result = await connectionWizard({ existingName: "work" });

    expect(result).toBe("work");
    expect(configHelper.saveAIConnection).toHaveBeenCalledWith(
      "work",
      { provider: "openai", openaiApiKey: "sk-fixed", openaiModel: "gpt-4o" },
      { activate: true }
    );
  });
});
