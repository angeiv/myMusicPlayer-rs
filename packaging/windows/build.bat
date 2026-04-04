@echo off
REM Historical helper behind the repo-root proof-only Windows lane.
REM Canonical path: repo root -> just package-windows
REM Windows remains proof-only and deferred for formal support.

echo WARNING: Historical helper behind the repo-root proof-only Windows lane.
echo WARNING: Canonical path: repo root ^> just package-windows
echo WARNING: Windows remains proof-only and deferred for formal support.

set SCRIPT_DIR=%~dp0

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%build.ps1" %*
if %ERRORLEVEL% NEQ 0 (
  echo Packaging failed with error code %ERRORLEVEL%
  exit /b %ERRORLEVEL%
)

echo Packaging completed successfully.
