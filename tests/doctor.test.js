const fs = require("fs");
const { runDoctorCheck } = require("../src/helpers/doctor");
const git = require("../src/helpers/git");
const ai = require("../src/helpers/ai");
const configHelper = require("../src/helpers/config");

jest.mock("fs");
jest.mock("../src/helpers/git");
jest.mock("../src/helpers/ai");
jest.mock("../src/helpers/config");

describe("Doctor Helper", () => {
  const CONFIG_PATH = "/mock/.eckra/config.json";

  beforeEach(() => {
    jest.clearAllMocks();

    configHelper.getConfig.mockReturnValue({
      aiProvider: "lmstudio",
      openaiApiKey: "",
      openaiModel: "gpt-5-mini",
      anthropicApiKey: "",
      anthropicModel: "claude-sonnet-4-6",
      ollamaUrl: "http://localhost:11434",
      ollamaModel: "",
      openrouterApiKey: "",
      openrouterModel: "openai/gpt-oss-120b",
      geminiApiKey: "",
      geminiModel: "gemini-3.1-flash-lite",
      model: "some-model",
      theme: "dark",
      aiInstruction: "",
    });
    configHelper.getConfigPath.mockReturnValue(CONFIG_PATH);
    configHelper.getRawConfig.mockReturnValue({});
    configHelper.listAIConnections.mockReturnValue([]);
    configHelper.isValidConfigKey.mockImplementation((k) =>
      [
        "aiProvider",
        "lmStudioUrl",
        "openaiApiKey",
        "openaiModel",
        "anthropicApiKey",
        "anthropicModel",
        "ollamaUrl",
        "ollamaModel",
        "openrouterApiKey",
        "openrouterModel",
        "geminiApiKey",
        "geminiModel",
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
        "model",
        "theme",
        "aiInstruction",
      ].includes(k)
    );
    configHelper.findLocalConfig.mockReturnValue(null);
    configHelper.DEFAULT_CONFIG = {};

    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue("{}");
    fs.statSync.mockReturnValue({ mode: 0o600 });
  });

  test("reports a passing health check in a healthy repo", async () => {
    git.getGitStatus.mockResolvedValue({
      current: "main",
      tracking: "origin/main",
      ahead: 1,
      behind: 0,
      conflicted: [],
      staged: [],
      modified: [],
      not_added: [],
      deleted: [],
    });
    git.getRemotes.mockResolvedValue([{ name: "origin" }]);
    ai.checkAIConnection.mockResolvedValue({ connected: true, models: [1, 2] });

    const report = await runDoctorCheck();

    expect(report.passed).toBeGreaterThan(0);
    expect(report.failed).toBe(0);

    const labels = report.checks.map((c) => c.label);
    expect(labels).toContain("Git repository");
    expect(labels).toContain("Upstream tracking");
    expect(labels).toContain("Remotes");
    expect(labels).toContain("Connection");
    expect(labels).toContain("API key required");
  });

  test("skips git checks when not in a git repo", async () => {
    git.getGitStatus.mockRejectedValue(new Error("not a repo"));
    ai.checkAIConnection.mockResolvedValue({ connected: true, models: [] });

    const report = await runDoctorCheck();

    const gitChecks = report.checks.filter((c) => c.category === "Git");
    expect(gitChecks.length).toBe(1);
    expect(gitChecks[0].status).toBe("skip");
    expect(gitChecks[0].detail).toContain("git init");
  });

  test("fails when provider connection fails", async () => {
    git.getGitStatus.mockRejectedValue(new Error("not a repo"));
    ai.checkAIConnection.mockResolvedValue({
      connected: false,
      error: "connection refused",
    });

    const report = await runDoctorCheck();

    const conn = report.checks.find((c) => c.label === "Connection");
    expect(conn.status).toBe("fail");
    expect(conn.detail).toBe("connection refused");
    expect(report.failed).toBeGreaterThan(0);
  });

  test("fails when the configured provider is missing its API key", async () => {
    configHelper.getConfig.mockReturnValue({
      ...configHelper.getConfig(),
      aiProvider: "openai",
      openaiApiKey: "",
    });
    git.getGitStatus.mockRejectedValue(new Error("not a repo"));
    ai.checkAIConnection.mockResolvedValue({ connected: true });

    const report = await runDoctorCheck();

    const keyCheck = report.checks.find(
      (c) => c.label === "API key configured"
    );
    expect(keyCheck.status).toBe("fail");
    expect(keyCheck.detail).toContain("openaiApiKey missing");
  });

  test("fails when bedrock mantle is missing its API key", async () => {
    configHelper.getConfig.mockReturnValue({
      ...configHelper.getConfig(),
      aiProvider: "bedrockmantle",
      bedrockMantleApiKey: "",
    });
    git.getGitStatus.mockRejectedValue(new Error("not a repo"));
    ai.checkAIConnection.mockResolvedValue({ connected: true });

    const report = await runDoctorCheck();

    const keyCheck = report.checks.find(
      (c) => c.label === "API key configured"
    );
    expect(keyCheck.status).toBe("fail");
    expect(keyCheck.detail).toContain("bedrockMantleApiKey missing");
  });

  test("fails on malformed config JSON", async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue("{ not valid json");
    git.getGitStatus.mockRejectedValue(new Error("not a repo"));
    ai.checkAIConnection.mockResolvedValue({ connected: true });

    const report = await runDoctorCheck();

    const jsonCheck = report.checks.find(
      (c) => c.label === "Config JSON valid"
    );
    expect(jsonCheck.status).toBe("fail");
  });

  test("fails when config file permissions are not 0600", async () => {
    fs.existsSync.mockReturnValue(true);
    fs.statSync.mockReturnValue({ mode: 0o644 });
    git.getGitStatus.mockRejectedValue(new Error("not a repo"));
    ai.checkAIConnection.mockResolvedValue({ connected: true });

    const report = await runDoctorCheck();

    const permCheck = report.checks.find(
      (c) => c.label === "Config file permissions"
    );
    expect(permCheck.status).toBe("fail");
    expect(permCheck.detail).toContain("0600");
  });

  test("warns on an empty model for providers that need one", async () => {
    configHelper.getConfig.mockReturnValue({
      ...configHelper.getConfig(),
      aiProvider: "ollama",
      ollamaModel: "",
    });
    git.getGitStatus.mockRejectedValue(new Error("not a repo"));
    ai.checkAIConnection.mockResolvedValue({ connected: true, models: [] });

    const report = await runDoctorCheck();

    const modelCheck = report.checks.find(
      (c) => c.label === "Model configured"
    );
    expect(modelCheck.status).toBe("warn");
  });

  test("skips the provider network check with skipProvider", async () => {
    git.getGitStatus.mockRejectedValue(new Error("not a repo"));

    const report = await runDoctorCheck({ skipProvider: true });

    expect(ai.checkAIConnection).not.toHaveBeenCalled();
    const conn = report.checks.find((c) => c.label === "Connection");
    expect(conn.status).toBe("skip");
  });
});
