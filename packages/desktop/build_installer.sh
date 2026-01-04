#!/bin/bash
set -e

echo "======================================"
echo "Building Hasod Downloads with PyInstaller"
echo "======================================"

# Clean previous builds
echo "Cleaning previous builds..."
rm -rf build dist "Hasod Downloads.dmg"

# Build with PyInstaller
echo "Building app bundle..."
pyinstaller build_pyinstaller.spec --clean --noconfirm

# Check if build succeeded
if [ ! -d "dist/Hasod Downloads.app" ]; then
    echo "ERROR: Build failed - app bundle not created"
    exit 1
fi

echo ""
echo "Build complete!"
echo "App location: dist/Hasod Downloads.app"

# Create DMG with proper layout
echo ""
echo "Creating DMG installer..."

# Create temporary DMG directory
mkdir -p dmg_temp
cp -R "dist/Hasod Downloads.app" dmg_temp/
ln -s /Applications dmg_temp/Applications

# Create a temporary read-write DMG
hdiutil create -volname "Hasod Downloads" \
    -srcfolder dmg_temp \
    -ov -format UDRW \
    temp.dmg

# Mount the DMG
device=$(hdiutil attach -readwrite -noverify -noautoopen temp.dmg | grep '/Volumes/Hasod Downloads' | awk '{print $1}')

# Set DMG window properties with AppleScript
echo '
tell application "Finder"
    tell disk "Hasod Downloads"
        open
        set current view of container window to icon view
        set toolbar visible of container window to false
        set statusbar visible of container window to false
        set the bounds of container window to {400, 100, 1000, 500}
        set viewOptions to the icon view options of container window
        set arrangement of viewOptions to not arranged
        set icon size of viewOptions to 100
        set background picture of viewOptions to file ".background:background.png"
        set position of item "Hasod Downloads.app" of container window to {150, 200}
        set position of item "Applications" of container window to {450, 200}
        close
        open
        update without registering applications
        delay 2
    end tell
end tell
' | osascript || echo "Warning: Could not set DMG appearance"

# Unmount
hdiutil detach "${device}" || echo "Warning: Could not detach DMG"

# Convert to compressed read-only DMG
hdiutil convert temp.dmg -format UDZO -o "Hasod Downloads.dmg"

# Clean up
rm -f temp.dmg
rm -rf dmg_temp

echo ""
echo "======================================"
echo "Build Complete!"
echo "======================================"
echo "DMG file: Hasod Downloads.dmg"
du -sh "Hasod Downloads.dmg"
echo ""
echo "To install:"
echo "1. Open 'Hasod Downloads.dmg'"
echo "2. Drag app to Applications folder"
echo "3. Run from Applications or Spotlight"
echo "======================================"
