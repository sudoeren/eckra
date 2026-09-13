const fs = require("fs");
const path = require("path");
const os = require("os");
const { getConfig } = require("./config");

// ═══════════════════════════════════════════════════════════════
// THEME DETECTION
// ═══════════════════════════════════════════════════════════════

const VALID_THEMES = ["auto", "dark", "light"];

const THEME_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const TERMINAL_QUERY_TIMEOUT = 250;
const MAX_IMPORT_DEPTH = 10;
const DARK_LUMINANCE_THRESHOLD = 0.5;

const HEX_TOKEN = "0x[0-9a-fA-F]{6}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}";
const COLOR_TOKEN = `(0x[0-9a-fA-F]{6}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})`;

let _isDark = null;
let _themeName = null;
let _lastInfo = null;

function getThemeCachePath() {
  return path.join(os.homedir(), ".eckra", "theme-cache.json");
}

function readThemeCache() {
  try {
    const file = getThemeCachePath();
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed || typeof parsed.isDark !== "boolean") return null;
    if (Date.now() - parsed.ts >= THEME_CACHE_TTL) return null;
    // The detected theme can change with the terminal (e.g. new TERM).
    const term = process.env.TERM || "";
    if (parsed.term !== undefined && parsed.term !== term) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeThemeCache(info) {
  try {
    const file = getThemeCachePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({
        isDark: info.isDark,
        source: info.source || null,
        background: info.background || null,
        configPath: info.configPath || null,
        term: process.env.TERM || "",
        ts: Date.now(),
      })
    );
  } catch {}
}

function resetThemeCache() {
  _isDark = null;
  _themeName = null;
  _lastInfo = null;
}

// ── Color math ────────────────────────────────────────────────

