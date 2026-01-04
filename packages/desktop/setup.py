"""
Setup script for creating macOS app bundle with py2app
"""
from setuptools import setup

APP = ['main.py']
DATA_FILES = [
    ('', ['openaikey']),  # Include API key in the bundle
]

OPTIONS = {
    'argv_emulation': False,
    'packages': [
        'PySide6',
        'requests',
        'yt_dlp',
        'pyperclip',
        'PIL',
        'mutagen',
        'src',
    ],
    'includes': [
        'PySide6.QtCore',
        'PySide6.QtGui',
        'PySide6.QtWidgets',
        'AppKit',
        'Foundation',
        'Quartz',
    ],
    'excludes': [
        'tkinter',
        'tkinterdnd2',
        'customtkinter',
        'PyInstaller',
        'test',
        'pytest',
        'setuptools',
    ],
    'iconfile': 'icon.png',  # App icon
    'strip': True,  # Strip debug symbols to reduce size
    'optimize': 2,  # Python optimization level
    'plist': {
        'CFBundleName': 'Hasod Downloads',
        'CFBundleDisplayName': 'Hasod Downloads',
        'CFBundleIdentifier': 'com.hasod.downloads',
        'CFBundleVersion': '1.0.0',
        'CFBundleShortVersionString': '1.0.0',
        'NSHumanReadableCopyright': 'Copyright © 2025',
        'NSHighResolutionCapable': True,
        'LSMinimumSystemVersion': '10.15',
        'LSBackgroundOnly': False,
    },
}

setup(
    name='Hasod Downloads',
    app=APP,
    data_files=DATA_FILES,
    options={'py2app': OPTIONS},
    setup_requires=['py2app'],
)
