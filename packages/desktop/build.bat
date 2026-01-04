@echo off
REM Build script for DJ Downloader on Windows

echo Building DJ Downloader...

REM Clean previous builds
echo Cleaning previous builds...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

REM Build with PyInstaller
echo Running PyInstaller...
pyinstaller build.spec

REM Check if build was successful
if exist "dist\DJ Downloader.exe" (
    echo ✅ Build successful!
    echo Output location: dist\DJ Downloader.exe
) else (
    echo ❌ Build failed!
    exit /b 1
)
