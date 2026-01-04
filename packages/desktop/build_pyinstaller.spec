# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_data_files, collect_submodules, collect_all
import os
import sys

block_cipher = None

# === BEST PRACTICE: Follow spotdl's official build approach ===
# Reference: https://github.com/spotDL/spotify-downloader/blob/master/scripts/build.py

# 1. Use yt-dlp's PyInstaller hooks (critical for spotdl)
yt_dlp_hooks_dir = os.path.join(
    os.path.dirname(sys.executable if getattr(sys, 'frozen', False) else sys.prefix),
    'lib', 'python3.13', 'site-packages', 'yt_dlp', '__pyinstaller'
)

# 2. Collect all spotdl dependencies
spotdl_datas, spotdl_binaries, spotdl_hiddenimports = collect_all('spotdl')

# 3. Collect ytmusicapi locales (required by spotdl)
ytmusicapi_datas = collect_data_files('ytmusicapi')

# 4. Bundle ffmpeg
extra_binaries = []
ffmpeg_paths = [
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
]
for ffmpeg_path in ffmpeg_paths:
    if os.path.exists(ffmpeg_path):
        extra_binaries.append((ffmpeg_path, '.'))
        print(f"Found and bundling ffmpeg from: {ffmpeg_path}")
        break

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=spotdl_binaries + extra_binaries,
    datas=[
        ('openaikey', '.'),
        ('icon.png', '.'),
        ('src', 'src'),
    ] + spotdl_datas + ytmusicapi_datas,
    hiddenimports=[
        # Core app dependencies
        'PySide6.QtCore',
        'PySide6.QtGui',
        'PySide6.QtWidgets',
        'AppKit',
        'Foundation',
        'Quartz',
        'objc',
        'requests',
        'yt_dlp',
        'pyperclip',
        'PIL',
        'mutagen',
        'spotipy',
        'pathlib',
        'json',
        're',
        'urllib.parse',
    ] + spotdl_hiddenimports,
    hookspath=[yt_dlp_hooks_dir] if os.path.exists(yt_dlp_hooks_dir) else [],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'tkinterdnd2',
        'customtkinter',
        'test',
        'pytest',
        # Keep pykakasi OUT - it causes errors and isn't needed
        'pykakasi',
        'jieba',
        'mecab',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='Hasod Downloads',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='icon.png',
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='Hasod Downloads',
)

app = BUNDLE(
    coll,
    name='Hasod Downloads.app',
    icon='icon.png',
    bundle_identifier='com.hasod.downloads',
    version='1.0.0',
    info_plist={
        'CFBundleName': 'Hasod Downloads',
        'CFBundleDisplayName': 'Hasod Downloads',
        'CFBundleShortVersionString': '1.0.0',
        'CFBundleVersion': '1.0.0',
        'NSHumanReadableCopyright': 'Copyright © 2025',
        'NSHighResolutionCapable': True,
        'LSMinimumSystemVersion': '10.15',
        'LSEnvironment': {
            'PATH': '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
        }
    },
)
