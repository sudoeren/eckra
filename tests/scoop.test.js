const fs = require("fs");
const path = require("path");
const manifest = require("../packaging/scoop/eckra.json");

describe("Scoop manifest", () => {
  // The manifest version is bumped by the release workflow, so it is checked
  // for internal consistency rather than against package.json (which is
  // already bumped when the publish job runs its tests).
  test("points at the release asset for its own version", () => {
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    const arch = manifest.architecture["64bit"];
    expect(arch.url).toContain(`v${manifest.version}/eckra-win-x64.exe`);
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
