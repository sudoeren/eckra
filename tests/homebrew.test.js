const fs = require("fs");
const path = require("path");

const formula = fs.readFileSync(
  path.join(__dirname, "..", "Formula", "eckra.rb"),
  "utf8"
);

describe("Homebrew formula", () => {
  // The formula version is bumped by the release workflow, so it is checked
  // for internal consistency rather than against package.json (which is
  // already bumped when the publish job runs its tests).
  test("targets the published npm tarball for its own version", () => {
    expect(formula).toContain("class Eckra < Formula");
    expect(formula).toMatch(
      /https:\/\/registry\.npmjs\.org\/eckra\/-\/eckra-\d+\.\d+\.\d+\.tgz/
    );
    expect(formula.match(/sha256 "[0-9a-f]{64}"/)).not.toBeNull();
  });

  test("installs with std_npm_args and links the binary", () => {
    expect(formula).toContain('depends_on "node"');
    expect(formula).toContain('system "npm", "install", *std_npm_args');
    expect(formula).toContain('bin.install_symlink libexec.glob("bin/*")');
  });

  test("declares head and livecheck", () => {
    expect(formula).toContain(
      'head "https://github.com/sudoeren/eckra.git", branch: "master"'
    );
    expect(formula).toContain("livecheck do");
    expect(formula).toContain("registry.npmjs.org/eckra/latest");
  });
});
