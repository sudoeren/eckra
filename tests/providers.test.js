const providers = require("../src/helpers/providers");
const ai = require("../src/helpers/ai");
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

describe("Provider registry", () => {
  test("every provider has complete metadata", () => {
    for (const p of providers.PROVIDERS) {
      expect(typeof p.id).toBe("string");
      expect(p.id.length).toBeGreaterThan(0);
      expect(typeof p.label).toBe("string");
      expect(providers.PROVIDER_FIELDS[p.id]).toEqual(p.fields);
      expect(DEFAULT_CONFIG[p.modelKey]).toBeDefined();
      expect(typeof p.defaultModel).toBe("string");
      for (const field of p.fields) {
        expect(Object.keys(DEFAULT_CONFIG)).toContain(field);
      }
    }
  });

  test("model key is part of the provider fields", () => {
    for (const p of providers.PROVIDERS) {
      expect(p.fields).toContain(p.modelKey);
    }
  });

  test("cloud providers declare an API key field, local ones do not", () => {
    const cloud = [
      "openai",
      "anthropic",
      "openrouter",
      "gemini",
      "deepseek",
      "opencodego",
      "ollamacloud",
      "bedrock",
      "bedrockmantle",
    ];
    const local = ["ollama", "lmstudio"];
    for (const id of cloud) {
      expect(providers.getRequiredKeyField(id)).toBeTruthy();
    }
    for (const id of local) {
      expect(providers.getRequiredKeyField(id)).toBeNull();
    }
  });

  test("bedrock providers declare a region field with default", () => {
    expect(providers.getProvider("bedrock").regionField).toBe("bedrockRegion");
    expect(providers.getProvider("bedrock").defaultRegion).toBe("us-east-1");
    expect(providers.getProvider("bedrockmantle").regionField).toBe(
      "bedrockMantleRegion"
    );
  });

  test("getProvider returns null for unknown ids", () => {
    expect(providers.getProvider("nope")).toBeNull();
    expect(providers.getProviderQuestions("nope")).toEqual([]);
  });

  test("getProviderQuestions asks credentials but never the model directly", () => {
    const openaiQs = providers.getProviderQuestions("openai", {});
    expect(openaiQs.map((q) => q.name)).toEqual(["openaiApiKey"]);

    const bedrockQs = providers.getProviderQuestions("bedrock", {});
    expect(bedrockQs.map((q) => q.name)).toEqual([
      "bedrockApiKey",
      "bedrockRegion",
    ]);

    // Local providers only ask the URL
    const ollamaQs = providers.getProviderQuestions("ollama", {});
    expect(ollamaQs.map((q) => q.name)).toEqual(["ollamaUrl"]);
  });

  test("region questions fall back to the provider default region", () => {
    const qs = providers.getProviderQuestions("bedrock", {});
    const regionQ = qs.find((q) => q.name === "bedrockRegion");
    expect(regionQ.default).toBe("us-east-1");
  });

  test("fetchModelsFor dispatches to the right AI helper", async () => {
    await providers.fetchModelsFor("openai", { openaiApiKey: "sk" }, {});
    expect(ai.fetchOpenAIModels).toHaveBeenCalledWith("sk");

    await providers.fetchModelsFor("ollama", { ollamaUrl: "http://x" }, {});
    expect(ai.fetchOllamaModels).toHaveBeenCalledWith("http://x");

    await providers.fetchModelsFor("bedrock", {}, { bedrockRegion: "eu-1" });
    expect(ai.fetchBedrockModels).toHaveBeenCalledWith(
      "eu-1",
      undefined,
      "runtime"
    );

    await providers.fetchModelsFor(
      "bedrockmantle",
      {},
      { bedrockMantleApiKey: "mk" }
    );
    expect(ai.fetchBedrockModels).toHaveBeenLastCalledWith(
      undefined,
      "mk",
      "mantle"
    );

    await providers.fetchModelsFor("lmstudio", {}, { lmStudioUrl: "http://l" });
    expect(ai.fetchLMStudioModels).toHaveBeenCalledWith("http://l");
  });

  test("answers win over config when fetching models", async () => {
    await providers.fetchModelsFor(
      "openai",
      { openaiApiKey: "fresh" },
      { openaiApiKey: "stale" }
    );
    expect(ai.fetchOpenAIModels).toHaveBeenLastCalledWith("fresh");
  });
});
