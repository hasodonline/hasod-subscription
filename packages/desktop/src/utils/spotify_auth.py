"""Spotify authentication using browser login."""
import http.server
import socketserver
import webbrowser
import threading
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import json


class SpotifyAuthHandler:
    """Handle Spotify authentication via browser login."""

    def __init__(self, config_dir: Path):
        """
        Initialize authentication handler.

        Args:
            config_dir: Directory to store authentication data
        """
        self.config_dir = config_dir
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.cookies_file = self.config_dir / 'spotify_cookies.txt'
        self.auth_complete = False
        self.auth_data = None

    def is_authenticated(self) -> bool:
        """Check if user is authenticated."""
        return self.cookies_file.exists()

    def login(self, callback=None):
        """
        Start browser-based login flow.

        Args:
            callback: Optional callback function to call when auth completes
        """
        # Open Spotify login page
        login_url = "https://accounts.spotify.com/login"

        print(f"Opening browser for Spotify login...")
        webbrowser.open(login_url)

        if callback:
            callback({
                'status': 'waiting',
                'message': 'Please log into Spotify in your browser...'
            })

    def save_cookies_from_browser(self, cookies_data: str):
        """
        Save cookies data to file.

        Args:
            cookies_data: Cookie data in Netscape format
        """
        with open(self.cookies_file, 'w') as f:
            f.write(cookies_data)

    def get_cookies_path(self) -> Path:
        """Get path to cookies file."""
        return self.cookies_file

    def logout(self):
        """Remove saved authentication."""
        if self.cookies_file.exists():
            self.cookies_file.unlink()

    def get_instructions(self) -> str:
        """Get instructions for manual cookie setup."""
        return f"""
To authenticate with Spotify:

1. Click "Login to Spotify" button in the app
2. Log into your Spotify account in the browser
3. After logging in, you'll need to export cookies:

   Option A: Use Browser Extension (Recommended)
   - Install "Get cookies.txt LOCALLY" (Chrome)
   - Or "cookies.txt" (Firefox)
   - Visit open.spotify.com
   - Click extension and export
   - Save as: {self.cookies_file}

   Option B: Manual Cookie File
   - Place a Netscape-format cookies.txt file here:
     {self.cookies_file}

The app will automatically use the saved cookies for downloads.
"""
