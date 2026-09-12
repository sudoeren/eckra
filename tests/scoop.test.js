const fs = require("fs");
const path = require("path");
const manifest = require("../packaging/scoop/eckra.json");
const pkg = require("../package.json");

describe("Scoop manifest", () => {
  test("matches the package version and points at the release asset", () => {
    expect(manifest.version).toBe(pkg.version);
    const arch = manifest.architecture["64bit"];
    expect(arch.url).toContain(`v${pkg.version}/eckra-win-x64.exe`);
    expect(arch.url).toContain("#/eckra.exe");
    expect(arch.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("exposes the eckra binary and knows how to check/auto-update", () => {
    expect(manifest.bin).toBe("eckra.exe");
    expect(manifest.checkver).toEqual({
      github: "https://github.com/sudoeren/eckra",
    });
    expect(manifest.autoupdate.architecture["64bit"].url).toContain(
      "v$version/eckra-win-x64.exe"
    );
  });

  test("is valid JSON on disk", () => {
    const raw = fs.readFileSync(
      path.join(__dirname, "..", "packaging", "scoop", "eckra.json"),
      "utf8"
    );
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});
