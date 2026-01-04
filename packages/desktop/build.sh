#!/bin/bash
# Build script for DJ Downloader

echo "Building DJ Downloader..."

# Clean previous builds
echo "Cleaning previous builds..."
rm -rf build dist

# Build with PyInstaller
echo "Running PyInstaller..."
pyinstaller build.spec

# Check if build was successful
if [ -d "dist/DJ Downloader.app" ] || [ -f "dist/DJ Downloader.exe" ]; then
    echo "✅ Build successful!"
    echo "Output location: dist/"

    if [ -d "dist/DJ Downloader.app" ]; then
        echo "macOS app bundle: dist/DJ Downloader.app"
    fi

    if [ -f "dist/DJ Downloader.exe" ]; then
        echo "Windows executable: dist/DJ Downloader.exe"
    fi
else
    echo "❌ Build failed!"
    exit 1
fi
