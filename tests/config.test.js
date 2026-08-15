const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  getConfig,
  saveConfig,
  DEFAULT_CONFIG,
  resetConfigCache,
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
});
