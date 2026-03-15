@echo off
REM Windows build entrypoint (delegates to PowerShell script)
set SCRIPT_DIR=%~dp0

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%build.ps1" %*
if %ERRORLEVEL% NEQ 0 (
  echo Packaging failed with error code %ERRORLEVEL%
  exit /b %ERRORLEVEL%
)

echo Packaging completed successfully.
