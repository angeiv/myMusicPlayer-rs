@echo off
REM Windows Build Script for Music Player
REM This script builds the application and creates an installer using NSIS

REM Configuration
set PROJECT_ROOT=%~dp0..\..
set TARGET=x86_64-pc-windows-msvc
set RELEASE_DIR=%PROJECT_ROOT%\target\%TARGET%\release
set OUTPUT_DIR=%PROJECT_ROOT%\dist
set INSTALLER_SCRIPT=%~dp0installer.nsi

REM Create output directory if it doesn't exist
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

REM Build the application in release mode
echo Building Music Player for Windows...
cd /d "%PROJECT_ROOT%"
call cargo build --release --target %TARGET%

if %ERRORLEVEL% NEQ 0 (
    echo Build failed with error code %ERRORLEVEL%
    pause
    exit /b %ERRORLEVEL%
)

REM Check if NSIS is installed
where /q makensis
if %ERRORLEVEL% NEQ 0 (
    echo NSIS is not installed or not in PATH.
    echo Please install NSIS to create the installer.
    echo Download from: https://nsis.sourceforge.io/Download
    pause
    exit /b 1
)

REM Create the installer
echo Creating installer...
makensis "%INSTALLER_SCRIPT%"

if %ERRORLEVEL% NEQ 0 (
    echo Failed to create installer
    pause
    exit /b %ERRORLEVEL%
)

REM Copy the installer to the dist directory
if exist "MusicPlayer_Setup.exe" (
    move /Y "MusicPlayer_Setup.exe" "%OUTPUT_DIR%\"
)

echo Build and packaging completed successfully!
echo Installer location: %OUTPUT_DIR%\MusicPlayer_Setup.exe
pause
