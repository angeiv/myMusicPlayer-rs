[CmdletBinding()]
param(
  [string]$Target = "x86_64-pc-windows-msvc"
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\\..")
$env:NPM_CONFIG_CACHE = Join-Path $projectRoot ".npm-cache"
$outputDir = Join-Path $projectRoot "artifacts\\windows"

if (-not (Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}

Write-Host "Building Tauri bundles for Windows ($Target)..." -ForegroundColor Green
Push-Location $projectRoot
try {
  cargo tauri build --target $Target
} finally {
  Pop-Location
}

$bundleDir = Join-Path $projectRoot "src-tauri\\target\\$Target\\release\\bundle"
if (-not (Test-Path $bundleDir)) {
  throw "Bundle output directory not found: $bundleDir"
}

$artifacts = Get-ChildItem -Path $bundleDir -Recurse -File -Include *.msi, *.exe
if (-not $artifacts) {
  Write-Warning "No Windows bundle artifacts found under: $bundleDir"
  exit 1
}

Write-Host "Copying artifacts to $outputDir..." -ForegroundColor Green
foreach ($artifact in $artifacts) {
  Copy-Item -Path $artifact.FullName -Destination (Join-Path $outputDir $artifact.Name) -Force
}

Write-Host "Build and packaging completed successfully!" -ForegroundColor Green
Write-Host "Artifacts location: $outputDir"
