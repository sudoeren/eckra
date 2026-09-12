#!/usr/bin/env node
// Build standalone executables with @yao-pkg/pkg. pkg cross-compiles, so a
// single runner can produce binaries for other platforms; macOS targets are
// ad-hoc signed by pkg (run them on macOS for a working signature).
//
// Usage: node scripts/build-binaries.mjs [group ...]
//   groups: linux, win, macos, all   (default: linux win)
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import targets from "./targets.js";

const { selectTargets } = targets;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = path.join(root, "dist", "eckra.cjs");

const selected = selectTargets(process.argv.slice(2));

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

for (const { target, output } of selected) {
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
