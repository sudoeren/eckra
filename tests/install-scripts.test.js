const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SCRIPTS = path.join(__dirname, "..", "scripts");
const read = (name) => fs.readFileSync(path.join(SCRIPTS, name), "utf8");

// `sh -n` is not available on Windows CI by default.
const shellTest = process.platform === "win32" ? test.skip : test;

describe("install scripts", () => {
  shellTest("install.sh is valid POSIX shell", () => {
    expect(() =>
      execFileSync("sh", ["-n", path.join(SCRIPTS, "install.sh")], {
        stdio: ["ignore", "ignore", "pipe"],
      })
    ).not.toThrow();
  });

  test("install.sh targets the released binaries and verifies checksums", () => {
    const script = read("install.sh");
    expect(script).toContain("eckra-${os_key}-${arch_key}");
    expect(script).toContain("SHA256SUMS");
    expect(script).toContain("sha256sum");
    expect(script).toContain("shasum");
  });

  test("install.sh supports macOS and prefers /usr/local/bin there", () => {
    const script = read("install.sh");
    expect(script).toContain("Darwin");
    expect(script).toContain('os_key="macos"');
    expect(script).toContain("/usr/local/bin");
  });

  test("install.ps1 targets the released Windows binary and verifies checksums", () => {
    const script = read("install.ps1");
    expect(script).toContain("eckra-win-x64.exe");
    expect(script).toContain("SHA256SUMS");
    expect(script).toContain("Get-FileHash");
  });
});
