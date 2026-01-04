"""
Internationalization (i18n) module for Hasod Downloads.

This module provides a centralized translation system that:
- Supports multiple languages with easy extensibility
- Uses JSON-based translation files for maintainability
- Provides template string support for dynamic values
- Emits signals when language changes for UI updates
- Supports RTL (Right-to-Left) languages like Hebrew

Usage:
    from src.utils.i18n import translator, _

    # Simple translation
    text = _("main.window_title")

    # Translation with variables
    text = _("download.added_to_queue", platform="YouTube")

    # Change language
    translator.set_language("he_IL")
"""

import json
import os
from typing import Dict, Optional, Any
from pathlib import Path
from PySide6.QtCore import QObject, Signal


class TranslationManager(QObject):
    """
    Manages translations for the application.

    Signals:
        language_changed: Emitted when the language is changed
    """

    language_changed = Signal(str)  # Emits the new language code

    def __init__(self):
        super().__init__()
        self._translations: Dict[str, Dict[str, Any]] = {}
        self._current_language = "en_US"
        self._fallback_language = "en_US"
        self._translations_dir = Path(__file__).parent.parent.parent / "translations"

        # Available languages configuration
        self._available_languages = {
            "en_US": {
                "name": "English",
                "native_name": "English",
                "rtl": False
            },
            "he_IL": {
                "name": "Hebrew",
                "native_name": "עברית",
                "rtl": True
            }
        }

        # Load all available translations
        self._load_translations()

    def _load_translations(self):
        """Load all translation files from the translations directory."""
        if not self._translations_dir.exists():
            print(f"Translations directory not found: {self._translations_dir}")
            return

        for lang_code in self._available_languages.keys():
            lang_file = self._translations_dir / f"{lang_code}.json"
            if lang_file.exists():
                try:
                    with open(lang_file, 'r', encoding='utf-8') as f:
                        self._translations[lang_code] = json.load(f)
                    print(f"Loaded translations for {lang_code}")
                except Exception as e:
                    print(f"Error loading translations for {lang_code}: {e}")
            else:
                print(f"Translation file not found: {lang_file}")

    def reload_translations(self):
        """Reload all translation files (useful during development)."""
        self._translations.clear()
        self._load_translations()

    def get_available_languages(self) -> Dict[str, Dict[str, Any]]:
        """
        Get a dictionary of available languages.

        Returns:
            Dictionary mapping language codes to their metadata
        """
        return self._available_languages.copy()

    def get_current_language(self) -> str:
        """Get the current language code."""
        return self._current_language

    def is_rtl(self, language_code: Optional[str] = None) -> bool:
        """
        Check if a language is RTL (Right-to-Left).

        Args:
            language_code: Language code to check (defaults to current language)

        Returns:
            True if the language is RTL, False otherwise
        """
        lang = language_code or self._current_language
        return self._available_languages.get(lang, {}).get("rtl", False)

    def set_language(self, language_code: str) -> bool:
        """
        Set the current language.

        Args:
            language_code: Language code (e.g., "en_US", "he_IL")

        Returns:
            True if language was changed successfully, False otherwise
        """
        if language_code not in self._available_languages:
            print(f"Language {language_code} not available")
            return False

        if language_code not in self._translations:
            print(f"Translations not loaded for {language_code}")
            return False

        old_language = self._current_language
        self._current_language = language_code

        if old_language != language_code:
            print(f"Language changed from {old_language} to {language_code}")
            self.language_changed.emit(language_code)

        return True

    def translate(self, key: str, **kwargs) -> str:
        """
        Translate a key to the current language.

        Args:
            key: Translation key in dot notation (e.g., "main.window_title")
            **kwargs: Variables to substitute in the translation string

        Returns:
            Translated string, or the key itself if translation not found
        """
        # Try current language
        translation = self._get_nested_value(
            self._translations.get(self._current_language, {}),
            key
        )

        # Fallback to English if not found
        if translation is None and self._current_language != self._fallback_language:
            translation = self._get_nested_value(
                self._translations.get(self._fallback_language, {}),
                key
            )

        # If still not found, return the key
        if translation is None:
            print(f"Translation not found: {key}")
            return key

        # Substitute variables if provided
        if kwargs:
            try:
                translation = translation.format(**kwargs)
            except KeyError as e:
                print(f"Missing variable in translation '{key}': {e}")

        return translation

    def _get_nested_value(self, data: Dict, key: str) -> Optional[str]:
        """
        Get a nested value from a dictionary using dot notation.

        Args:
            data: Dictionary to search
            key: Key in dot notation (e.g., "main.window_title")

        Returns:
            Value if found, None otherwise
        """
        keys = key.split('.')
        value = data

        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return None

        return value if isinstance(value, str) else None

    def add_language(self, language_code: str, name: str, native_name: str, rtl: bool = False):
        """
        Add a new language to the available languages.

        This method allows easy addition of new languages at runtime.

        Args:
            language_code: Language code (e.g., "es_ES")
            name: English name of the language
            native_name: Native name of the language
            rtl: Whether the language is RTL
        """
        self._available_languages[language_code] = {
            "name": name,
            "native_name": native_name,
            "rtl": rtl
        }

        # Try to load translations if file exists
        lang_file = self._translations_dir / f"{language_code}.json"
        if lang_file.exists():
            try:
                with open(lang_file, 'r', encoding='utf-8') as f:
                    self._translations[language_code] = json.load(f)
                print(f"Loaded translations for new language: {language_code}")
            except Exception as e:
                print(f"Error loading translations for {language_code}: {e}")


# Global translator instance
translator = TranslationManager()


# Convenience function for translations
def _(key: str, **kwargs) -> str:
    """
    Convenience function for translations.

    Args:
        key: Translation key in dot notation
        **kwargs: Variables to substitute in the translation

    Returns:
        Translated string
    """
    return translator.translate(key, **kwargs)
