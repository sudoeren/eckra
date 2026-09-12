#!/usr/bin/env node
// Regenerate Formula/eckra.rb for the current package version. The sha256 is
// taken from the artifact published on npm so the formula always points at
// the real tarball; `npm pack` is used as a fallback when the registry is
// still propagating (it produces the same bytes `npm publish` uploads).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8")
);
const tarballUrl = `https://registry.npmjs.org/eckra/-/eckra-${version}.tgz`;

const sha256Of = (buffer) =>
  createHash("sha256").update(buffer).digest("hex");

async function registryHash() {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(tarballUrl, { redirect: "follow" });
      if (res.ok) return sha256Of(Buffer.from(await res.arrayBuffer()));
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  return null;
}

function packHash() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "eckra-homebrew-"));
  try {
    execFileSync("npm", ["pack", "--silent", "--pack-destination", tmp], {
      cwd: root,
      stdio: ["ignore", "ignore", "inherit"],
    });
    return sha256Of(readFileSync(path.join(tmp, `eckra-${version}.tgz`)));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const sha256 = (await registryHash()) || packHash();

const formula = `class Eckra < Formula
  desc "AI-powered Git management CLI"
  homepage "https://github.com/sudoeren/eckra"
  url "https://registry.npmjs.org/eckra/-/eckra-${version}.tgz"
  sha256 "${sha256}"
  license "MIT"
  head "https://github.com/sudoeren/eckra.git", branch: "master"

  depends_on "node"

  livecheck do
    url "https://registry.npmjs.org/eckra/latest"
    regex(/"version"\\s*:\\s*"(\\d+(?:\\.\\d+)+)"/i)
  end

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/eckra --version")
  end
end
`;

const out = path.join(root, "Formula", "eckra.rb");
writeFileSync(out, formula);
console.log(`✓ Formula/eckra.rb → v${version} (${sha256})`);
