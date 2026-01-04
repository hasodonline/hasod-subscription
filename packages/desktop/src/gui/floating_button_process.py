"""
Floating button in a separate process to avoid Qt/Tkinter conflicts.
"""
import sys
import multiprocessing
from pathlib import Path


def run_floating_button_process(icon_path_str, message_queue):
    """Run the floating button in a separate process."""
    try:
        # Import Qt here (only in this process)
        from .floating_button_qt import FloatingButton
        from PySide6.QtWidgets import QApplication

        # Create Qt application
        app = QApplication(sys.argv)

        # Create floating button
        icon_path = icon_path_str if icon_path_str and Path(icon_path_str).exists() else None
        button = FloatingButton(icon_path)

        # Connect signals to send messages to parent process
        def on_url_dropped(url):
            message_queue.put(('url_dropped', url))

        def on_button_clicked():
            message_queue.put(('button_clicked', None))

        button.url_dropped.connect(on_url_dropped)
        button.button_clicked.connect(on_button_clicked)

        # Show button
        button.show()
        button.raise_()

        print("[SUCCESS] Floating button running in separate process!")

        # Run Qt event loop
        sys.exit(app.exec())

    except Exception as e:
        print(f"[ERROR] Floating button process failed: {e}")
        import traceback
        traceback.print_exc()


class FloatingButtonManager:
    """Manages the floating button in a separate process."""

    def __init__(self, icon_path=None, on_url_dropped=None, on_button_clicked=None):
        """Initialize the floating button manager.

        Args:
            icon_path: Path to icon image
            on_url_dropped: Callback for URL drops
            on_button_clicked: Callback for button clicks
        """
        self.icon_path = icon_path
        self.on_url_dropped = on_url_dropped
        self.on_button_clicked = on_button_clicked
        self.process = None
        self.message_queue = multiprocessing.Queue()

    def start(self):
        """Start the floating button process."""
        # Create and start process
        self.process = multiprocessing.Process(
            target=run_floating_button_process,
            args=(self.icon_path, self.message_queue),
            daemon=True
        )
        self.process.start()
        print(f"[INFO] Floating button process started (PID: {self.process.pid})")

    def check_messages(self):
        """Check for messages from the floating button process.
        Should be called periodically from the main Tkinter event loop.
        """
        try:
            while not self.message_queue.empty():
                message_type, data = self.message_queue.get_nowait()

                if message_type == 'url_dropped' and self.on_url_dropped:
                    self.on_url_dropped(data)
                elif message_type == 'button_clicked' and self.on_button_clicked:
                    self.on_button_clicked()

        except Exception as e:
            print(f"[ERROR] Error checking messages: {e}")

    def stop(self):
        """Stop the floating button process."""
        if self.process and self.process.is_alive():
            self.process.terminate()
            self.process.join(timeout=2)
            print("[INFO] Floating button process stopped")
