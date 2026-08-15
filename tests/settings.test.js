const { promptModelSearch } = require("../src/ui/modules/settings");
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
  checkAIConnection: jest.fn(),
  testProviderConnection: jest.fn(),
}));

jest.mock("../src/helpers/config", () => {
  const actual = jest.requireActual("../src/helpers/config");
  return {
    ...actual,
    getConfig: jest.fn(),
    saveConfig: jest.fn(),
    resetConfig: jest.fn(),
  };
});

jest.mock("../src/ui/screen", () => ({
  open: jest.fn(),
  menuItem: jest.fn(),
  backItem: jest.fn(),
  sep: jest.fn(),
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
});