function hexToRgb(hex) {
  if (typeof hex !== "string") return null;
  let h = hex.trim().replace(/^0x/i, "").replace(/^#/, "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Parse any terminal color we may encounter: #RRGGBB, #RGB, 0xRRGGBB or
 * the OSC rgb:RRRR/GGGG/BBBB (1-4 hex digits per channel) form.
 */
function parseColor(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  const osc = v.match(
    /^rgb:([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})$/
  );
  if (osc) {
    const scale = (s) => {
      const max = Math.pow(16, s.length) - 1;
      return Math.round((parseInt(s, 16) / max) * 255);
    };
    return { r: scale(osc[1]), g: scale(osc[2]), b: scale(osc[3]) };
  }
  return hexToRgb(v);
}

function rgbToHex({ r, g, b }) {
  const part = (v) => Number(v).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

function rgbLuminance({ r, g, b }) {
  const chan = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function isDarkLuminance(rgb) {
  if (!rgb) return null;
  return rgbLuminance(rgb) < DARK_LUMINANCE_THRESHOLD;
}

// ── Live terminal query (OSC 11) ──────────────────────────────

/**
 * Parse the reply to an OSC 10/11 color query. Alacritty, kitty, foot,
 * Ghostty, WezTerm and iTerm2 all answer with `rgb:...`; some answer with
 * a `#RRGGBB` string.
 */
function parseOscColorResponse(data) {
  if (typeof data !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const oscRe = /\u001b\]1[01];([^\u0007\u001b]*)(?:\u0007|\u001b\\)/;
  const match = data.match(oscRe);
  if (!match) return null;
  return parseColor(match[1]);
}

function sleepSync(ms) {
  try {
    const view = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(view, 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      // busy fallback
    }
  }
}

// ── Lazygit detection ─────────────────────────────────────────
// When eckra runs as a lazygit custom command, lazygit suspends and hands
// over the real terminal. lazygit keeps a reader on that terminal, so the
// reply to an OSC 11 query can be stolen and echoed as literal text
// (`11;rgb:...`) once eckra gives up waiting. Skip the live query there and
// fall back to the config/OS signals.

const MAX_ANCESTOR_DEPTH = 10;

/**
 * Read a process' name and parent pid. Linux reads /proc directly; other
 * POSIX platforms shell out to `ps`. Returns null when the info is
 * unavailable. Injectable for tests.
 */
function readProcessInfo(pid, platform) {
  const procPid = pid;
  if (platform === "linux") {
    try {
      const stat = fs.readFileSync(`/proc/${procPid}/stat`, "utf8");
      const open = stat.indexOf("(");
      const close = stat.lastIndexOf(")");
      if (open === -1 || close <= open) return null;
      const name = stat.slice(open + 1, close);
      const rest = stat
        .slice(close + 2)
        .trim()
        .split(/\s+/);
      const ppid = parseInt(rest[1], 10);
      return { name, ppid: Number.isNaN(ppid) ? 0 : ppid };
    } catch {
      return null;
    }
  }

  try {
    const { execSync } = require("child_process");
    const name = execSync(`ps -o comm= -p ${procPid}`, {
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 1000,
    })
      .toString()
      .trim();
    if (!name) return null;
    const ppidOut = execSync(`ps -o ppid= -p ${procPid}`, {
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 1000,
    })
      .toString()
      .trim();
    const ppid = parseInt(ppidOut, 10);
    return { name, ppid: Number.isNaN(ppid) ? 0 : ppid };
  } catch {
    return null;
  }
}

/**
 * Walk the ancestor process tree looking for lazygit. Windows never runs
 * the live query, so it always reports false.
 */
function isRunningUnderLazygit(options = {}) {
  const platform = options.platform || process.platform;
  if (platform === "win32") return false;

  const readProc =
    options.readProc || ((pid) => readProcessInfo(pid, platform));
  let pid = options.ppid !== undefined ? options.ppid : process.ppid;
  const seen = new Set();

  for (let i = 0; i < MAX_ANCESTOR_DEPTH && pid && pid > 0; i++) {
    if (seen.has(pid)) break;
    seen.add(pid);

    const info = readProc(pid);
    if (!info || !info.name) break;
    const base = String(info.name).split(/[\\/]/).pop() || "";
    if (base.toLowerCase().includes("lazygit")) return true;
    pid = info.ppid;
  }

  return false;
}

/**
 * Query the terminal for its actual background color via OSC 11. This is
 * the most reliable signal because it reflects dynamic themes (pywal and
 * friends) that never touch a config file. It only runs on an interactive
 * TTY, never on Windows, and can be disabled with ECKRA_THEME_NO_QUERY=1.
 *
 * `readChunk`/`write` are injectable for tests.
 */
function queryTerminalBackground(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const isTTY =
    options.isTTY !== undefined
      ? options.isTTY
      : Boolean(process.stdout.isTTY && process.stdin.isTTY);

  if (!isTTY || platform === "win32") return null;
  if (env.ECKRA_THEME_NO_QUERY) return null;

  const underLazygit =
    options.isLazygit !== undefined
      ? options.isLazygit
      : isRunningUnderLazygit({ platform });
  if (underLazygit) return null;

  const timeout =
    options.timeout !== undefined ? options.timeout : TERMINAL_QUERY_TIMEOUT;
  const readChunk = options.readChunk || null;
  const write =
    options.write ||
    ((data) => {
      fs.writeSync(1, data);
    });

  let fd = null;
  try {
    if (!readChunk) {
      const constants = fs.constants || {};
      const flags = (constants.O_RDONLY || 0) | (constants.O_NONBLOCK || 0);
      fd = fs.openSync("/dev/tty", flags);
    }

    try {
      write("\u001b]11;?\u001b\\");
    } catch {
      return null;
    }

    const buffer = Buffer.alloc(64);
    const deadline = Date.now() + timeout;
    let acc = "";

    while (Date.now() < deadline) {
      let n = 0;
      if (readChunk) {
        const chunk = readChunk(buffer);
        if (chunk) {
          acc += typeof chunk === "string" ? chunk : chunk.toString("utf8");
          n = 1;
        }
      } else {
        try {
          n = fs.readSync(fd, buffer, 0, buffer.length, null);
        } catch {
          n = 0;
        }
        if (n > 0) acc += buffer.toString("utf8", 0, n);
      }

      const rgb = parseOscColorResponse(acc);
      if (rgb) return { rgb, background: rgbToHex(rgb) };
      if (acc.includes("\u0007") || acc.includes("\u001b\\")) break;
      if (!readChunk && n === 0) sleepSync(10);
    }

    // Consume a late reply so it is not read as stray input later.
    if (!readChunk && fd !== null) {
      const drainDeadline = Date.now() + 50;
      while (Date.now() < drainDeadline) {
        try {
          if (fs.readSync(fd, buffer, 0, buffer.length, null) <= 0) break;
        } catch {
          break;
        }
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
  }
}

// ── Alacritty config ──────────────────────────────────────────

/**
 * Ordered list of Alacritty config paths, matching Alacritty's own lookup
 * order (TOML first, then legacy YAML) on each platform.
 */
function getAlacrittyConfigCandidates(env = {}, platform = "linux", home = "") {
  const seen = new Set();
  const out = [];
  const push = (p) => {
    if (p && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  };

  if (platform === "win32") {
    const appdata = env.APPDATA || path.win32.join(home, "AppData", "Roaming");
    push(path.win32.join(appdata, "alacritty", "alacritty.toml"));
    push(path.win32.join(appdata, "alacritty", "alacritty.yml"));
    return out;
  }

  const xdg = env.XDG_CONFIG_HOME || path.join(home, ".config");
  for (const name of ["alacritty.toml", "alacritty.yml"]) {
    push(path.join(xdg, "alacritty", name));
    push(path.join(xdg, name));
    push(path.join(home, ".config", "alacritty", name));
    push(path.join(home, `.${name}`));
  }
  push("/etc/alacritty/alacritty.toml");
  push("/etc/alacritty/alacritty.yml");
  return out;
}

/**
 * Read the import list from a TOML (`import = [...]`, `general.import`)
 * or legacy YAML (`import:` list) config.
 */
function readConfigImports(content) {
  if (typeof content !== "string") return [];
  const specs = [];

  const tomlRe =
    /(?:^|\n)[ \t]*(?:general\.)?import[ \t]*=[ \t]*\[([\s\S]*?)\]/g;
  let match;
  while ((match = tomlRe.exec(content)) !== null) {
    const quoted = match[1].match(/"[^"\n]+"|'[^'\n]+'/g) || [];
    for (const q of quoted) specs.push(q.slice(1, -1));
  }

  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/^[ \t]*(?:general\.)?import:[ \t]*$/.test(lines[i])) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const item = lines[j].match(/^[ \t]*-[ \t]*["']?([^"'\s]+)["']?[ \t]*$/);
      if (!item) break;
      specs.push(item[1]);
    }
  }

  return specs;
}

function expandImportPath(spec, baseDir, home = os.homedir()) {
  if (typeof spec !== "string" || !spec.trim()) return null;
  let p = spec.trim();
  if (p === "~") p = home;
  else if (p.startsWith("~/")) p = path.join(home, p.slice(2));
  else if (!path.isAbsolute(p)) p = path.resolve(baseDir, p);
  return p;
}

function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++;
      } else {
        re += "[^/]*";
      }
    } else if (ch === "?") {
      re += "[^/]";
    } else if (ch === "[") {
      const end = glob.indexOf("]", i + 1);
      if (end === -1) re += "\\[";
      else {
        re += glob.slice(i, end + 1);
        i = end;
      }
    } else {
      re += ch.replace(/[.+^${}()|\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`);
}

/**
 * Expand a glob path. A tiny implementation is used instead of Node's
 * fs.globSync because eckra supports Node >= 20.
 */
function expandGlob(pattern) {
  if (!/[?*[]/.test(pattern)) return [pattern];

  const parts = pattern.split("/");
  const magicIndex = parts.findIndex((p) => /[?*[]/.test(p));
  let base = parts.slice(0, magicIndex).join("/");
  if (!base) base = "/";

  const regex = globToRegExp(pattern);
  const results = [];
  const walk = (dir, depth) => {
    if (depth > 20) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (regex.test(full)) results.push(full);
    }
  };
  walk(base, 0);
  return results.sort();
}

/**
 * Resolve a config and its includes recursively. Includes come first, in
 * the order they are listed, and the importing file is loaded last so that
 * its values override the includes (Alacritty import semantics).
 */
function collectConfigs(
  file,
  readImports,
  options = {},
  visited = new Set(),
  depth = 0
) {
  if (depth > MAX_IMPORT_DEPTH) return [];

  let real = file;
  try {
    real = fs.realpathSync(file);
  } catch {}
  if (visited.has(real)) return [];
  visited.add(real);

  let content;
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }

  const baseDir = path.dirname(file);
  const home = options.home || os.homedir();
  const configs = [];

  for (const spec of readImports(content)) {
    const expanded = expandImportPath(spec, baseDir, home);
    if (!expanded) continue;
    for (const resolved of expandGlob(expanded)) {
      if (!fs.existsSync(resolved)) continue;
      configs.push(
        ...collectConfigs(resolved, readImports, options, visited, depth + 1)
      );
    }
  }

  configs.push({ path: file, content });
  return configs;
}

function collectAlacrittyConfigs(
  file,
  options = {},
  visited = new Set(),
  depth = 0
) {
  return collectConfigs(file, readConfigImports, options, visited, depth);
}

function extractYamlPrimaryBackground(content) {
  const lines = content.split(/\r?\n/);
  let colorsIndent = -1;
  let primaryIndent = -1;
  let offset = 0;

  for (const line of lines) {
    const lineStart = offset;
    offset += line.length + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;

    if (colorsIndent !== -1 && indent <= colorsIndent) {
      colorsIndent = -1;
      primaryIndent = -1;
    }
    if (/^colors:[ \t]*$/.test(trimmed)) {
      colorsIndent = indent;
      continue;
    }
    if (
      colorsIndent !== -1 &&
      /^primary:[ \t]*$/.test(trimmed) &&
      indent > colorsIndent
    ) {
      primaryIndent = indent;
      continue;
    }
    if (primaryIndent !== -1) {
      if (indent <= primaryIndent) {
        primaryIndent = -1;
        continue;
      }
      const bg = trimmed.match(
        new RegExp(`^background:[ \\t]*["']?(${HEX_TOKEN})["']?[ \\t]*$`)
      );
      if (bg) return { value: bg[1], index: lineStart };
    }
  }
  return null;
}

/**
 * All background color candidates in one config file, in file order. The
 * last one is the effective value.
 */
function extractBackgroundValues(content) {
  if (typeof content !== "string") return [];
  const found = [];
  let match;

  const dottedRe = new RegExp(
    `^[ \\t]*(?:colors\\.)?primary\\.background[ \\t]*=[ \\t]*(?:"([^"]+)"|'([^']+)'|${COLOR_TOKEN})`,
    "gm"
  );
  while ((match = dottedRe.exec(content)) !== null) {
    const idx = match.index;
    found.push({ index: idx, value: match[1] || match[2] || match[3] });
  }

  const sectionRe = /\[colors\.primary\]([\s\S]*?)(?=\n\s*\[|$)/g;
  while ((match = sectionRe.exec(content)) !== null) {
    const bg = match[1].match(
      new RegExp(
        `^[ \\t]*background[ \\t]*=[ \\t]*(?:"([^"]+)"|'([^']+)'|${COLOR_TOKEN})`,
        "m"
      )
    );
    if (bg) {
      const rel = match[1].indexOf(bg[0]);
      found.push({
        index: match.index + rel,
        value: bg[1] || bg[2] || bg[3],
      });
    }
  }

  const yaml = extractYamlPrimaryBackground(content);
  if (yaml) found.push(yaml);

  found.sort((a, b) => a.index - b.index);
  return found.map((f) => f.value);
}

function detectAlacrittyDark(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const home = options.home || os.homedir();

  const candidates = getAlacrittyConfigCandidates(env, platform, home);
  let mainFile = null;
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        mainFile = file;
        break;
      }
    } catch {}
  }
  if (!mainFile) return null;

  const configs = collectAlacrittyConfigs(mainFile, { home });
  let background = null;
  for (const config of configs) {
    const values = extractBackgroundValues(config.content);
    if (values.length) {
      const rgb = parseColor(values[values.length - 1]);
      if (rgb) background = rgb;
    }
  }
  if (!background) return null;

  return {
    isDark: isDarkLuminance(background),
    background: rgbToHex(background),
    configPath: mainFile,
  };
}

