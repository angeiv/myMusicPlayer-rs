#!/bin/bash
# Linux AppImage Build Script for Music Player

# Configuration
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TARGET="x86_64-unknown-linux-gnu"
RELEASE_DIR="$PROJECT_ROOT/target/$TARGET/release"
APP_NAME="music-player"
VERSION="1.0.0"
APP_DIR="$PROJECT_ROOT/target/AppDir"
OUTPUT_DIR="$PROJECT_ROOT/dist"
APPIMAGE_NAME="${APP_NAME}-${VERSION}-x86_64.AppImage"

# Create necessary directories
mkdir -p "$APP_DIR/usr/bin"
mkdir -p "$APP_DIR/usr/share/applications"
mkdir -p "$APP_DIR/usr/share/icons/hicolor/256x256/apps"
mkdir -p "$OUTPUT_DIR"

# Build the application
echo "Building $APP_NAME for Linux..."
cd "$PROJECT_ROOT"
cargo build --release --target $TARGET

if [ $? -ne 0 ]; then
    echo "Build failed"
    exit 1
fi

# Copy binary
cp "$RELEASE_DIR/music_player" "$APP_DIR/usr/bin/$APP_NAME"
chmod +x "$APP_DIR/usr/bin/$APP_NAME"

# Create .desktop file
cat > "$APP_DIR/usr/share/applications/$APP_NAME.desktop" <<EOL
[Desktop Entry]
Name=Music Player
Comment=Play your music collection
Exec=AppRun %U
Icon=$APP_NAME
Type=Application
Categories=Audio;Music;Player;AudioVideo;
StartupWMClass=music-player
EOL

# Create AppRun script
cat > "$APP_DIR/AppRun" << 'EOL'
#!/bin/sh
HERE="$(dirname "$(readlink -f "${0}")")"

# Set environment variables
export PATH="${HERE}/usr/bin:${PATH}"
export LD_LIBRARY_PATH="${HERE}/usr/lib:${LD_LIBRARY_PATH}"

# Run the application
exec "${HERE}/usr/bin/music-player" "$@"
EOL
chmod +x "$APP_DIR/AppRun"

# Copy icon (placeholder - replace with actual icon)
echo "Placeholder icon" > "$APP_DIR/usr/share/icons/hicolor/256x256/apps/$APP_NAME.png"

# Create AppImage using linuxdeploy
if ! command -v linuxdeploy-x86_64.AppImage &> /dev/null; then
    echo "Downloading linuxdeploy..."
    wget -q --show-progress -c "https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/linuxdeploy-x86_64.AppImage"
    chmod +x linuxdeploy-x86_64.AppImage
    LINUXDEPLOY=./linuxdeploy-x86_64.AppImage
else
    LINUXDEPLOY=linuxdeploy-x86_64.AppImage
fi

# Create AppImage
echo "Creating AppImage..."
$LINUXDEPLOY \
    --appdir "$APP_DIR" \
    --output appimage \
    --desktop-file "$APP_DIR/usr/share/applications/$APP_NAME.desktop" \
    --icon-file "$APP_DIR/usr/share/icons/hicolor/256x256/apps/$APP_NAME.png" \
    --app-name "$APP_NAME"

# Move AppImage to output directory
if [ -f "$PROJECT_ROOT/$APPIMAGE_NAME" ]; then
    mv "$PROJECT_ROOT/$APPIMAGE_NAME" "$OUTPUT_DIR/"
    echo "AppImage created: $OUTPUT_DIR/$APPIMAGE_NAME"
else
    echo "Error: AppImage creation failed"
    exit 1
fi

# Clean up
rm -rf "$APP_DIR"
if [ -f "linuxdeploy-x86_64.AppImage" ]; then
    rm linuxdeploy-x86_64.AppImage
fi

echo "AppImage build completed successfully!"
