"""Hasod Downloads - High-quality audio downloader for YouTube, Spotify, and SoundCloud."""
import sys
import os

# PyInstaller: Set ffmpeg path for bundled app
if getattr(sys, 'frozen', False):
    # Running as PyInstaller bundle
    bundle_dir = sys._MEIPASS
    ffmpeg_path = os.path.join(bundle_dir, 'ffmpeg')
    if os.path.exists(ffmpeg_path):
        os.environ['PATH'] = bundle_dir + os.pathsep + os.environ.get('PATH', '')
        print(f"[PyInstaller] Added ffmpeg to PATH: {bundle_dir}")

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from PySide6.QtWidgets import QApplication
from src.gui.main_window_qt import MainWindow


def main():
    """Main entry point."""
    try:
        # Create Qt application
        app = QApplication(sys.argv)
        app.setApplicationName("Hasod Downloads")
        app.setOrganizationName("Hasod")

        # Create and show main window
        window = MainWindow()
        window.show()

        # Run event loop
        return app.exec()

    except Exception as e:
        print(f"Error starting application: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
