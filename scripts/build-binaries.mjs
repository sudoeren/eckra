#!/usr/bin/env node
// Build standalone executables with @yao-pkg/pkg. pkg cross-compiles, so a
// single Linux runner can produce the Windows and arm64 binaries too.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = path.join(root, "dist", "eckra.cjs");

const TARGETS = [
  { target: "node22-linux-x64", output: "eckra-linux-x64" },
  { target: "node22-linux-arm64", output: "eckra-linux-arm64" },
  { target: "node22-win-x64", output: "eckra-win-x64.exe" },
];

const pkgBin = path.join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "pkg.cmd" : "pkg"
);

execFileSync(process.execPath, [path.join(root, "scripts", "build-bundle.mjs")], {
  cwd: root,
  stdio: "inherit",
});

for (const { target, output } of TARGETS) {
  console.log(`\n▶ Building ${output} (${target})...`);
  execFileSync(
    pkgBin,
    [
      bundle,
      "--targets",
      target,
      // V8 bytecode can't always be generated when cross-compiling (e.g.
      // arm64 from x64); fall back to shipping the plain bundled source.
      "--fallback-to-source",
      "--output",
      path.join("dist", output),
    ],
    {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32",
    }
  );
}

console.log("\n✓ Standalone binaries written to dist/");
