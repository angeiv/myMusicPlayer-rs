# Windows Build Script for Music Player
# This script builds the application and creates an installer

# Configuration
$ProjectRoot = "$PSScriptRoot\..\.."
$Target = "x86_64-pc-windows-msvc"
$ReleaseDir = "$ProjectRoot\target\release"
$OutputDir = "$ProjectRoot\dist"
$InstallerScript = "$PSScriptRoot\installer.nsi"

# Create output directory if it doesn't exist
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

# Build the application in release mode
Write-Host "Building Music Player for Windows..." -ForegroundColor Green
cargo build --release --target $Target

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}

# Check if NSIS is installed
$nsisPath = "C:\Program Files (x86)\NSIS\makensis.exe"
if (-not (Test-Path $nsisPath)) {
    Write-Host "NSIS is not installed. Please install NSIS to create the installer." -ForegroundColor Red
    Write-Host "Download from: https://nsis.sourceforge.io/Download"
    exit 1
}

# Create the installer
Write-Host "Creating installer..." -ForegroundColor Green
& "$nsisPath" "$InstallerScript"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to create installer" -ForegroundColor Red
    exit $LASTEXITCODE
}

# Copy the installer to the dist directory
$installerName = "MusicPlayer_Setup.exe"
if (Test-Path $installerName) {
    Move-Item -Path $installerName -Destination "$OutputDir\$installerName" -Force
}

Write-Host "Build and packaging completed successfully!" -ForegroundColor Green
Write-Host "Installer location: $OutputDir\$installerName"
