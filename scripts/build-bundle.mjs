#!/usr/bin/env node
// Bundle the CLI and its (partly ESM-only) dependencies into a single
// CommonJS file so @yao-pkg/pkg can turn it into a standalone executable.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: [path.join(root, "src", "index.js")],
  outfile: path.join(root, "dist", "eckra.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  logLevel: "info",
});
