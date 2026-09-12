#!/usr/bin/env node
// Regenerate packaging/scoop/eckra.json from the current version and the
// freshly built Windows binary. Run after `npm run build:binaries`.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8")
);

const exe = path.join(root, "dist", "eckra-win-x64.exe");
let hash;
try {
  hash = createHash("sha256").update(readFileSync(exe)).digest("hex");
} catch {
  console.error(
    `error: ${path.relative(root, exe)} not found — run "npm run build:binaries" first`
  );
  process.exit(1);
}

const manifest = {
  $schema:
    "https://raw.githubusercontent.com/ScoopInstaller/Scoop/master/schema.json",
  version,
  description: "AI-powered Git management CLI",
  homepage: "https://github.com/sudoeren/eckra",
  license: "MIT",
  architecture: {
    "64bit": {
      url: `https://github.com/sudoeren/eckra/releases/download/v${version}/eckra-win-x64.exe#/eckra.exe`,
      hash,
    },
  },
  bin: "eckra.exe",
  checkver: { github: "https://github.com/sudoeren/eckra" },
  autoupdate: {
    architecture: {
      "64bit": {
        url: "https://github.com/sudoeren/eckra/releases/download/v$version/eckra-win-x64.exe#/eckra.exe",
      },
    },
  },
};

const out = path.join(root, "packaging", "scoop", "eckra.json");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");
console.log(`✓ ${path.relative(root, out)} → v${version} (${hash})`);
