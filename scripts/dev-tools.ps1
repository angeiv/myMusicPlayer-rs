$ErrorActionPreference = "Stop"

$env:TAURI_OPEN_DEVTOOLS = "1"
& (Join-Path $PSScriptRoot "dev.ps1")

