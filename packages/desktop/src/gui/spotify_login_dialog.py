"""Spotify login dialog."""
import customtkinter as ctk
import webbrowser
from pathlib import Path
from tkinter import filedialog
import threading


class SpotifyLoginDialog(ctk.CTkToplevel):
    """Dialog for Spotify authentication."""

    def __init__(self, parent, auth_handler, on_complete=None):
        """
        Initialize login dialog.

        Args:
            parent: Parent window
            auth_handler: SpotifyAuthHandler instance
            on_complete: Callback when login completes
        """
        super().__init__(parent)

        self.auth_handler = auth_handler
        self.on_complete = on_complete

        # Window configuration
        self.title("Spotify Login")
        self.geometry("500x400")
        self.resizable(False, False)

        # Make modal
        self.transient(parent)
        self.grab_set()

        self._create_ui()

        # Center on screen
        self.update_idletasks()
        x = (self.winfo_screenwidth() // 2) - (500 // 2)
        y = (self.winfo_screenheight() // 2) - (400 // 2)
        self.geometry(f"500x400+{x}+{y}")

    def _create_ui(self):
        """Create the UI."""
        # Main container
        container = ctk.CTkFrame(self)
        container.pack(fill="both", expand=True, padx=20, pady=20)

        # Title
        title = ctk.CTkLabel(
            container,
            text="🔒 Spotify Authentication",
            font=ctk.CTkFont(size=20, weight="bold")
        )
        title.pack(pady=(0, 10))

        # Instructions
        instructions = ctk.CTkTextbox(
            container,
            height=200,
            font=ctk.CTkFont(size=12)
        )
        instructions.pack(fill="both", expand=True, pady=10)

        instructions_text = """To download from Spotify, you need to authenticate:

STEP 1: Login to Spotify
Click the button below to open Spotify in your browser and log in with your account.

STEP 2: Export Cookies
After logging in, you need to export your browser cookies:

Method A - Browser Extension (Easiest):
1. Install "Get cookies.txt LOCALLY" extension
   • Chrome: chrome.google.com/webstore
   • Firefox: addons.mozilla.org

2. Visit open.spotify.com (make sure you're logged in)

3. Click the extension icon and click "Export"

4. Click "Choose Cookies File" below and select the downloaded cookies.txt file

Method B - Manual File:
If you already have a cookies.txt file, just select it using the button below.
"""
        instructions.insert("1.0", instructions_text)
        instructions.configure(state="disabled")

        # Buttons frame
        buttons_frame = ctk.CTkFrame(container, fg_color="transparent")
        buttons_frame.pack(fill="x", pady=10)

        # Open Spotify button
        open_spotify_btn = ctk.CTkButton(
            buttons_frame,
            text="🌐 Open Spotify Login",
            command=self._open_spotify,
            height=40,
            font=ctk.CTkFont(size=13, weight="bold"),
            fg_color="#1DB954",  # Spotify green
            hover_color="#1ed760"
        )
        open_spotify_btn.pack(fill="x", pady=5)

        # Choose cookies file button
        choose_cookies_btn = ctk.CTkButton(
            buttons_frame,
            text="📁 Choose Cookies File",
            command=self._choose_cookies_file,
            height=40,
            font=ctk.CTkFont(size=13)
        )
        choose_cookies_btn.pack(fill="x", pady=5)

        # Status label
        self.status_label = ctk.CTkLabel(
            container,
            text="",
            font=ctk.CTkFont(size=11),
            text_color="gray"
        )
        self.status_label.pack(pady=5)

        # Cancel button
        cancel_btn = ctk.CTkButton(
            container,
            text="Cancel",
            command=self._cancel,
            height=35,
            fg_color="gray",
            hover_color="darkgray"
        )
        cancel_btn.pack(pady=(10, 0))

    def _open_spotify(self):
        """Open Spotify login in browser."""
        self.status_label.configure(
            text="Opening Spotify in browser... Log in, then export cookies.",
            text_color="blue"
        )
        webbrowser.open("https://open.spotify.com")

    def _choose_cookies_file(self):
        """Let user choose cookies file."""
        file_path = filedialog.askopenfilename(
            title="Select Spotify Cookies File",
            filetypes=[
                ("Text files", "*.txt"),
                ("All files", "*.*")
            ],
            initialdir=str(Path.home() / "Downloads")
        )

        if file_path:
            self._save_cookies(Path(file_path))

    def _save_cookies(self, cookies_path: Path):
        """
        Save cookies file.

        Args:
            cookies_path: Path to cookies file
        """
        try:
            # Read cookies file
            with open(cookies_path, 'r') as f:
                cookies_data = f.read()

            # Validate it's a cookies file
            if not cookies_data.strip():
                self.status_label.configure(
                    text="❌ Empty cookies file!",
                    text_color="red"
                )
                return

            # Check if it looks like Netscape format
            if "# Netscape HTTP Cookie File" not in cookies_data and ".spotify.com" not in cookies_data:
                self.status_label.configure(
                    text="⚠️ Warning: This might not be a valid Spotify cookies file",
                    text_color="orange"
                )

            # Save cookies
            self.auth_handler.save_cookies_from_browser(cookies_data)

            self.status_label.configure(
                text="✅ Cookies saved! You can now download from Spotify.",
                text_color="green"
            )

            # Call completion callback after a short delay
            self.after(2000, self._complete_login)

        except Exception as e:
            self.status_label.configure(
                text=f"❌ Error: {str(e)}",
                text_color="red"
            )

    def _complete_login(self):
        """Complete the login process."""
        if self.on_complete:
            self.on_complete()
        self.destroy()

    def _cancel(self):
        """Cancel login."""
        self.destroy()
