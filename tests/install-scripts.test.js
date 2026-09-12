const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SCRIPTS = path.join(__dirname, "..", "scripts");
const read = (name) => fs.readFileSync(path.join(SCRIPTS, name), "utf8");

describe("install scripts", () => {
  test("install.sh is valid POSIX shell", () => {
    expect(() =>
      execFileSync("sh", ["-n", path.join(SCRIPTS, "install.sh")], {
        stdio: ["ignore", "ignore", "pipe"],
      })
    ).not.toThrow();
  });

  test("install.sh targets the released Linux binaries and verifies checksums", () => {
    const script = read("install.sh");
    expect(script).toContain("eckra-linux-x64");
    expect(script).toContain("eckra-linux-arm64");
    expect(script).toContain("SHA256SUMS");
    expect(script).toContain("sha256sum");
  });

  test("install.ps1 targets the released Windows binary and verifies checksums", () => {
    const script = read("install.ps1");
    expect(script).toContain("eckra-win-x64.exe");
    expect(script).toContain("SHA256SUMS");
    expect(script).toContain("Get-FileHash");
  });
});
