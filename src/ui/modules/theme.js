const { s } = require("../common");
const {
  VALID_THEMES,
  getThemeInfo,
  resetThemeCache,
} = require("../../helpers/theme");
const { saveConfig } = require("../../helpers/config");

function printThemeInfo(info) {
  console.log();
  console.log(`  ${s.muted("Theme:")} ${s.text(info.selected)}`);

  if (info.selected === "auto") {
    const effective =
      info.effective === "dark" ? s.text("dark") : s.text("light");
    console.log(
      `  ${s.muted("Effective:")} ${effective} ${s.dim("(detected)")}`
    );
    console.log(`  ${s.muted("Source:")} ${s.text(info.source)}`);
    if (info.background) {
      console.log(`  ${s.muted("Background:")} ${s.text(info.background)}`);
    }
    if (info.configPath) {
      console.log(`  ${s.muted("Config:")} ${s.dim(info.configPath)}`);
    }
  }

  if (info.terminal) {
    console.log(`  ${s.muted("Terminal:")} ${s.text(info.terminal)}`);
  }
  console.log();
}

async function doThemeCommand(mode, options = {}) {
  const { detect = false } = options;

  if (mode && mode !== "detect" && !VALID_THEMES.includes(mode)) {
    console.log(
      s.error(
        `  ✗ Unknown theme: "${mode}". Valid: auto, dark, light (or "detect")`
      )
    );
    process.exitCode = 1;
    return;
  }

  if (mode === "detect") {
    printThemeInfo(getThemeInfo({ refresh: true }));
    return;
  }

  if (mode) {
    saveConfig({ theme: mode });
    resetThemeCache();
    console.log(s.success(`\n  ✓ Theme set to ${mode}`));
    if (mode === "auto") printThemeInfo(getThemeInfo({ refresh: true }));
    return;
  }

  printThemeInfo(getThemeInfo({ refresh: detect }));
}

module.exports = { doThemeCommand, printThemeInfo };
