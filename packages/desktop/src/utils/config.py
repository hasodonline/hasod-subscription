"""Configuration manager for DJ Downloader."""
import os
import json
import locale
from pathlib import Path
from typing import Optional


class Config:
    """Manages application configuration and settings."""

    def __init__(self):
        self.app_name = "DJ Downloader"
        self.version = "1.0.0"

        # Directories
        self.config_dir = self._get_config_dir()
        self.config_file = self.config_dir / "config.json"
        self.downloads_dir = Path.home() / "Downloads" / "DJ Downloader"

        # Ensure directories exist
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.downloads_dir.mkdir(parents=True, exist_ok=True)

        # Load or create config
        self.settings = self._load_config()

    def _get_config_dir(self) -> Path:
        """Get platform-specific config directory."""
        if os.name == 'nt':  # Windows
            base = Path(os.environ.get('APPDATA', Path.home()))
        else:  # macOS/Linux
            base = Path.home() / '.config'
        return base / 'dj-downloader'

    def _get_system_language(self) -> str:
        """Get system language, defaulting to en_US if unable to detect."""
        try:
            # Get system locale
            system_locale = locale.getdefaultlocale()[0]
            if system_locale:
                # Check if it's Hebrew
                if system_locale.startswith('he'):
                    return 'he_IL'
                # Default to English for all other locales
                return 'en_US'
        except Exception:
            pass
        return 'en_US'

    def _load_config(self) -> dict:
        """Load configuration from file."""
        default_config = {
            'downloads_dir': str(self.downloads_dir),
            'audio_quality': '320',
            'auto_clipboard': True,
            'add_metadata': True,
            'spotify_client_id': '',
            'spotify_client_secret': '',
            'theme': 'dark',
            'transliterate_hebrew': True,  # Default ON
            'language': self._get_system_language()  # Auto-detect system language
        }

        if self.config_file.exists():
            try:
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    loaded = json.load(f)
                    default_config.update(loaded)
            except Exception as e:
                print(f"Error loading config: {e}")

        return default_config

    def save_config(self):
        """Save current settings to file."""
        try:
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(self.settings, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Error saving config: {e}")

    def get(self, key: str, default=None):
        """Get a setting value."""
        return self.settings.get(key, default)

    def set(self, key: str, value):
        """Set a setting value and save."""
        self.settings[key] = value
        self.save_config()

    @property
    def downloads_path(self) -> Path:
        """Get downloads directory as Path object."""
        return Path(self.settings['downloads_dir'])


# Global config instance
config = Config()
