#!/bin/bash
# macOS App Bundle and DMG Build Script for Music Player

# Configuration
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TARGET="x86_64-apple-darwin"
RELEASE_DIR="$PROJECT_ROOT/target/$TARGET/release"
APP_NAME="Music Player"
BUNDLE_NAME="$APP_NAME.app"
BUNDLE_DIR="$PROJECT_ROOT/target/$BUNDLE_NAME"
DMG_NAME="${APP_NAME// /_}.dmg"
OUTPUT_DIR="$PROJECT_ROOT/dist"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Build the application
echo "Building $APP_NAME for macOS..."
cd "$PROJECT_ROOT"

# Build for x86_64 (Intel)
echo "Building for x86_64..."
cargo build --release --target $TARGET

if [ $? -ne 0 ]; then
    echo "Build failed"
    exit 1
fi

# Create app bundle structure
echo "Creating app bundle..."
rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR/Contents/MacOS"
mkdir -p "$BUNDLE_DIR/Contents/Resources"

# Copy binary
cp "$RELEASE_DIR/music_player" "$BUNDLE_DIR/Contents/MacOS/$APP_NAME"
chmod +x "$BUNDLE_DIR/Contents/MacOS/$APP_NAME"

# Create Info.plist
cat > "$BUNDLE_DIR/Contents/Info.plist" <<EOL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>$APP_NAME</string>
    <key>CFBundleDisplayName</key>
    <string>$APP_NAME</string>
    <key>CFBundleIdentifier</key>
    <string>com.musicplayer.app</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleSignature</key>
    <string>????</string>
    <key>CFBundleExecutable</key>
    <string>$APP_NAME</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>LSUIElement</key>
    <false/>
</dict>
</plist>
EOL

# Create a simple app icon (you should replace this with your actual icon)
# For now, we'll create a placeholder
mkdir -p "$BUNDLE_DIR/Contents/Resources/"
cat > "$BUNDLE_DIR/Contents/Resources/AppIcon.icns" << 'EOL'
# This is a placeholder for the actual icon file
# Replace with a real .icns file for production
EOL

# Create DMG
echo "Creating DMG..."
TEMP_DMG="$OUTPUT_DIR/temp.dmg"
FINAL_DMG="$OUTPUT_DIR/$DMG_NAME"

# Remove existing DMG if it exists
rm -f "$TEMP_DMG" "$FINAL_DMG"

# Create temporary DMG
hdiutil create -srcfolder "$BUNDLE_DIR" -volname "$APP_NAME" -fs HFS+ -fsargs "-c c=64,a=16,e=16" -format UDRW "$TEMP_DMG"

# Mount the DMG
DEVICE=$(hdiutil attach -readwrite -noverify -noautoopen "$TEMP_DMG" | egrep '^/dev/' | sed 1q | awk '{print $1}')

# Create Applications link
ln -s /Applications "/Volumes/$APP_NAME/Applications"

# Set volume icon (optional)
# cp "$PROJECT_ROOT/assets/VolumeIcon.icns" "/Volumes/$APP_NAME/.VolumeIcon.icns"
# SetFile -c icnC "/Volumes/$APP_NAME/.VolumeIcon.icns"
# SetFile -a C "/Volumes/$APP_NAME"

# Set background image (optional)
# mkdir "/Volumes/$APP_NAME/.background"
# cp "$PROJECT_ROOT/assets/background.png" "/Volumes/$APP_NAME/.background/"

# Set window properties
osascript <<EOT
    tell application "Finder"
        tell disk "$APP_NAME"
            open
            set current view of container window to icon view
            set toolbar visible of container window to false
            set statusbar visible of container window to false
            set the bounds of container window to {400, 100, 920, 400}
            set viewOptions to the icon view options of container window
            set arrangement of viewOptions to not arranged
            set icon size of viewOptions to 72
            set background picture of viewOptions to file ".background:background.png"
            set position of item "$BUNDLE_NAME" of container window to {150, 100}
            set position of item "Applications" of container window to {350, 100}
            update without registering applications
            delay 5
            close
        end tell
    end tell
EOT

# Finalize DMG
chmod -Rf go-w /Volumes/"$APP_NAME"
sync
hdiutil detach "$DEVICE"
hdiutil convert "$TEMP_DMG" -format UDZO -o "$FINAL_DMG"
rm -f "$TEMP_DMG"

# Notarization (requires Apple Developer ID)
# Uncomment and configure with your Apple ID and password
# xcrun altool --notarize-app \
#     --primary-bundle-id "com.musicplayer.app" \
#     --username "your-apple-id@example.com" \
#     --password "@keychain:AC_PASSWORD" \
#     --file "$FINAL_DMG"

echo "Build and packaging completed!"
echo "App bundle: $BUNDLE_DIR"
echo "DMG created at: $FINAL_DMG"
