const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const projectRoot = path.join(__dirname, "..");

describe("Project regression checks", () => {
  test("CLI version should match package version", () => {
    const pkg = require("../package.json");
    const output = execFileSync(
      process.execPath,
      ["src/index.js", "--version"],
      {
        cwd: projectRoot,
        encoding: "utf8",
      }
    ).trim();

    expect(output).toBe(pkg.version);
  });

  test("release scripts should not publish twice", () => {
    const pkg = require("../package.json");

    expect(pkg.scripts["release:patch"]).not.toContain("npm publish");
    expect(pkg.scripts["release:minor"]).not.toContain("npm publish");
    expect(pkg.scripts["release:major"]).not.toContain("npm publish");
  });

  test("local project config should be ignored by git", () => {
    const gitignore = fs.readFileSync(
      path.join(projectRoot, ".gitignore"),
      "utf8"
    );

    expect(gitignore.split(/\r?\n/)).toContain(".eckrarc");
  });
});
