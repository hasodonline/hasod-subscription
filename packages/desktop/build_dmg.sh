#!/bin/bash
# Build script for creating Hasod Downloads DMG installer

set -e  # Exit on error

echo "======================================"
echo "Building Hasod Downloads DMG"
echo "======================================"

# Clean previous builds
echo "Cleaning previous builds..."
rm -rf build dist "Hasod Downloads.dmg"

# Install py2app if not already installed
echo "Installing py2app..."
pip install py2app

# Build the app bundle
echo "Building app bundle..."
python setup.py py2app

# Check if build was successful
if [ ! -d "dist/Hasod Downloads.app" ]; then
    echo "ERROR: App bundle was not created!"
    exit 1
fi

echo "App bundle created successfully!"

# Create DMG
echo "Creating DMG..."

# Set DMG name and volume name
DMG_NAME="Hasod Downloads"
VOLUME_NAME="Hasod Downloads Installer"
SOURCE_FOLDER="dist"

# Create a temporary directory for DMG contents
TMP_DMG_DIR="dmg_temp"
rm -rf "$TMP_DMG_DIR"
mkdir "$TMP_DMG_DIR"

# Copy app to temp directory
cp -R "$SOURCE_FOLDER/Hasod Downloads.app" "$TMP_DMG_DIR/"

# Create Applications symlink
ln -s /Applications "$TMP_DMG_DIR/Applications"

# Create DMG
hdiutil create -volname "$VOLUME_NAME" \
    -srcfolder "$TMP_DMG_DIR" \
    -ov -format UDZO \
    "$DMG_NAME.dmg"

# Clean up temp directory
rm -rf "$TMP_DMG_DIR"

echo "======================================"
echo "✅ DMG created successfully!"
echo "File: $DMG_NAME.dmg"
echo "======================================"

# Get DMG size
DMG_SIZE=$(du -h "$DMG_NAME.dmg" | cut -f1)
echo "DMG Size: $DMG_SIZE"

echo ""
echo "You can now share '$DMG_NAME.dmg' with others!"
echo "To install, users should:"
echo "1. Open the DMG file"
echo "2. Drag 'Hasod Downloads.app' to Applications folder"
echo "3. Open from Applications"
