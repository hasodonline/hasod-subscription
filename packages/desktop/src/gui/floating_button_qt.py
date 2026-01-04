"""PySide6 floating button with true always-on-top support for macOS."""
import sys
from pathlib import Path
from ctypes import c_void_p
from PySide6.QtWidgets import QApplication, QWidget, QPushButton
from PySide6.QtCore import Qt, QPoint, Signal, QUrl
from PySide6.QtGui import QPixmap, QIcon, QFont, QPalette, QColor
from ..utils.i18n import translator, _

# Import PyObjC for macOS native window level control
try:
    from AppKit import NSApp, NSWindow
    from Quartz import (CGWindowLevelForKey, kCGMainMenuWindowLevel,
                        kCGStatusWindowLevel, kCGPopUpMenuWindowLevel,
                        kCGFloatingWindowLevel, kCGScreenSaverWindowLevel)
    import objc
    PYOBJC_AVAILABLE = True
except ImportError:
    PYOBJC_AVAILABLE = False
    print("[WARNING] PyObjC not available - limited always-on-top support")


class FloatingButton(QWidget):
    """Floating always-on-top button that works above fullscreen apps."""

    # Signals for communication with main app
    url_dropped = Signal(str)  # Emitted when URL is dropped
    local_file_dropped = Signal(str)  # Emitted when local file/folder is dropped
    button_clicked = Signal()  # Emitted when button is clicked

    def __init__(self, icon_path=None):
        """Initialize floating button.

        Args:
            icon_path: Path to icon image file
        """
        super().__init__()

        # Window configuration for true always-on-top
        self.setWindowFlags(
            Qt.WindowType.WindowStaysOnTopHint |  # Stay on top
            Qt.WindowType.FramelessWindowHint |   # No window frame
            Qt.WindowType.Tool |                  # Tool window (doesn't appear in taskbar)
            Qt.WindowType.WindowDoesNotAcceptFocus  # Non-activating overlay
        )

        # Enable transparency for rounded button
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)

        # Enable drag and drop
        self.setAcceptDrops(True)

        # Window size and position
        self.setFixedSize(120, 120)

        # Position in top-right corner
        screen = QApplication.primaryScreen().geometry()
        self.move(screen.width() - 140, 100)

        # Create button
        self.button = QPushButton(self)
        self.button.setGeometry(0, 0, 120, 120)
        self.button.setFont(QFont("Arial", 16, QFont.Weight.Bold))

        # Set initial text
        self.retranslate_ui()

        # Style with blue gradient and rounded corners
        self.button.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                                           stop:0 #3B8ED0, stop:1 #1F6AA5);
                color: white;
                border-radius: 60px;
                border: none;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                                           stop:0 #36719F, stop:1 #144870);
            }
            QPushButton:pressed {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                                           stop:0 #2ECC71, stop:1 #27AE60);
            }
        """)

        # Allow mouse events to propagate to parent for dragging
        self.button.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, False)

        # Install event filter to handle dragging on the button itself
        self.button.installEventFilter(self)

        # Icon loading removed - using text only

        # Don't connect button click here - we handle it in mouseReleaseEvent to distinguish from drag

        # Track dragging
        self._drag_position = None
        self._is_dragging = False

        print("[INFO] PySide6 floating button created with true always-on-top support")

    def showEvent(self, event):
        """Handle show event to set native macOS window level."""
        super().showEvent(event)

        # Set native macOS window level for true fullscreen overlay
        # Delay slightly to ensure window is fully created
        if PYOBJC_AVAILABLE and sys.platform == 'darwin':
            from PySide6.QtCore import QTimer
            QTimer.singleShot(200, self._set_macos_window_level)

    def _set_macos_window_level(self):
        """Set macOS native window level to float above fullscreen apps."""
        try:
            from AppKit import NSApplicationActivationPolicyAccessory

            # Set app to accessory mode (no Dock icon)
            NSApp.setActivationPolicy_(NSApplicationActivationPolicyAccessory)
            print("[DEBUG] Set app activation policy to Accessory")

            # Get NSWindow via Qt's windowHandle
            qt_window = self.windowHandle()
            if not qt_window:
                print("[WARNING] Could not get Qt window handle")
                return

            # Get native NSWindow using Qt's native interface
            # This is the proper way to get NSWindow from Qt on macOS
            nswindow = None
            try:
                # Try the new Qt 6 way first
                if hasattr(qt_window, 'nativeInterface'):
                    native_iface = qt_window.nativeInterface()
                    if hasattr(native_iface, 'nativeResourceForWindow'):
                        nswindow = native_iface.nativeResourceForWindow("NSWindow", qt_window)
                        print(f"[DEBUG] Got NSWindow via nativeInterface: {nswindow}")
            except Exception as e:
                print(f"[DEBUG] nativeInterface method failed: {e}")

            # Fallback: search by window size
            if not nswindow:
                print("[DEBUG] Trying fallback: searching by window size")
                for window in NSApp.windows():
                    if window.isVisible() and not window.isMiniaturized():
                        frame = window.frame()
                        if abs(frame.size.width - 120) < 5 and abs(frame.size.height - 120) < 5:
                            nswindow = window
                            print(f"[DEBUG] Found NSWindow by size: {nswindow}")
                            break

            if nswindow:
                # Join all spaces (bit 0) and work as fullscreen auxiliary (bit 7)
                # This is critical for appearing above fullscreen apps
                collection_behavior = (1 << 0) | (1 << 7)  # CanJoinAllSpaces | FullScreenAuxiliary
                nswindow.setCollectionBehavior_(collection_behavior)
                print(f"[SUCCESS] Set collection behavior to {collection_behavior} (CanJoinAllSpaces | FullScreenAuxiliary)")

                # Set window level to 25 (NSStatusWindowLevel) - same as status bar
                # This is the highest normal level that appears above fullscreen apps
                STATUS_WINDOW_LEVEL = 25
                nswindow.setLevel_(STATUS_WINDOW_LEVEL)
                print(f"[SUCCESS] Set NSWindow level to NSStatusWindowLevel ({STATUS_WINDOW_LEVEL})")

                # Prevent window from hiding when app loses focus
                nswindow.setHidesOnDeactivate_(False)
                print("[SUCCESS] Set hidesOnDeactivate to False")
            else:
                print("[WARNING] Could not find NSWindow - floating button may not work above fullscreen apps")

        except Exception as e:
            print(f"[WARNING] Could not set native macOS window level: {e}")
            import traceback
            traceback.print_exc()

    def _on_button_clicked(self):
        """Handle button click."""
        print("[INFO] Floating button clicked")
        self.button_clicked.emit()

    def eventFilter(self, obj, event):
        """Filter events from the button to enable dragging and clicking."""
        if obj == self.button:
            event_type = event.type()

            if event_type == event.Type.MouseButtonPress:
                # Record press position for drag detection
                if event.button() == Qt.MouseButton.LeftButton:
                    self._drag_position = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
                    self._press_position = event.globalPosition().toPoint()
                    self._is_dragging = False
                return False  # Let button handle visual feedback

            elif event_type == event.Type.MouseMove:
                # Handle dragging
                if event.buttons() == Qt.MouseButton.LeftButton and hasattr(self, '_drag_position') and self._drag_position:
                    if not self._is_dragging:
                        move_distance = (event.globalPosition().toPoint() - self._press_position).manhattanLength()
                        if move_distance > 5:  # 5 pixel threshold
                            self._is_dragging = True
                            print("[DEBUG] Dragging started")

                    if self._is_dragging:
                        self.move(event.globalPosition().toPoint() - self._drag_position)
                        return True  # Block button hover during drag
                return False

            elif event_type == event.Type.MouseButtonRelease:
                # Handle release - emit click only if not dragging
                if event.button() == Qt.MouseButton.LeftButton:
                    was_dragging = self._is_dragging

                    # Reset state
                    self._is_dragging = False
                    self._drag_position = None

                    if not was_dragging:
                        # It was a click, not a drag - emit signal after button processes release
                        print("[DEBUG] Click detected (not drag)")
                        from PySide6.QtCore import QTimer
                        QTimer.singleShot(0, self._on_button_clicked)
                        return False  # Let button handle visual state reset
                    else:
                        # Was dragging - block the click
                        print("[DEBUG] Drag completed")
                        return False  # Let button reset visual state anyway

        return super().eventFilter(obj, event)

    def mousePressEvent(self, event):
        """Handle mouse press to start dragging."""
        if event.button() == Qt.MouseButton.LeftButton:
            self._drag_position = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
            self._press_position = event.globalPosition().toPoint()
            self._is_dragging = False
            event.accept()

    def mouseMoveEvent(self, event):
        """Handle mouse move to drag window."""
        if event.buttons() == Qt.MouseButton.LeftButton and self._drag_position:
            # Check if we've moved enough to be considered a drag
            if not self._is_dragging:
                move_distance = (event.globalPosition().toPoint() - self._press_position).manhattanLength()
                if move_distance > 5:  # 5 pixel threshold
                    self._is_dragging = True

            if self._is_dragging:
                self.move(event.globalPosition().toPoint() - self._drag_position)
                event.accept()

    def mouseReleaseEvent(self, event):
        """Handle mouse release."""
        if event.button() == Qt.MouseButton.LeftButton:
            # Only emit button click if we weren't dragging
            if not self._is_dragging and hasattr(self, '_press_position'):
                self._on_button_clicked()
            self._is_dragging = False
            self._drag_position = None
            event.accept()

    def dragEnterEvent(self, event):
        """Handle drag enter event."""
        if event.mimeData().hasUrls() or event.mimeData().hasText():
            print("[FLOATING DROP ENTER] Drag detected over PySide6 button")
            # Change to green on hover
            self.button.setStyleSheet("""
                QPushButton {
                    background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                                               stop:0 #2ECC71, stop:1 #27AE60);
                    color: white;
                    border-radius: 60px;
                    border: none;
                }
            """)
            event.acceptProposedAction()
        else:
            event.ignore()

    def dragLeaveEvent(self, event):
        """Handle drag leave event."""
        print("[FLOATING DROP LEAVE] Drag left PySide6 button")
        # Restore blue color
        self.button.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                                           stop:0 #3B8ED0, stop:1 #1F6AA5);
                color: white;
                border-radius: 60px;
                border: none;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                                           stop:0 #36719F, stop:1 #144870);
            }
        """)
        event.accept()

    def dropEvent(self, event):
        """Handle drop event - distinguish between local files and URLs."""
        print("[FLOATING DROP] Item dropped on PySide6 button!")

        # Restore blue color
        self.dragLeaveEvent(event)

        # Extract data from drop
        data = None
        is_local_file = False

        if event.mimeData().hasUrls():
            urls = event.mimeData().urls()
            if urls:
                qurl = urls[0]

                # Check if it's a local file path
                if qurl.isLocalFile():
                    # It's a local file/folder
                    data = qurl.toLocalFile()
                    is_local_file = True
                    print(f"[DEBUG] Dropped local file: {data}")
                else:
                    # It's a remote URL
                    data = qurl.toString()
                    print(f"[DEBUG] Dropped URL: {data}")

        elif event.mimeData().hasText():
            data = event.mimeData().text().strip()
            # Check if it's a local path
            if Path(data).exists():
                is_local_file = True
                print(f"[DEBUG] Dropped local path from text: {data}")
            else:
                print(f"[DEBUG] Dropped URL from text: {data}")

        if data:
            if is_local_file:
                print(f"[SUCCESS] Emitting local file: {data}")
                self.local_file_dropped.emit(data)
            else:
                print(f"[SUCCESS] Emitting URL: {data}")
                self.url_dropped.emit(data)
            event.acceptProposedAction()
        else:
            print("[WARNING] No data found in drop")
            event.ignore()

    def retranslate_ui(self):
        """Update all UI text to current language."""
        self.button.setText(_("floating_button.text"))


def run_floating_button_app(icon_path=None, on_url_dropped=None, on_button_clicked=None):
    """Run the floating button in a separate QApplication.

    Args:
        icon_path: Path to icon image
        on_url_dropped: Callback function for URL drops (receives URL string)
        on_button_clicked: Callback function for button clicks

    Returns:
        tuple: (app, floating_button) for integration with event loop
    """
    # Create QApplication if it doesn't exist
    app = QApplication.instance()
    if app is None:
        app = QApplication(sys.argv)

    # Create floating button
    floating_button = FloatingButton(icon_path)

    # Connect callbacks
    if on_url_dropped:
        floating_button.url_dropped.connect(on_url_dropped)
    if on_button_clicked:
        floating_button.button_clicked.connect(on_button_clicked)

    # Show button
    floating_button.show()
    floating_button.raise_()  # Bring to front

    print("[SUCCESS] PySide6 floating button is running with fullscreen overlay support!")

    return app, floating_button
