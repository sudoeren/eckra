const fs = require("fs");
const os = require("os");
const { execSync } = require("child_process");

jest.mock("fs");
jest.mock("child_process");
jest.mock("../src/helpers/config", () => ({
  getConfig: jest.fn(() => ({ theme: "auto" })),
}));

const config = require("../src/helpers/config");
const theme = require("../src/helpers/theme");

const HOME = "/home/u";
const MAIN_CONFIG = `${HOME}/.config/alacritty/alacritty.toml`;
const CACHE_PATH = `${HOME}/.eckra/theme-cache.json`;

describe("Theme helper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    theme.resetThemeCache();
    config.getConfig.mockReturnValue({ theme: "auto" });

    jest.spyOn(os, "homedir").mockReturnValue(HOME);

    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue("");
    fs.realpathSync.mockImplementation((p) => p);
    fs.readdirSync.mockReturnValue([]);
    fs.mkdirSync.mockImplementation(() => {});
    fs.writeFileSync.mockImplementation(() => {});
  });

  describe("color parsing", () => {
    test("parses #RRGGBB, 0xRRGGBB and #RGB", () => {
      expect(theme.parseColor("#181818")).toEqual({ r: 24, g: 24, b: 24 });
      expect(theme.parseColor("0x181818")).toEqual({ r: 24, g: 24, b: 24 });
      expect(theme.parseColor("#abc")).toEqual({ r: 170, g: 187, b: 204 });
      expect(theme.parseColor("nope")).toBeNull();
    });

    test("parses OSC rgb short and long channel forms", () => {
      expect(theme.parseColor("rgb:ffff/0000/0000")).toEqual({
        r: 255,
        g: 0,
        b: 0,
      });
      expect(theme.parseColor("rgb:f/0/0")).toEqual({ r: 255, g: 0, b: 0 });
      expect(theme.parseColor("rgb:1e1e/1e1e/1e1e")).toEqual({
        r: 30,
        g: 30,
        b: 30,
      });
    });

    test("classifies luminance as dark or light", () => {
      expect(theme.isDarkLuminance({ r: 255, g: 255, b: 255 })).toBe(false);
      expect(theme.isDarkLuminance({ r: 0, g: 0, b: 0 })).toBe(true);
      expect(theme.isDarkLuminance(null)).toBeNull();
    });

    test("parses OSC 11 responses with ST and BEL terminators", () => {
      expect(
        theme.parseOscColorResponse("\u001b]11;rgb:1e1e/1e1e/1e1e\u0007")
      ).toEqual({ r: 30, g: 30, b: 30 });
      expect(theme.parseOscColorResponse("\u001b]11;#ffffff\u001b\\")).toEqual({
        r: 255,
        g: 255,
        b: 255,
      });
      expect(theme.parseOscColorResponse("garbage")).toBeNull();
    });
  });

  describe("terminal query", () => {
    test("skips when not a TTY, on Windows, or when disabled", () => {
      expect(theme.queryTerminalBackground({ isTTY: false })).toBeNull();
      expect(
        theme.queryTerminalBackground({ isTTY: true, platform: "win32" })
      ).toBeNull();
      expect(
        theme.queryTerminalBackground({
          isTTY: true,
          env: { ECKRA_THEME_NO_QUERY: "1" },
        })
      ).toBeNull();
    });

    test("parses an injected response", () => {
      const result = theme.queryTerminalBackground({
        isTTY: true,
        platform: "linux",
        env: {},
        timeout: 5,
        write: () => {},
        readChunk: () => "\u001b]11;rgb:0000/0000/0000\u001b\\",
      });
      expect(result).toEqual({
        rgb: { r: 0, g: 0, b: 0 },
        background: "#000000",
      });
    });
  });

  describe("alacritty config locations", () => {
    test("honors XDG_CONFIG_HOME and includes legacy paths", () => {
      const candidates = theme.getAlacrittyConfigCandidates(
        { XDG_CONFIG_HOME: "/xdg" },
        "linux",
        HOME
      );
      expect(candidates[0]).toBe("/xdg/alacritty/alacritty.toml");
      expect(candidates).toContain(`${HOME}/.alacritty.toml`);
      expect(candidates).toContain("/etc/alacritty/alacritty.toml");
    });

    test("uses %APPDATA% on Windows", () => {
      const candidates = theme.getAlacrittyConfigCandidates(
        { APPDATA: "C:\\Users\\u\\AppData\\Roaming" },
        "win32",
        "C:\\Users\\u"
      );
      expect(candidates[0]).toBe(
        "C:\\Users\\u\\AppData\\Roaming\\alacritty\\alacritty.toml"
      );
    });
  });

  describe("imports", () => {
    test("reads TOML and YAML import lists", () => {
      const toml =
        "[general]\nimport = [\n  \"~/.config/alacritty/a.toml\",\n  'b.toml',\n]\n";
      expect(theme.readConfigImports(toml)).toEqual([
        "~/.config/alacritty/a.toml",
        "b.toml",
      ]);

      const yaml = "import:\n  - ~/.config/alacritty/a.yml\n  - b.yml\n";
      expect(theme.readConfigImports(yaml)).toEqual([
        "~/.config/alacritty/a.yml",
        "b.yml",
      ]);
    });

    test("resolves ~, absolute and relative import paths", () => {
      expect(theme.expandImportPath("~/x.toml", "/tmp", HOME)).toBe(
        `${HOME}/x.toml`
      );
      expect(theme.expandImportPath("/abs/x.toml", "/tmp", HOME)).toBe(
        "/abs/x.toml"
      );
      expect(theme.expandImportPath("rel/x.toml", "/tmp/cfg", HOME)).toBe(
        "/tmp/cfg/rel/x.toml"
      );
    });

    test("matches simple globs", () => {
      expect(theme.globToRegExp("/a/*.toml").test("/a/b.toml")).toBe(true);
      expect(theme.globToRegExp("/a/*.toml").test("/a/nested/b.toml")).toBe(
        false
      );

      fs.readdirSync.mockImplementation((dir) =>
        dir === "/cfg/themes"
          ? [
              { name: "a.toml", isDirectory: () => false },
              { name: "b.txt", isDirectory: () => false },
            ]
          : []
      );
      expect(theme.expandGlob("/cfg/themes/*.toml")).toEqual([
        "/cfg/themes/a.toml",
      ]);
    });
  });

  describe("background extraction", () => {
    test("supports TOML section, dotted key and YAML", () => {
      expect(
        theme.extractBackgroundValues(
          '[colors.primary]\nbackground = "#101010"\n'
        )
      ).toEqual(["#101010"]);
      expect(
        theme.extractBackgroundValues('colors.primary.background = "#101010"')
      ).toEqual(["#101010"]);
      expect(
        theme.extractBackgroundValues(
          "colors:\n  primary:\n    background: '#202020'\n"
        )
      ).toEqual(["#202020"]);
    });

    test("imported values are overridden by the importing file", () => {
      const themeFile = `${HOME}/.config/alacritty/themes/dark.toml`;
      const themesDir = `${HOME}/.config/alacritty/themes`;
      fs.existsSync.mockImplementation(
        (p) => p === MAIN_CONFIG || p === themeFile
      );
      fs.readFileSync.mockImplementation((p) => {
        if (p === MAIN_CONFIG) {
          return '[general]\nimport = ["~/.config/alacritty/themes/*.toml"]\n[colors.primary]\nbackground = "#eeeeee"\n';
        }
        if (p === themeFile) {
          return '[colors.primary]\nbackground = "#101010"\n';
        }
        return "";
      });
      fs.readdirSync.mockImplementation((dir) =>
        dir === themesDir
          ? [{ name: "dark.toml", isDirectory: () => false }]
          : []
      );

      const result = theme.detectAlacrittyDark({
        env: {},
        platform: "linux",
        home: HOME,
      });
      expect(result.background).toBe("#eeeeee");
      expect(result.isDark).toBe(false);
    });

    test("returns null when no background can be resolved", () => {
      fs.existsSync.mockImplementation((p) => p === MAIN_CONFIG);
      fs.readFileSync.mockImplementation((p) =>
        p === MAIN_CONFIG
          ? '[general]\nimport = ["/nonexistent.toml"]\n[window]\nopacity = 0.9\n'
          : ""
      );
      expect(
        theme.detectAlacrittyDark({ env: {}, platform: "linux", home: HOME })
      ).toBeNull();
    });

    test("detects a dark background", () => {
      fs.existsSync.mockImplementation((p) => p === MAIN_CONFIG);
      fs.readFileSync.mockImplementation((p) =>
        p === MAIN_CONFIG ? 'colors.primary.background = "#101010"' : ""
      );
      const result = theme.detectAlacrittyDark({
        env: {},
        platform: "linux",
        home: HOME,
      });
      expect(result.isDark).toBe(true);
      expect(result.background).toBe("#101010");
      expect(result.configPath).toBe(MAIN_CONFIG);
    });
  });

  describe("detection priority", () => {
    test("live OSC query wins over Alacritty and the OS", () => {
      const info = theme.detectThemeInfo({
        isTTY: true,
        env: {},
        platform: "linux",
        timeout: 5,
        write: () => {},
        readChunk: () => "\u001b]11;rgb:ffff/ffff/ffff\u001b\\",
      });
      expect(info.source).toBe("OSC 11");
      expect(info.isDark).toBe(false);
    });

    test("Alacritty config wins over the desktop theme", () => {
      fs.existsSync.mockImplementation((p) => p === MAIN_CONFIG);
      fs.readFileSync.mockImplementation((p) =>
        p === MAIN_CONFIG ? 'colors.primary.background = "#101010"' : ""
      );
      execSync.mockImplementation(() => Buffer.from("'prefer-light'\n"));

      const info = theme.detectThemeInfo({
        skipQuery: true,
        env: {},
        platform: "linux",
        home: HOME,
      });
      expect(info.source).toBe("alacritty config");
      expect(info.isDark).toBe(true);
    });

    test("falls back to the desktop theme when no terminal signal exists", () => {
      fs.existsSync.mockReturnValue(false);
      execSync.mockImplementation((cmd) => {
        if (cmd.includes("gsettings")) return Buffer.from("'prefer-dark'\n");
        throw new Error("not found");
      });

      const info = theme.detectThemeInfo({
        skipQuery: true,
        env: {},
        platform: "linux",
        home: HOME,
      });
      expect(info.source).toBe("GNOME");
      expect(info.isDark).toBe(true);
    });
  });

  describe("selection and cache", () => {
    test("explicit theme bypasses detection", () => {
      config.getConfig.mockReturnValue({ theme: "light" });
      expect(theme.getThemeName()).toBe("light");
      expect(theme.getThemeInfo().source).toBe("user");

      theme.resetThemeCache();
      config.getConfig.mockReturnValue({ theme: "dark" });
      expect(theme.getThemeName()).toBe("dark");
    });

    test("auto follows the detected background", () => {
      config.getConfig.mockReturnValue({ theme: "auto" });
      fs.existsSync.mockImplementation((p) => p === MAIN_CONFIG);
      fs.readFileSync.mockImplementation((p) =>
        p === MAIN_CONFIG ? 'colors.primary.background = "#101010"' : ""
      );
      expect(theme.getThemeName()).toBe("dark");
    });

    test("refresh bypasses the cached result", () => {
      config.getConfig.mockReturnValue({ theme: "auto" });
      fs.existsSync.mockImplementation((p) => p === CACHE_PATH);
      fs.readFileSync.mockImplementation((p) =>
        p === CACHE_PATH
          ? JSON.stringify({
              isDark: false,
              source: "OSC 11",
              term: "xterm-256color",
              ts: Date.now(),
            })
          : ""
      );
      const originalTerm = process.env.TERM;

      process.env.TERM = "xterm-256color";
      expect(theme.getThemeInfo().effective).toBe("light");

      fs.existsSync.mockImplementation((p) => p === MAIN_CONFIG);
      fs.readFileSync.mockImplementation((p) =>
        p === MAIN_CONFIG ? 'colors.primary.background = "#101010"' : ""
      );
      const refreshed = theme.getThemeInfo({ refresh: true });
      expect(refreshed.source).toBe("alacritty config");
      expect(refreshed.effective).toBe("dark");

      process.env.TERM = originalTerm;
    });

    test("invalidates the cache when TERM changes", () => {
      fs.existsSync.mockImplementation((p) => p === CACHE_PATH);
      fs.readFileSync.mockImplementation((p) =>
        p === CACHE_PATH
          ? JSON.stringify({
              isDark: false,
              source: "OSC 11",
              term: "xterm-256color",
              ts: Date.now(),
            })
          : ""
      );
      const originalTerm = process.env.TERM;

      process.env.TERM = "xterm-256color";
      theme.resetThemeCache();
      expect(theme.isDarkMode()).toBe(false);

      // Cache is now stale because TERM changed; detection runs again.
      fs.existsSync.mockImplementation((p) => p === MAIN_CONFIG);
      fs.readFileSync.mockImplementation((p) =>
        p === MAIN_CONFIG ? 'colors.primary.background = "#101010"' : ""
      );
      process.env.TERM = "alacritty";
      theme.resetThemeCache();
      expect(theme.isDarkMode()).toBe(true);

      process.env.TERM = originalTerm;
    });
  });
});