// ── Other terminal configs (kitty, Ghostty) ───────────────────

const KITTY_INCLUDE_RE = /^[ \t]*include[ \t]+(.+?)[ \t]*$/gm;
const GHOSTTY_INCLUDE_RE = /^[ \t]*config-file[ \t]*=[ \t]*(.+?)[ \t]*$/gm;
const KITTY_BACKGROUND_RE =
  /^[ \t]*background[ \t]+["']?((?:#|0x)?[0-9a-fA-F]{6})["']?[ \t]*$/gm;
const GHOSTTY_BACKGROUND_RE =
  /^[ \t]*background[ \t]*=[ \t]*["']?((?:#|0x)?[0-9a-fA-F]{6})["']?[ \t]*$/gm;

function readAssignedPaths(content, regex) {
  const specs = [];
  let match;
  regex.lastIndex = 0;
  while ((match = regex.exec(content)) !== null) {
    let spec = match[1].trim();
    const quote = spec[0];
    if ((quote === '"' || quote === "'") && spec.endsWith(quote)) {
      spec = spec.slice(1, -1);
    }
    if (spec) specs.push(spec);
  }
  return specs;
}

function extractHexValues(content, regex) {
  const values = [];
  let match;
  regex.lastIndex = 0;
  while ((match = regex.exec(content)) !== null) {
    const raw = match[1];
    values.push(raw.startsWith("#") || raw.startsWith("0x") ? raw : `#${raw}`);
  }
  return values;
}

function getTerminalConfigCandidates(env, home) {
  const xdg = env.XDG_CONFIG_HOME || path.join(home, ".config");
  const seen = new Set();
  const add = (list, file) => {
    if (file && !seen.has(file)) {
      seen.add(file);
      list.push(file);
    }
  };
  const kitty = [];
  const ghostty = [];
  add(kitty, path.join(xdg, "kitty", "kitty.conf"));
  add(kitty, path.join(home, ".config", "kitty", "kitty.conf"));
  add(ghostty, path.join(xdg, "ghostty", "config"));
  add(ghostty, path.join(home, ".config", "ghostty", "config"));
  return { kitty, ghostty };
}

/**
 * Read the effective background from kitty/Ghostty configs when the live
 * OSC 11 query is unavailable (non-TTY, piped output). Includes
 * (`include` / `config-file`) are inlined with the same override order as
 * Alacritty imports.
 */
function detectOtherTerminalDark(options = {}) {
  const env = options.env || process.env;
  const home = options.home || os.homedir();
  const candidates = getTerminalConfigCandidates(env, home);

  const terminals = [
    {
      name: "kitty",
      files: candidates.kitty,
      readImports: (content) => readAssignedPaths(content, KITTY_INCLUDE_RE),
      extract: (content) => extractHexValues(content, KITTY_BACKGROUND_RE),
    },
    {
      name: "ghostty",
      files: candidates.ghostty,
      readImports: (content) => readAssignedPaths(content, GHOSTTY_INCLUDE_RE),
      extract: (content) => extractHexValues(content, GHOSTTY_BACKGROUND_RE),
    },
  ];

  for (const terminal of terminals) {
    let mainFile = null;
    for (const file of terminal.files) {
      try {
        if (fs.existsSync(file)) {
          mainFile = file;
          break;
        }
      } catch {}
    }
    if (!mainFile) continue;

    const configs = collectConfigs(mainFile, terminal.readImports, { home });
    let background = null;
    for (const config of configs) {
      const values = terminal.extract(config.content);
      if (values.length) {
        const rgb = parseColor(values[values.length - 1]);
        if (rgb) background = rgb;
      }
    }
    if (!background) continue;

    return {
      isDark: isDarkLuminance(background),
      background: rgbToHex(background),
      configPath: mainFile,
      source: `${terminal.name} config`,
    };
  }
  return null;
}

// ── Desktop / OS detection ────────────────────────────────────

/**
 * Determine the KDE theme from kdeglobals. Handles Plasma 5
 * ([General] ColorScheme=) and Plasma 6 ([KDE] LookAndFeelPackage=,
 * plus resolved background colors) and custom color schemes.
 * Returns true/false, or null when nothing conclusive is found.
 */
function detectKdeDarkFromKdeglobals(content) {
  const laf = content.match(/^LookAndFeelPackage\s*=\s*(.+)$/m);
  if (laf) {
    if (/dark/i.test(laf[1])) return true;
    if (/light/i.test(laf[1])) return false;
  }
  const scheme = content.match(/^ColorScheme\s*=\s*(.+)$/m);
  if (scheme) {
    if (/dark/i.test(scheme[1])) return true;
    if (/light/i.test(scheme[1])) return false;
  }
  for (const group of ["Colors:Window", "Colors:View"]) {
    const bg = content.match(
      new RegExp(
        `^\\[${group}\\]\\s*\\n(?:.*\\n)*?BackgroundNormal\\s*=\\s*([\\d,\\s]+)`,
        "m"
      )
    );
    if (bg) {
      const parts = bg[1].split(",").map((p) => parseInt(p, 10));
      if (parts.length === 3 && parts.every((p) => !isNaN(p))) {
        return rgbLuminance({ r: parts[0], g: parts[1], b: parts[2] }) < 0.5;
      }
    }
  }
  return null;
}

function detectOsDark(options = {}) {
  const platform = options.platform || process.platform;
  const home = options.home || os.homedir();
  const { execSync } = require("child_process");

  if (platform === "win32") {
    try {
      const output = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" /v AppsUseLightTheme',
        { stdio: ["pipe", "pipe", "ignore"], timeout: 2000 }
      ).toString();
      return { isDark: output.includes("0x0"), source: "Windows" };
    } catch {
      return null;
    }
  }

  if (platform === "darwin") {
    try {
      const output = execSync("defaults read -g AppleInterfaceStyle", {
        stdio: ["pipe", "pipe", "ignore"],
        timeout: 2000,
      }).toString();
      return { isDark: output.trim() === "Dark", source: "macOS" };
    } catch {
      return null;
    }
  }

  // 1. GNOME via gsettings
  try {
    const out = execSync(
      "gsettings get org.gnome.desktop.interface color-scheme",
      {
        stdio: ["pipe", "pipe", "ignore"],
        timeout: 2000,
      }
    )
      .toString()
      .trim();
    if (out === "'prefer-dark'") return { isDark: true, source: "GNOME" };
    if (out === "'prefer-light'") return { isDark: false, source: "GNOME" };
  } catch {}

  // 2. KDE via kreadconfig (Plasma 6 → kreadconfig6, Plasma 5 → kreadconfig5)
  for (const tool of ["kreadconfig6", "kreadconfig5"]) {
    try {
      const out = execSync(`${tool} --group General --key ColorScheme`, {
        stdio: ["pipe", "pipe", "ignore"],
        timeout: 2000,
      })
        .toString()
        .trim()
        .toLowerCase();
      if (out.includes("dark")) return { isDark: true, source: "KDE" };
      if (out.length > 0) return { isDark: false, source: "KDE" };
    } catch {}
  }

  // 3. KDE via kdeglobals
  try {
    const kdegl = path.join(home, ".config", "kdeglobals");
    if (fs.existsSync(kdegl)) {
      const dark = detectKdeDarkFromKdeglobals(fs.readFileSync(kdegl, "utf8"));
      if (dark !== null) return { isDark: dark, source: "KDE" };
    }
  } catch {}

  // 4. GTK settings.ini
  try {
    const gtkIni = path.join(home, ".config", "gtk-3.0", "settings.ini");
    if (fs.existsSync(gtkIni)) {
      const content = fs.readFileSync(gtkIni, "utf8");
      if (/gtk-application-prefer-dark-theme\s*=\s*1/.test(content)) {
        return { isDark: true, source: "GTK" };
      }
    }
  } catch {}

  return null;
}

function detectEnvDark(options = {}) {
  const env = options.env || process.env;

  if (env.COLORFGBG) {
    const parts = env.COLORFGBG.split(";");
    const bg = parts[parts.length - 1];
    if (bg) {
      const val = parseInt(bg, 10);
      if (!isNaN(val)) return { isDark: val < 8, source: "COLORFGBG" };
    }
  }

  if (env.GTK_THEME && env.GTK_THEME.endsWith("-dark")) {
    return { isDark: true, source: "GTK_THEME" };
  }

  return null;
}

/**
 * Detect the terminal name from common environment hints, for display in
 * `eckra theme`.
 */
function detectTerminalName(env = process.env) {
  if (env.TERM_PROGRAM) return env.TERM_PROGRAM;
  if (env.ALACRITTY_WINDOW_ID || /alacritty/i.test(env.TERM || "")) {
    return "Alacritty";
  }
  if (env.KITTY_WINDOW_ID) return "Kitty";
  if (env.WEZTERM_PANE) return "WezTerm";
  if (env.GHOSTTY_RESOURCES_DIR) return "Ghostty";
  if (env.VTE_VERSION) return "VTE";
  if (env.WT_SESSION) return "Windows Terminal";
  return env.TERM || "unknown";
}

/**
 * Full detection pipeline. Terminal signals (live query, then Alacritty
 * config) take precedence over the desktop theme so a dark terminal on a
 * light desktop is detected correctly.
 */
function detectThemeInfo(options = {}) {
  const osc = options.skipQuery
    ? null
    : queryTerminalBackground({
        env: options.env,
        platform: options.platform,
        isTTY: options.isTTY,
        readChunk: options.readChunk,
        write: options.write,
        timeout: options.timeout,
      });
  if (osc) {
    return {
      isDark: isDarkLuminance(osc.rgb),
      source: "OSC 11",
      background: osc.background,
    };
  }

  const alacritty = detectAlacrittyDark(options);
  if (alacritty) {
    return {
      isDark: alacritty.isDark,
      source: "alacritty config",
      background: alacritty.background,
      configPath: alacritty.configPath,
    };
  }

  const otherTerminal = detectOtherTerminalDark(options);
  if (otherTerminal) {
    return {
      isDark: otherTerminal.isDark,
      source: otherTerminal.source,
      background: otherTerminal.background,
      configPath: otherTerminal.configPath,
    };
  }

  const osInfo = detectOsDark(options);
  if (osInfo) return osInfo;

  const envInfo = detectEnvDark(options);
  if (envInfo) return envInfo;

  return { isDark: false, source: "default", background: null };
}

// ── Public API ────────────────────────────────────────────────

function runDetection() {
  _lastInfo = detectThemeInfo();
  _isDark = _lastInfo.isDark;
  writeThemeCache(_lastInfo);
  return _isDark;
}

function isDarkMode() {
  if (_isDark !== null) return _isDark;

  const cached = readThemeCache();
  if (cached) {
    _isDark = cached.isDark;
    _lastInfo = {
      isDark: cached.isDark,
      source: cached.source || null,
      background: cached.background || null,
      configPath: cached.configPath || null,
    };
    return _isDark;
  }

  return runDetection();
}

function getThemeName() {
  if (_themeName) return _themeName;

  let selected = "auto";
  try {
    selected = getConfig().theme || "auto";
  } catch {}
  if (!VALID_THEMES.includes(selected)) selected = "auto";

  if (selected === "auto") selected = isDarkMode() ? "dark" : "light";
  _themeName = selected;
  return _themeName;
}

/**
 * Structured theme info for the `eckra theme` command.
 * `refresh: true` bypasses the cache and re-detects.
 */
function getThemeInfo(options = {}) {
  let selected = "auto";
  try {
    selected = getConfig().theme || "auto";
  } catch {}
  if (!VALID_THEMES.includes(selected)) selected = "auto";

  const terminal = detectTerminalName();

  if (selected !== "auto") {
    return {
      selected,
      effective: selected,
      source: "user",
      background: null,
      configPath: null,
      terminal,
    };
  }

  if (options.refresh) {
    resetThemeCache();
    runDetection();
  } else if (!_lastInfo) {
    isDarkMode();
  }

  const info = _lastInfo || { isDark: false, source: "default" };
  return {
    selected,
    effective: info.isDark ? "dark" : "light",
    source: info.source || "default",
    background: info.background || null,
    configPath: info.configPath || null,
    terminal,
  };
}

module.exports = {
  VALID_THEMES,
  resetThemeCache,
  isDarkMode,
  getThemeName,
  getThemeInfo,
  // exported for tests
  detectThemeInfo,
  detectAlacrittyDark,
  detectOtherTerminalDark,
  detectOsDark,
  detectEnvDark,
  detectTerminalName,
  detectKdeDarkFromKdeglobals,
  queryTerminalBackground,
  isRunningUnderLazygit,
  readProcessInfo,
  parseOscColorResponse,
  parseColor,
  hexToRgb,
  rgbToHex,
  rgbLuminance,
  isDarkLuminance,
  getAlacrittyConfigCandidates,
  readConfigImports,
  expandImportPath,
  expandGlob,
  globToRegExp,
  collectAlacrittyConfigs,
  extractBackgroundValues,
};
