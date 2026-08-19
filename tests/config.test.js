const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  getConfig,
  saveConfig,
  DEFAULT_CONFIG,
  resetConfigCache,
  getConfigPath,
  getRawConfig,
  isValidConfigKey,
  maskSecret,
  setConfigValue,
  unsetConfigValue,
  resetConfig,
  envVarName,
} = require("../src/helpers/config");

// Mock fs to avoid touching real files
jest.mock("fs");

describe("Config Helper", () => {
  const MOCK_HOMEDIR = "/mock/home";
  const MOCK_CWD = "/mock/project";

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    resetConfigCache();

    // Mock os.homedir
    jest.spyOn(os, "homedir").mockReturnValue(MOCK_HOMEDIR);

    // Mock process.cwd
    jest.spyOn(process, "cwd").mockReturnValue(MOCK_CWD);

    // Default fs behavior
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockImplementation(() => {});
    fs.readFileSync.mockImplementation(() => "");
  });

  test("should return default config when no config files exist", () => {
    const config = getConfig();
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(config.commitType).toBe("conventional+body");
    expect(config.subjectMaxLength).toBe(50);
    expect(config.locale).toBe("en");
    expect(config.timeout).toBe(30000);
  });

  test("should merge global config correctly", () => {
    const globalConfig = {
      model: "global-model-v1",
      lmStudioUrl: "http://global-url:1234",
    };

    // Setup mocks for global config presence
    fs.existsSync.mockImplementation((filePath) => {
      if (filePath.includes(".eckra") && filePath.includes("config.json"))
        return true;
      return false;
    });

    fs.readFileSync.mockImplementation((filePath) => {
      if (filePath.includes(".eckra") && filePath.includes("config.json")) {
        return JSON.stringify(globalConfig);
      }
      return "";
    });

    const config = getConfig();

    expect(config.model).toBe(globalConfig.model);
    expect(config.lmStudioUrl).toBe(globalConfig.lmStudioUrl);
    // Should verify other defaults remain
    expect(config.theme).toBe(DEFAULT_CONFIG.theme);
  });

  test("should prioritize local .eckrarc over global config", () => {
    const globalConfig = {
      model: "global-model",
      aiProvider: "lmstudio",
    };

    const localConfig = {
      model: "local-model",
      aiProvider: "openai",
    };

    // Setup mocks for both files
    fs.existsSync.mockImplementation((filePath) => {
      // Global config
      if (filePath.includes(".eckra") && filePath.includes("config.json"))
        return true;
      // Local config in CWD
      if (filePath === path.join(MOCK_CWD, ".eckrarc")) return true;
      return false;
    });

    fs.readFileSync.mockImplementation((filePath) => {
      if (filePath.includes("config.json")) return JSON.stringify(globalConfig);
      if (filePath.includes(".eckrarc")) return JSON.stringify(localConfig);
      return "";
    });

    const config = getConfig();

    expect(config.model).toBe(localConfig.model);
    expect(config.aiProvider).toBe(localConfig.aiProvider);
    expect(config.theme).toBe(DEFAULT_CONFIG.theme);
  });

  test("should look for .eckrarc in parent directories", () => {
    const parentDir = path.dirname(MOCK_CWD);
    const localConfig = { aiInstruction: "parent instruction" };

    // Update cwd mock to be a subdir
    jest.spyOn(process, "cwd").mockReturnValue(MOCK_CWD);

    // Setup mocks
    fs.existsSync.mockImplementation((filePath) => {
      // Not in CWD
      if (filePath === path.join(MOCK_CWD, ".eckrarc")) return false;
      // Found in Parent
      if (filePath === path.join(parentDir, ".eckrarc")) return true;
      return false;
    });

    fs.readFileSync.mockImplementation((filePath) => {
      if (filePath === path.join(parentDir, ".eckrarc"))
        return JSON.stringify(localConfig);
      return "";
    });

    // We need to mock path.dirname to actually traverse up in our mocked environment logic if needed,
    // but getConfig uses real path module. Ideally we rely on real path behavior or mock carefully.
    // The getConfig implementation uses a while loop with path.dirname.
    // Since we are mocking fs, we just need to ensure the loop calls fs.existsSync with the parent path.

    const config = getConfig();
    expect(config.aiInstruction).toBe(localConfig.aiInstruction);
  });

  test("should merge global and local configs per-key with local winning", () => {
    const globalConfig = {
      model: "global-model",
      aiProvider: "openai",
      theme: "dark",
    };
    const localConfig = { model: "local-model" };

    fs.existsSync.mockImplementation((filePath) => {
      if (filePath.includes(".eckra") && filePath.includes("config.json"))
        return true;
      if (filePath === path.join(MOCK_CWD, ".eckrarc")) return true;
      return false;
    });

    fs.readFileSync.mockImplementation((filePath) => {
      if (filePath.includes("config.json")) return JSON.stringify(globalConfig);
      if (filePath.includes(".eckrarc")) return JSON.stringify(localConfig);
      return "";
    });

    const config = getConfig();

    // Local overrides its own key, global fills the rest
    expect(config.model).toBe("local-model");
    expect(config.aiProvider).toBe("openai");
    expect(config.theme).toBe("dark");
  });

  test("should normalize trailing slashes in URL config", () => {
    const globalConfig = {
      lmStudioUrl: "http://localhost:1234///",
      ollamaUrl: "http://localhost:11434/",
    };

    fs.existsSync.mockImplementation((filePath) => {
      if (filePath.includes(".eckra") && filePath.includes("config.json"))
        return true;
      return false;
    });

    fs.readFileSync.mockImplementation((filePath) => {
      if (filePath.includes("config.json")) return JSON.stringify(globalConfig);
      return "";
    });

    const config = getConfig();

    expect(config.lmStudioUrl).toBe("http://localhost:1234");
    expect(config.ollamaUrl).toBe("http://localhost:11434");
  });

  test("should write config file with 0600 permissions", () => {
    fs.writeFileSync.mockClear();
    fs.chmodSync.mockClear();

    saveConfig({ theme: "dark" });

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("config.json"),
      expect.any(String),
      expect.objectContaining({ mode: 0o600 })
    );
    expect(fs.chmodSync).toHaveBeenCalledWith(
      expect.stringContaining("config.json"),
      0o600
    );
  });

  describe("non-interactive config helpers", () => {
    const globalPath = getConfigPath();
    const localPath = path.join(MOCK_CWD, ".eckrarc");

    test("isValidConfigKey accepts known keys and rejects unknown", () => {
      expect(isValidConfigKey("openaiModel")).toBe(true);
      expect(isValidConfigKey("theme")).toBe(true);
      expect(isValidConfigKey("bogusKey")).toBe(false);
      expect(isValidConfigKey("")).toBe(false);
    });

    test("new provider keys are valid config keys", () => {
      const newKeys = [
        "opencodeGoApiKey",
        "opencodeGoModel",
        "deepseekApiKey",
        "deepseekModel",
        "bedrockApiKey",
        "bedrockRegion",
        "bedrockModel",
        "bedrockMantleApiKey",
        "bedrockMantleRegion",
        "bedrockMantleModel",
        "ollamaCloudApiKey",
        "ollamaCloudModel",
      ];
      newKeys.forEach((key) => expect(isValidConfigKey(key)).toBe(true));
    });

    test("maskSecret masks values and handles empty input", () => {
      expect(maskSecret("sk-abcdefgh1234")).toBe("****1234");
      expect(maskSecret("abcd")).toBe("****");
      expect(maskSecret("")).toBe("(not set)");
      expect(maskSecret(null)).toBe("(not set)");
    });

    test("getConfigPath supports the local variant", () => {
      expect(getConfigPath()).toBe(globalPath);
      expect(getConfigPath({ local: true })).toBe(localPath);
    });

    test("getRawConfig returns empty object when file is missing", () => {
      fs.existsSync.mockReturnValue(false);
      expect(getRawConfig()).toEqual({});
      expect(getRawConfig({ local: true })).toEqual({});
    });

    test("setConfigValue writes only the delta to the global file", () => {
      const fileContents = {
        [globalPath]: JSON.stringify({ aiProvider: "openai" }),
      };
      fs.existsSync.mockImplementation((p) => p in fileContents);
      fs.readFileSync.mockImplementation((p) => fileContents[p] || "");
      fs.writeFileSync.mockImplementation((p, data) => {
        fileContents[p] = data;
      });

      setConfigValue("openaiModel", "gpt-test", {});

      const writeCall = fs.writeFileSync.mock.calls.find(
        (c) => c[0] === globalPath
      );
      expect(writeCall).toBeDefined();
      expect(JSON.parse(writeCall[1])).toEqual({
        aiProvider: "openai",
        openaiModel: "gpt-test",
      });
      expect(writeCall[2]).toEqual(expect.objectContaining({ mode: 0o600 }));

      expect(getConfig().openaiModel).toBe("gpt-test");
    });

    test("setConfigValue with local writes to the cwd .eckrarc", () => {
      fs.existsSync.mockImplementation((p) => p === localPath);
      fs.readFileSync.mockImplementation((p) =>
        p === localPath ? JSON.stringify({}) : ""
      );

      setConfigValue("aiProvider", "gemini", { local: true });

      const writeCall = fs.writeFileSync.mock.calls.find(
        (c) => c[0] === localPath
      );
      expect(writeCall).toBeDefined();
      expect(JSON.parse(writeCall[1])).toEqual({ aiProvider: "gemini" });
      expect(writeCall[2]).toEqual(expect.objectContaining({ mode: 0o600 }));
    });

    test("setConfigValue throws on unknown keys", () => {
      expect(() => setConfigValue("bogusKey", "x")).toThrow(
        "Unknown config key"
      );
    });

    test("unsetConfigValue removes a key from the global file", () => {
      fs.existsSync.mockImplementation((p) => p === globalPath);
      fs.readFileSync.mockImplementation((p) =>
        p === globalPath
          ? JSON.stringify({ aiProvider: "openai", openaiModel: "gpt" })
          : ""
      );

      const removed = unsetConfigValue("openaiModel", {});

      expect(removed).toBe(true);
      const writeCall = fs.writeFileSync.mock.calls.find(
        (c) => c[0] === globalPath
      );
      expect(JSON.parse(writeCall[1])).toEqual({ aiProvider: "openai" });
    });

    test("unsetConfigValue returns false when the key is absent", () => {
      fs.existsSync.mockImplementation((p) => p === globalPath);
      fs.readFileSync.mockImplementation((p) =>
        p === globalPath ? JSON.stringify({ aiProvider: "openai" }) : ""
      );

      const removed = unsetConfigValue("ollamaModel", {});

      expect(removed).toBe(false);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    test("resetConfig with local removes the .eckrarc file", () => {
      fs.existsSync.mockImplementation((p) => p === localPath);

      resetConfig({ local: true });

      expect(fs.rmSync).toHaveBeenCalledWith(localPath, {
        force: true,
      });
    });
  });

  describe("environment variable overrides", () => {
    const ENV_KEYS = [
      "ECKRA_OPENAI_API_KEY",
      "ECKRA_AI_PROVIDER",
      "ECKRA_LM_STUDIO_URL",
      "ECKRA_BEDROCK_REGION",
    ];

    afterEach(() => {
      ENV_KEYS.forEach((key) => delete process.env[key]);
    });

    test("envVarName maps camelCase keys to ECKRA_ UPPER_SNAKE", () => {
      expect(envVarName("openaiApiKey")).toBe("ECKRA_OPENAI_API_KEY");
      expect(envVarName("lmStudioUrl")).toBe("ECKRA_LM_STUDIO_URL");
      expect(envVarName("model")).toBe("ECKRA_MODEL");
    });

    test("environment variables override config values", () => {
      process.env.ECKRA_OPENAI_API_KEY = "sk-env";

      const config = getConfig();

      expect(config.openaiApiKey).toBe("sk-env");
    });

    test("environment variables take precedence over config files", () => {
      fs.existsSync.mockImplementation((filePath) => {
        if (filePath.includes(".eckra") && filePath.includes("config.json"))
          return true;
        return false;
      });
      fs.readFileSync.mockImplementation((filePath) => {
        if (filePath.includes(".eckra") && filePath.includes("config.json")) {
          return JSON.stringify({
            openaiApiKey: "sk-file",
            aiProvider: "openai",
          });
        }
        return "";
      });
      process.env.ECKRA_OPENAI_API_KEY = "sk-env";

      const config = getConfig();

      expect(config.openaiApiKey).toBe("sk-env");
      expect(config.aiProvider).toBe("openai");
    });

    test("empty env values and unrelated variables are ignored", () => {
      process.env.ECKRA_OPENAI_API_KEY = "";
      process.env.SOME_UNRELATED_VAR = "x";

      const config = getConfig();

      expect(config.openaiApiKey).toBe("");
      expect(config.theme).toBe("auto");
    });

    test("URL env values are normalized", () => {
      process.env.ECKRA_LM_STUDIO_URL = "http://localhost:1234/";

      const config = getConfig();

      expect(config.lmStudioUrl).toBe("http://localhost:1234");
    });
  });
});
