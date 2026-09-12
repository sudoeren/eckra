# Install eckra from GitHub releases on Windows (no Node.js required).
#
#   irm https://raw.githubusercontent.com/sudoeren/eckra/master/scripts/install.ps1 | iex
#
# Parameters / environment overrides:
#   -Version / ECKRA_VERSION          install a specific version (e.g. 1.5.4)
#   -InstallDir / ECKRA_INSTALL_DIR   install directory (default: %LOCALAPPDATA%\eckra)
[CmdletBinding()]
param(
  [string]$Version = $env:ECKRA_VERSION,
  [string]$InstallDir = $env:ECKRA_INSTALL_DIR
)

$ErrorActionPreference = "Stop"

$repo = "sudoeren/eckra"
$asset = "eckra-win-x64.exe"

if (-not $InstallDir) {
  $InstallDir = Join-Path $env:LOCALAPPDATA "eckra"
}

if (-not $Version) {
  $release = Invoke-RestMethod `
    -Uri "https://api.github.com/repos/$repo/releases/latest" `
    -Headers @{ "User-Agent" = "eckra-installer" }
  $Version = $release.tag_name.TrimStart("v")
}

$base = "https://github.com/$repo/releases/download/v$Version"
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("eckra-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null

try {
  Write-Host "Downloading $asset v$Version..."
  $exePath = Join-Path $tmp $asset
  Invoke-WebRequest -Uri "$base/$asset" -OutFile $exePath -UseBasicParsing

  $sumsPath = Join-Path $tmp "SHA256SUMS"
  Invoke-WebRequest -Uri "$base/SHA256SUMS" -OutFile $sumsPath -UseBasicParsing

  $line = Select-String -Path $sumsPath -Pattern ([regex]::Escape($asset)) | Select-Object -First 1
  if (-not $line) { throw "checksum for $asset not found" }
  $expected = ($line.Line -split '\s+')[0].ToLower()
  $actual = (Get-FileHash -Path $exePath -Algorithm SHA256).Hash.ToLower()
  if ($expected -ne $actual) { throw "checksum mismatch for $asset" }

  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  Copy-Item -Path $exePath -Destination (Join-Path $InstallDir "eckra.exe") -Force

  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($userPath -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$InstallDir", "User")
    Write-Host "Added $InstallDir to your user PATH (restart your shell to use it)."
  }

  Write-Host ""
  Write-Host "installed eckra v$Version to $InstallDir\eckra.exe"
  Write-Host "run: eckra --version"
}
finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
