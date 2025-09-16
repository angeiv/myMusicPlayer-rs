# Music Player Packaging

This directory contains packaging scripts for different platforms to create distributable packages for the Music Player application.

## Prerequisites

### All Platforms
- Rust and Cargo installed
- `cargo install cross` (for cross-compilation)

### Windows
- NSIS (Nullsoft Scriptable Install System) installed
- Visual Studio Build Tools with C++ workload (for compiling Rust code)

### macOS
- Xcode Command Line Tools
- `create-dmg` (for creating DMG files)
  ```bash
  brew install create-dmg
  ```

### Linux
- `dpkg-deb` (for Debian/Ubuntu packages)
- `fpm` (for RPM packages)
- `appimagetool` (for AppImage)
  ```bash
  # On Debian/Ubuntu
  sudo apt install dpkg-dev fpm
  wget https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage -O appimagetool
  chmod +x appimagetool
  sudo mv appimagetool /usr/local/bin/
  ```

## Building Packages

### Windows

1. Open a command prompt in the project root
2. Run the build script:
   ```
   .\packaging\windows\build.bat
   ```
3. The installer will be created in the `dist` directory

### macOS

1. Open Terminal and navigate to the project root
2. Make the build script executable:
   ```bash
   chmod +x packaging/macos/build-app.sh
   ```
3. Run the build script:
   ```bash
   ./packaging/macos/build-app.sh
   ```
4. The DMG file will be created in the `dist` directory

### Linux

#### Debian/Ubuntu (.deb)

1. Make the build script executable:
   ```bash
   chmod +x packaging/linux/build-deb.sh
   ```
2. Run the build script:
   ```bash
   ./packaging/linux/build-deb.sh
   ```
3. The .deb package will be created in the `dist` directory

#### AppImage

1. Make the build script executable:
   ```bash
   chmod +x packaging/linux/build-appimage.sh
   ```
2. Run the build script:
   ```bash
   ./packaging/linux/build-appimage.sh
   ```
3. The AppImage will be created in the `dist` directory

## Package Signing (Optional)

### Windows

To sign the installer, you'll need a code signing certificate. Add the following to your build script:

```batch
REM Sign the installer
signtool sign /t http://timestamp.digicert.com /fd sha256 /f "path\to\certificate.pfx" /p "your_password" "%OUTPUT_DIR%\MusicPlayer_Setup.exe"
```

### macOS

To notarize the app, you'll need an Apple Developer ID. Uncomment and configure the notarization section in the build script.

### Linux

For Debian/Ubuntu packages, you can sign them with GPG:

```bash
dpkg-sig --sign builder dist/music-player_1.0.0_amd64.deb
```

## Distribution

After building the packages, you can distribute them to users:

1. Windows: Share the `MusicPlayer_Setup.exe` file
2. macOS: Share the `.dmg` file
3. Linux: Share the `.deb` file or AppImage

## Troubleshooting

- If you encounter permission issues, try running the scripts with `sudo`
- Make sure all dependencies are installed
- Check the build logs for specific error messages
- For AppImage issues, ensure `libfuse2` is installed on your system

## License

This project is licensed under the [GPL-3.0 License](../LICENSE).
