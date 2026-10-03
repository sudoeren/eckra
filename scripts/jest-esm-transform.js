const { transformSync } = require("esbuild");

// Jest loads modules as CommonJS and cannot require() ESM-only packages.
// The packages listed in package.json's jest.transformIgnorePatterns are
// converted to CommonJS on the fly with esbuild (already a dev dependency
// for the bundle), so tests run against the real package.
module.exports = {
  process(source, filename) {
    const { code } = transformSync(source, {
      format: "cjs",
      loader: "js",
      target: "node22",
      sourcefile: filename,
    });
    return { code };
  },
};
