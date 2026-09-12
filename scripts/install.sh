#!/bin/sh
# Install eckra from GitHub releases on Linux (no Node.js required).
#
#   curl -fsSL https://raw.githubusercontent.com/sudoeren/eckra/master/scripts/install.sh | sh
#
# Environment overrides:
#   ECKRA_VERSION      install a specific version (e.g. 1.5.4)
#   ECKRA_INSTALL_DIR  install directory (default: ~/.local/bin)
set -eu

REPO="sudoeren/eckra"
BIN="eckra"
INSTALL_DIR="${ECKRA_INSTALL_DIR:-$HOME/.local/bin}"
VERSION="${ECKRA_VERSION:-}"

err() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

os="$(uname -s)"
arch="$(uname -m)"

[ "$os" = "Linux" ] || err "unsupported OS: $os (use 'npm install -g eckra')"

case "$arch" in
  x86_64 | amd64) asset="eckra-linux-x64" ;;
  aarch64 | arm64) asset="eckra-linux-arm64" ;;
  *) err "unsupported architecture: $arch" ;;
esac

command -v curl >/dev/null 2>&1 || err "curl is required"
if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
  err "sha256sum or shasum is required"
fi

if [ -z "$VERSION" ]; then
  VERSION="$(
    curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" |
      sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"v\{0,1\}\([^"]*\)".*/\1/p' |
      head -n 1
  )"
  [ -n "$VERSION" ] || err "could not determine the latest version; set ECKRA_VERSION"
fi

base="https://github.com/$REPO/releases/download/v$VERSION"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT INT TERM

printf 'Downloading %s v%s...\n' "$asset" "$VERSION"
curl -fsSL "$base/$asset" -o "$tmp/$asset" || err "download failed: $base/$asset"
curl -fsSL "$base/SHA256SUMS" -o "$tmp/SHA256SUMS" || err "could not download SHA256SUMS"

expected="$(grep " ${asset}\$" "$tmp/SHA256SUMS" | awk '{print $1}' | head -n 1)"
[ -n "$expected" ] || err "checksum for $asset not found"

if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$tmp/$asset" | awk '{print $1}')"
else
  actual="$(shasum -a 256 "$tmp/$asset" | awk '{print $1}')"
fi
[ "$expected" = "$actual" ] || err "checksum mismatch for $asset"

mkdir -p "$INSTALL_DIR"
cp "$tmp/$asset" "$INSTALL_DIR/$BIN"
chmod 755 "$INSTALL_DIR/$BIN"

printf '\ninstalled eckra v%s to %s/%s\n' "$VERSION" "$INSTALL_DIR" "$BIN"
case ":$PATH:" in
  *":$INSTALL_DIR:"*) printf 'run: %s --version\n' "$BIN" ;;
  *)
    printf '\nAdd it to your PATH:\n  export PATH="%s:$PATH"\n' "$INSTALL_DIR"
    ;;
esac
