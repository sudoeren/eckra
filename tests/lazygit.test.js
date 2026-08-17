const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  getLazygitConfigPath,
  getLazygitBlock,
  getLazygitKey,
  getLazygitKeyConflictWarning,
  normalizeLazygitKey,
  ensureLazygitCommand,
  removeLazygitCommand,
} = require("../src/helpers/lazygit");
const configHelper = require("../src/helpers/config");

jest.mock("fs");
jest.mock("../src/helpers/config");

describe("Lazygit Helper", () => {
  const originalPlatform = process.platform;
  const originalEnv = { ...process.env };

  function setPlatform(p) {
    Object.defineProperty(process, "platform", {
      value: p,
      configurable: true,
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(os, "homedir").mockReturnValue("/home/test");
    configHelper.getConfig.mockReturnValue({ lazygitKey: "C" });
    delete process.env.LAZYGIT_CONFIG;
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.APPDATA;
    setPlatform("linux");
  });

  afterAll(() => {
    setPlatform(originalPlatform);
    process.env = originalEnv;
  });

  test("linux default config path uses ~/.config", () => {
    expect(getLazygitConfigPath()).toBe(
      "/home/test/.config/lazygit/config.yml"
    );
  });

  test("XDG_CONFIG_HOME is honored", () => {
    process.env.XDG_CONFIG_HOME = "/tmp/xdg";
    expect(getLazygitConfigPath()).toBe("/tmp/xdg/lazygit/config.yml");
  });

  test("LAZYGIT_CONFIG overrides everything", () => {
    process.env.LAZYGIT_CONFIG = "/custom/lg.yml";
    expect(getLazygitConfigPath()).toBe("/custom/lg.yml");
  });

  test("macOS uses Library/Application Support", () => {
    setPlatform("darwin");
    expect(getLazygitConfigPath()).toBe(
      "/home/test/Library/Application Support/lazygit/config.yml"
    );
  });

  test("windows uses APPDATA", () => {
    setPlatform("win32");
    process.env.APPDATA = "C:\\Users\\test\\AppData\\Roaming";
    expect(getLazygitConfigPath()).toBe(
      path.join("C:\\Users\\test\\AppData\\Roaming", "lazygit", "config.yml")
    );
  });

  test("install creates the file when missing", () => {
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockImplementation(() => {});

    const result = ensureLazygitCommand();

    expect(result.changed).toBe(true);
    expect(fs.mkdirSync).toHaveBeenCalledWith("/home/test/.config/lazygit", {
      recursive: true,
    });
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      "/home/test/.config/lazygit/config.yml",
      expect.stringContaining("customCommands:"),
      "utf8"
    );
  });

  test("block installs a single C shortcut to the interactive commit flow", () => {
    const block = getLazygitBlock();
    expect(block).toContain("- key: 'C'");
    expect(block).toContain("command: 'eckra commit'");
    expect(block).toContain("subprocess: true");
    expect(block).not.toContain("<c-g>");
    expect(block).not.toContain("<c-h>");
    expect(block).not.toMatch(/',$/m);
  });

  test("getLazygitKey defaults to uppercase C from config", () => {
    expect(getLazygitKey()).toBe("C");
  });

  test("getLazygitKey falls back to C when config key is invalid", () => {
    configHelper.getConfig.mockReturnValue({ lazygitKey: "bad key" });
    expect(getLazygitKey()).toBe("C");
  });

  test("block uses the configured lazygit key", () => {
    configHelper.getConfig.mockReturnValue({ lazygitKey: "j" });
    const block = getLazygitBlock();
    expect(block).toContain("- key: 'J'");
    expect(block).not.toContain("- key: 'C'");
  });

  test("block accepts an explicit key and uppercases it", () => {
    const block = getLazygitBlock("j");
    expect(block).toContain("- key: 'J'");
  });

  test("normalizeLazygitKey uppercases a single letter", () => {
    expect(normalizeLazygitKey("j")).toBe("J");
    expect(normalizeLazygitKey(" C ")).toBe("C");
  });

  test("normalizeLazygitKey rejects invalid values", () => {
    expect(normalizeLazygitKey("ab")).toBeNull();
    expect(normalizeLazygitKey("1")).toBeNull();
    expect(normalizeLazygitKey("")).toBeNull();
    expect(normalizeLazygitKey(null)).toBeNull();
    expect(normalizeLazygitKey(undefined)).toBeNull();
  });

  test("conflict warning flags lazygit default keys but allows them", () => {
    expect(getLazygitKeyConflictWarning("c")).not.toBeNull();
    expect(getLazygitKeyConflictWarning("a")).not.toBeNull();
    expect(getLazygitKeyConflictWarning("p")).not.toBeNull();
  });

  test("no conflict warning for a free key", () => {
    expect(getLazygitKeyConflictWarning("g")).toBeNull();
  });

  test("install is idempotent when markers exist", () => {
    const content =
      "customCommands:\n  # --- begin eckra (managed by eckra) ---\n  - key: 'C'\n  # --- end eckra ---\n";
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(content);

    const result = ensureLazygitCommand();

    expect(result.changed).toBe(false);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  test("install inserts after an existing customCommands key", () => {
    const content =
      "# my config\ngui:\n  theme: dark\ncustomCommands:\n  - key: 'z'\n    command: 'echo hi'\n";
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(content);

    const result = ensureLazygitCommand();

    expect(result.changed).toBe(true);
    const [, written] = fs.writeFileSync.mock.calls[0];
    expect(written).toContain("- key: 'z'");
    expect(written).toContain("- key: 'C'");
    expect(written).toContain("# --- begin eckra");
  });

  test("install appends a customCommands key when none exists", () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(
      "# my config\nkeybinding:\n  universal: x\n"
    );

    const result = ensureLazygitCommand();

    expect(result.changed).toBe(true);
    const [, written] = fs.writeFileSync.mock.calls[0];
    expect(written).toContain("# my config");
    expect(written).toContain("\ncustomCommands:\n");
  });

  test("remove deletes the eckra block", () => {
    const content =
      "customCommands:\n  - key: 'z'\n    command: 'echo hi'\n  # --- begin eckra (managed by eckra) ---\n  - key: 'C'\n  # --- end eckra ---\n";
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(content);

    const result = removeLazygitCommand();

    expect(result.changed).toBe(true);
    const [, written] = fs.writeFileSync.mock.calls[0];
    expect(written).not.toContain("eckra");
    expect(written).toContain("- key: 'z'");
  });

  test("remove returns changed false when not installed", () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue("customCommands:\n  - key: 'z'\n");

    const result = removeLazygitCommand();

    expect(result.changed).toBe(false);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  test("remove cleans up an emptied customCommands key", () => {
    const content =
      "customCommands:\n  # --- begin eckra (managed by eckra) ---\n  - key: 'C'\n  # --- end eckra ---\n";
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(content);

    const result = removeLazygitCommand();

    expect(result.changed).toBe(true);
    const [, written] = fs.writeFileSync.mock.calls[0];
    expect(written).not.toContain("customCommands");
    expect(written).not.toContain("eckra");
  });
});
