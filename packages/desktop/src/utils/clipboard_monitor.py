"""Clipboard monitoring for automatic URL detection."""
import pyperclip
import threading
import time
from typing import Callable, Optional

from .url_parser import URLParser


class ClipboardMonitor:
    """Monitor clipboard for supported URLs."""

    def __init__(self, callback: Callable[[str], None], interval: float = 1.0):
        """
        Initialize clipboard monitor.

        Args:
            callback: Function to call when valid URL is detected
            interval: Check interval in seconds
        """
        self.callback = callback
        self.interval = interval
        self.last_value = ""
        self.is_running = False
        self.thread: Optional[threading.Thread] = None

    def start(self):
        """Start monitoring clipboard."""
        if self.is_running:
            return

        self.is_running = True
        self.thread = threading.Thread(target=self._monitor, daemon=True)
        self.thread.start()

    def stop(self):
        """Stop monitoring clipboard."""
        self.is_running = False
        if self.thread:
            self.thread.join(timeout=2)

    def _monitor(self):
        """Monitor loop running in thread."""
        while self.is_running:
            try:
                current_value = pyperclip.paste()

                # Check if clipboard changed
                if current_value != self.last_value:
                    self.last_value = current_value

                    # Check if it's a valid URL
                    if URLParser.is_valid(current_value):
                        self.callback(current_value)

            except Exception as e:
                print(f"Clipboard monitor error: {e}")

            time.sleep(self.interval)
