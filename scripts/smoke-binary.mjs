#!/usr/bin/env node
// Smoke test a built standalone binary: it must run and report the package
// version. Usage: node scripts/smoke-binary.mjs <path-to-binary>
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = process.argv[2];

if (!arg) {
  console.error("usage: node scripts/smoke-binary.mjs <path-to-binary>");
  process.exit(1);
}

const binary = path.resolve(root, arg);
if (!existsSync(binary)) {
  console.error(`binary not found: ${binary}`);
  process.exit(1);
}

const { version } = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8")
);

const output = execFileSync(binary, ["--version"], { encoding: "utf8" }).trim();
if (output !== version) {
  console.error(`unexpected version: "${output}" (expected "${version}")`);
  process.exit(1);
}

console.log(`✓ ${path.basename(binary)} → ${output}`);
