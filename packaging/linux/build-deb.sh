#!/bin/bash
# Linux Debian/Ubuntu Package Build Script for Music Player

# Configuration
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TARGET="x86_64-unknown-linux-gnu"
RELEASE_DIR="$PROJECT_ROOT/target/$TARGET/release"
APP_NAME="music-player"
VERSION="1.0.0"
ARCH="amd64"
PACKAGE_NAME="${APP_NAME}_${VERSION}_${ARCH}"
DEB_DIR="$PROJECT_ROOT/target/debian/$PACKAGE_NAME/DEBIAN"
APP_DIR="$PROJECT_ROOT/target/debian/$PACKAGE_NAME/usr/local/bin"
DESKTOP_DIR="$PROJECT_ROOT/target/debian/$PACKAGE_NAME/usr/share/applications"
ICON_DIR="$PROJECT_ROOT/target/debian/$PACKAGE_NAME/usr/share/icons/hicolor/256x256/apps"
OUTPUT_DIR="$PROJECT_ROOT/dist"

# Create necessary directories
mkdir -p "$DEB_DIR"
mkdir -p "$APP_DIR"
mkdir -p "$DESKTOP_DIR"
mkdir -p "$ICON_DIR"
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
cp "$RELEASE_DIR/music_player" "$APP_DIR/$APP_NAME"
chmod +x "$APP_DIR/$APP_NAME"

# Create .desktop file
cat > "$DESKTOP_DIR/$APP_NAME.desktop" <<EOL
[Desktop Entry]
Name=Music Player
Comment=Play your music collection
Exec=/usr/local/bin/$APP_NAME %U
Icon=$APP_NAME
Terminal=false
Type=Application
Categories=Audio;Music;Player;AudioVideo;
StartupWMClass=music-player
EOL

# Copy icon (placeholder - replace with actual icon)
echo "Placeholder icon" > "$ICON_DIR/$APP_NAME.png"

# Create control file
cat > "$DEB_DIR/control" <<EOL
Package: $APP_NAME
Version: $VERSION
Section: sound
Priority: optional
Architecture: $ARCH
Maintainer: Your Name <your.email@example.com>
Description: A modern music player
 A feature-rich music player built with Rust and GTK.
Homepage: https://github.com/yourusername/music-player
EOL

# Create postinst script
cat > "$DEB_DIR/postinst" << 'EOL'
#!/bin/sh
set -e

# Update icon cache
if [ -x "$(command -v update-desktop-database)" ]; then
    update-desktop-database -q
fi

# Update mime database
if [ -x "$(command -v update-mime-database)" ]; then
    update-mime-database /usr/share/mime
fi

# Update icon cache
if [ -x "$(command -v gtk-update-icon-cache)" ]; then
    gtk-update-icon-cache -qtf /usr/share/icons/hicolor
fi

exit 0
EOL

# Create prerm script
cat > "$DEB_DIR/prerm" << 'EOL'
#!/bin/sh
set -e

# Clean up any running instances
pkill -x "music-player" || true

exit 0
EOL

# Set permissions
chmod 755 "$DEB_DIR/postinst"
chmod 755 "$DEB_DIR/prerm"

# Build the package
echo "Building Debian package..."
dpkg-deb --build "$PROJECT_ROOT/target/debian/$PACKAGE_NAME" "$OUTPUT_DIR/$PACKAGE_NAME.deb"

# Clean up
# rm -rf "$PROJECT_ROOT/target/debian"

echo "Package built successfully!"
echo "DEB package: $OUTPUT_DIR/$PACKAGE_NAME.deb"
