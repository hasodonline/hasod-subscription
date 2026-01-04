"""Transliterate Hebrew text to English using OpenAI API."""
import re
import requests
from pathlib import Path


class Transliterator:
    """Handle transliteration of Hebrew text to English."""

    def __init__(self):
        """Initialize transliterator."""
        self.api_key = None
        self._load_api_key()

    def _load_api_key(self):
        """Load OpenAI API key from file."""
        try:
            key_file = Path(__file__).parent.parent.parent / "openaikey"
            if key_file.exists():
                self.api_key = key_file.read_text().strip()
                print("[INFO] OpenAI API key loaded for transliteration")
            else:
                print("[WARNING] OpenAI API key file not found - transliteration disabled")
        except Exception as e:
            print(f"[ERROR] Failed to load OpenAI API key: {e}")

    def has_hebrew(self, text: str) -> bool:
        """Check if text contains Hebrew characters."""
        # Hebrew Unicode range: \u0590-\u05FF
        return bool(re.search(r'[\u0590-\u05FF]', text))

    def transliterate(self, text: str) -> str:
        """Transliterate Hebrew text to English.

        Args:
            text: Text that may contain Hebrew characters

        Returns:
            Transliterated text, or original if no Hebrew or API unavailable
        """
        # Check if we need to transliterate
        if not self.has_hebrew(text):
            print(f"[DEBUG] No Hebrew characters found in: {text}")
            return text

        if not self.api_key:
            print("[WARNING] No API key available for transliteration")
            return text

        try:
            print(f"[INFO] Transliterating: {text}")

            # Call OpenAI API
            url = 'https://api.openai.com/v1/chat/completions'
            headers = {
                'Authorization': f'Bearer {self.api_key}',
                'Content-Type': 'application/json'
            }

            data = {
                'model': 'gpt-4o-mini',  # Cheapest model
                'messages': [
                    {
                        'role': 'user',
                        'content': f'Transliterate this text to English (Latin alphabet). '
                                   f'Keep non-Hebrew parts unchanged. Only output the transliterated text, '
                                   f'nothing else:\n\n{text}'
                    }
                ],
                'temperature': 0.3,
                'max_tokens': 100
            }

            response = requests.post(url, headers=headers, json=data, timeout=10)
            result = response.json()

            if 'choices' in result and len(result['choices']) > 0:
                transliterated = result['choices'][0]['message']['content'].strip()
                print(f"[SUCCESS] Transliterated '{text}' -> '{transliterated}'")
                return transliterated
            else:
                print(f"[ERROR] Unexpected API response: {result}")
                return text

        except Exception as e:
            print(f"[ERROR] Transliteration failed: {e}")
            return text

    def transliterate_filename(self, filename: str) -> str:
        """Transliterate a filename, preserving the extension.

        Args:
            filename: Filename to transliterate

        Returns:
            Transliterated filename with original extension
        """
        # Split filename and extension
        path = Path(filename)
        name = path.stem
        ext = path.suffix

        # Transliterate the name part only
        transliterated_name = self.transliterate(name)

        # Reconstruct filename
        return transliterated_name + ext


# Global transliterator instance
_transliterator = None


def get_transliterator() -> Transliterator:
    """Get the global transliterator instance."""
    global _transliterator
    if _transliterator is None:
        _transliterator = Transliterator()
    return _transliterator
