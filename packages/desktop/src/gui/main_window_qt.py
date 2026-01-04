"""Modern Qt-based main window for Hasod Downloads."""
import sys
from pathlib import Path
from PySide6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QPushButton, QLineEdit, QScrollArea, QProgressBar, QFrame, QTabWidget
)
from PySide6.QtCore import Qt, QTimer, Signal, QPropertyAnimation, QEasingCurve, QSize, QUrl
from PySide6.QtGui import QFont, QPalette, QColor, QIcon, QDesktopServices
from PySide6.QtMultimedia import QMediaPlayer, QAudioOutput

try:
    from AppKit import NSApp, NSApplicationActivationPolicyRegular
    PYOBJC_AVAILABLE = True
except ImportError:
    PYOBJC_AVAILABLE = False

from ..downloaders.download_manager import DownloadManager, DownloadTask
from ..utils.url_parser import URLParser, Platform
from ..utils.config import config
from ..utils.i18n import translator, _
from .floating_button_qt import FloatingButton
from .license_tab import LicenseTab


# Modern dark theme stylesheet
DARK_STYLE = """
QMainWindow {
    background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                               stop:0 #1a1a2e, stop:1 #16213e);
}

QWidget#centralWidget {
    background: transparent;
}

QLabel#titleLabel {
    color: #ffffff;
    font-size: 32px;
    font-weight: bold;
    padding: 10px;
}

QLabel#subtitleLabel {
    color: #a0a0a0;
    font-size: 14px;
    padding: 5px;
}

QLineEdit {
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid rgba(59, 142, 208, 0.3);
    border-radius: 12px;
    color: #ffffff;
    padding: 12px 20px;
    font-size: 14px;
}

QLineEdit:focus {
    border: 2px solid #3B8ED0;
    background: rgba(255, 255, 255, 0.08);
}

QPushButton#downloadBtn {
    background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                               stop:0 #3B8ED0, stop:1 #1F6AA5);
    color: white;
    border: none;
    border-radius: 12px;
    padding: 12px 30px;
    font-size: 14px;
    font-weight: bold;
}

QPushButton#downloadBtn:hover {
    background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                               stop:0 #36719F, stop:1 #144870);
}

QPushButton#downloadBtn:pressed {
    background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                               stop:0 #2d5a7f, stop:1 #103850);
}

QPushButton#settingsBtn, QPushButton#folderBtn {
    background: rgba(255, 255, 255, 0.05);
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 8px 16px;
    font-size: 13px;
}

QPushButton#settingsBtn:hover, QPushButton#folderBtn:hover {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
}

QFrame#downloadItem {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    padding: 10px;
}

QLabel#platformLabel {
    color: #3B8ED0;
    font-size: 12px;
    font-weight: bold;
}

QLabel#statusLabel {
    color: #a0a0a0;
    font-size: 11px;
}

QLabel#statusLabel[status="downloading"] {
    color: #f39c12;
}

QLabel#statusLabel[status="completed"] {
    color: #2ecc71;
}

QLabel#statusLabel[status="error"] {
    color: #e74c3c;
}

QProgressBar {
    background: rgba(255, 255, 255, 0.05);
    border: none;
    border-radius: 4px;
    height: 8px;
    text-align: center;
}

QProgressBar::chunk {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                               stop:0 #3B8ED0, stop:1 #2ecc71);
    border-radius: 4px;
}

QScrollArea {
    background: transparent;
    border: none;
}

QLabel#statusBar {
    background: rgba(0, 0, 0, 0.3);
    color: #a0a0a0;
    padding: 8px 20px;
    font-size: 12px;
}

QLabel#queueLabel {
    background: rgba(59, 142, 208, 0.2);
    color: #3B8ED0;
    padding: 6px 15px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: bold;
}

QTabWidget::pane {
    border: none;
    background: transparent;
}

QTabBar::tab {
    background: rgba(255, 255, 255, 0.03);
    color: #a0a0a0;
    padding: 12px 24px;
    margin-right: 4px;
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
    font-size: 14px;
}

QTabBar::tab:selected {
    background: rgba(59, 142, 208, 0.2);
    color: #3B8ED0;
    font-weight: bold;
}

QTabBar::tab:hover {
    background: rgba(255, 255, 255, 0.08);
}
"""


class DownloadWidget(QFrame):
    """Widget for displaying a single download."""

    def __init__(self, task: DownloadTask, parent=None):
        super().__init__(parent)
        self.task = task
        self.setObjectName("downloadItem")
        self.media_player = None
        self.audio_output = None
        self.play_button = None
        self.track_title = None  # Store track title once extracted
        self._setup_ui()

    def _setup_ui(self):
        """Setup the download widget UI."""
        layout = QVBoxLayout(self)
        layout.setSpacing(8)
        layout.setContentsMargins(15, 12, 15, 12)

        # Platform badge with title (extract from message)
        title = self._extract_title()
        self.platform_label = QLabel(f"[{self.task.platform.value.upper()}] {title}")
        self.platform_label.setObjectName("platformLabel")
        layout.addWidget(self.platform_label)

        # Progress bar
        self.progress_bar = QProgressBar()
        self.progress_bar.setValue(0)
        self.progress_bar.setTextVisible(False)
        layout.addWidget(self.progress_bar)

        # Status row with player controls
        status_layout = QHBoxLayout()

        # Media player controls (hidden initially)
        self.player_widget = QWidget()
        self.player_widget.setVisible(False)
        player_layout = QHBoxLayout(self.player_widget)
        player_layout.setContentsMargins(0, 0, 0, 0)

        self.play_button = QPushButton("▶")
        self.play_button.setFixedSize(30, 30)
        self.play_button.clicked.connect(self._toggle_playback)
        player_layout.addWidget(self.play_button)

        status_layout.addWidget(self.player_widget)

        # Status label
        self.status_label = QLabel("Pending...")
        self.status_label.setObjectName("statusLabel")
        status_layout.addWidget(self.status_label, stretch=1)

        layout.addLayout(status_layout)

    def _extract_title(self):
        """Extract title from task message, filename, or URL."""
        # Try to extract from message first (for Spotify)
        if self.task.message and ' - ' in self.task.message:
            # Message format: "Artist - Title | progress | speed | ETA"
            title_part = self.task.message.split('|')[0].strip()
            # Remove "Downloading: " prefix if present
            if title_part.startswith("Downloading: "):
                title_part = title_part.replace("Downloading: ", "")
            if title_part and title_part not in ["", "Fetching Spotify metadata...", "Converting to MP3..."]:
                return title_part

        # Try to extract from output filename (for YouTube/SoundCloud after download completes)
        if self.task.output_path:
            from pathlib import Path
            file_path = Path(self.task.output_path)
            if file_path.exists():
                # Remove .mp3 extension and return filename as title
                return file_path.stem

        # Fallback to shortened URL
        return self.task.url[:50] + "..."

    def _toggle_playback(self):
        """Toggle play/pause for the downloaded file."""
        if not self.media_player:
            return

        if self.media_player.playbackState() == QMediaPlayer.PlaybackState.PlayingState:
            self.media_player.pause()
            self.play_button.setText("▶")
        else:
            self.media_player.play()
            self.play_button.setText("⏸")

    def _open_file_location(self):
        """Open file in Finder."""
        if self.task.output_path:
            from pathlib import Path
            path = Path(self.task.output_path)
            if path.is_file():
                # Open containing folder and select file
                QDesktopServices.openUrl(QUrl.fromLocalFile(str(path.parent)))
            elif path.is_dir():
                # Open folder
                QDesktopServices.openUrl(QUrl.fromLocalFile(str(path)))

    def update_progress(self):
        """Update progress bar and status."""
        # Extract and store title once during download, keep it after completion
        if not self.track_title and self.task.message:
            extracted = self._extract_title()
            if extracted and not extracted.endswith("..."):  # Not a URL fallback
                self.track_title = extracted

        # Use stored title if available, otherwise extract
        display_title = self.track_title if self.track_title else self._extract_title()
        self.platform_label.setText(f"[{self.task.platform.value.upper()}] {display_title}")

        self.progress_bar.setValue(int(self.task.progress))

        # Update status with clickable filename for completed downloads
        if self.task.status == "completed" and self.task.output_path:
            from pathlib import Path
            file_path = Path(self.task.output_path)
            filename = file_path.name

            # Create clickable link
            self.status_label.setText(f'<a href="file://{file_path}" style="color: #2ecc71; text-decoration: none;">✓ {filename}</a>')
            self.status_label.setTextFormat(Qt.TextFormat.RichText)
            self.status_label.setOpenExternalLinks(False)
            self.status_label.linkActivated.connect(lambda: self._open_file_location())
            self.status_label.setProperty("status", "completed")

            # Show media player for completed downloads
            if file_path.suffix == '.mp3':
                self.player_widget.setVisible(True)
                if not self.media_player:
                    self.media_player = QMediaPlayer()
                    self.audio_output = QAudioOutput()
                    self.media_player.setAudioOutput(self.audio_output)
                    self.media_player.setSource(QUrl.fromLocalFile(str(file_path)))
        else:
            self.status_label.setText(self.task.message)
            self.status_label.setTextFormat(Qt.TextFormat.PlainText)
            self.player_widget.setVisible(False)

            # Update status color
            if self.task.status == "error":
                self.status_label.setProperty("status", "error")
            elif self.task.status == "downloading":
                self.status_label.setProperty("status", "downloading")
            else:
                self.status_label.setProperty("status", "pending")

        # Reapply stylesheet to update colors
        self.status_label.style().unpolish(self.status_label)
        self.status_label.style().polish(self.status_label)


class MainWindow(QMainWindow):
    """Modern Qt-based main window."""

    def __init__(self):
        super().__init__()

        # Initialize translator with configured language
        saved_language = config.get('language', 'en_US')
        translator.set_language(saved_language)

        # Connect to language change signal
        translator.language_changed.connect(self._on_language_changed)

        self.setWindowTitle(_("app.title"))
        self.resize(900, 700)
        self.setMinimumSize(700, 600)

        # Set app activation policy to regular (show in Dock)
        if PYOBJC_AVAILABLE and sys.platform == 'darwin':
            NSApp.setActivationPolicy_(NSApplicationActivationPolicyRegular)

        # Apply modern dark theme
        self.setStyleSheet(DARK_STYLE)

        # Initialize download manager
        self.download_manager = DownloadManager()

        # Track download widgets
        self.download_widgets = {}

        # Setup UI
        self._setup_ui()

        # Setup drag and drop
        self.setAcceptDrops(True)

        # Start status update timer
        self.update_timer = QTimer(self)
        self.update_timer.timeout.connect(self._update_status)
        self.update_timer.start(100)  # Update every 100ms for smooth progress updates

        # Create floating button
        self._create_floating_button()

    def _setup_ui(self):
        """Setup the user interface."""
        # Central widget
        central = QWidget()
        central.setObjectName("centralWidget")
        self.setCentralWidget(central)

        # Main layout
        main_layout = QVBoxLayout(central)
        main_layout.setSpacing(20)
        main_layout.setContentsMargins(30, 30, 30, 20)

        # Header
        header_layout = QHBoxLayout()

        # Title
        self.title_label = QLabel(_("app.title"))
        self.title_label.setObjectName("titleLabel")
        header_layout.addWidget(self.title_label)

        header_layout.addStretch()

        # Settings button
        self.settings_btn = QPushButton(_("main.settings_button"))
        self.settings_btn.setObjectName("settingsBtn")
        self.settings_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.settings_btn.clicked.connect(self._open_settings)
        header_layout.addWidget(self.settings_btn)

        # Open folder button
        self.folder_btn = QPushButton(_("main.open_folder_button"))
        self.folder_btn.setObjectName("folderBtn")
        self.folder_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.folder_btn.clicked.connect(self._open_downloads_folder)
        header_layout.addWidget(self.folder_btn)

        main_layout.addLayout(header_layout)

        # Create tab widget
        self.tab_widget = QTabWidget()
        main_layout.addWidget(self.tab_widget, stretch=1)

        # Create Downloads tab
        self._create_downloads_tab()

        # Create File Search tab
        self._create_search_tab()

        # Create Hebrefy tab
        self._create_hebrefy_tab()

        # Create License tab
        self._create_license_tab()

        # Status bar at the bottom (outside tabs)
        status_layout = QHBoxLayout()
        status_layout.setContentsMargins(0, 10, 0, 0)

        self.status_label = QLabel(_("common.ready"))
        self.status_label.setObjectName("statusBar")
        status_layout.addWidget(self.status_label, stretch=1)

        self.queue_label = QLabel(_("main.queue_status", count=0))
        self.queue_label.setObjectName("queueLabel")
        status_layout.addWidget(self.queue_label)

        main_layout.addLayout(status_layout)

    def _create_downloads_tab(self):
        """Create the Downloads tab"""
        downloads_tab = QWidget()
        tab_layout = QVBoxLayout(downloads_tab)
        tab_layout.setSpacing(20)
        tab_layout.setContentsMargins(0, 20, 0, 0)

        # Subtitle
        self.subtitle = QLabel(_("main.url_instruction"))
        self.subtitle.setObjectName("subtitleLabel")
        tab_layout.addWidget(self.subtitle)

        # URL input section
        input_layout = QHBoxLayout()
        input_layout.setSpacing(12)

        self.url_entry = QLineEdit()
        self.url_entry.setPlaceholderText(_("main.url_placeholder"))
        self.url_entry.returnPressed.connect(self._add_download)
        input_layout.addWidget(self.url_entry, stretch=1)

        self.download_btn = QPushButton(_("main.download_button"))
        self.download_btn.setObjectName("downloadBtn")
        self.download_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.download_btn.clicked.connect(self._add_download)
        self.download_btn.setFixedHeight(48)
        input_layout.addWidget(self.download_btn)

        tab_layout.addLayout(input_layout)

        # Downloads section
        self.downloads_section_label = QLabel(_("main.downloads_tab"))
        self.downloads_section_label.setStyleSheet("color: #ffffff; font-size: 18px; font-weight: bold; padding: 10px 0;")
        tab_layout.addWidget(self.downloads_section_label)

        # Scrollable downloads area
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)

        # Container for downloads
        self.downloads_container = QWidget()
        self.downloads_layout = QVBoxLayout(self.downloads_container)
        self.downloads_layout.setSpacing(12)
        self.downloads_layout.setContentsMargins(0, 0, 10, 0)
        self.downloads_layout.addStretch()

        # Placeholder
        self.placeholder_label = QLabel(_("main.empty_state"))
        self.placeholder_label.setStyleSheet("color: #606060; font-size: 14px; padding: 40px;")
        self.placeholder_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.downloads_layout.insertWidget(0, self.placeholder_label)

        scroll.setWidget(self.downloads_container)
        tab_layout.addWidget(scroll, stretch=1)

        # Store downloads tab for later reference
        self.downloads_tab = downloads_tab

        # Add tab to tab widget
        self.tab_widget.addTab(downloads_tab, _("main.downloads_tab"))

    def _create_search_tab(self):
        """Create the File Search tab"""
        from .search_tab import SearchTab

        self.search_tab = SearchTab()
        self.search_tab.status_message.connect(self._show_status)

        self.tab_widget.addTab(self.search_tab, _("search.tab_name"))

    def _create_hebrefy_tab(self):
        """Create the Hebrefy tab"""
        from .hebrefy_tab import HebrefyTab

        self.hebrefy_tab = HebrefyTab()
        self.hebrefy_tab.status_message.connect(self._show_status)

        self.tab_widget.addTab(self.hebrefy_tab, _("hebrefy.tab_name"))

    def _create_license_tab(self):
        """Create the License tab"""
        self.license_tab = LicenseTab()
        self.tab_widget.addTab(self.license_tab, _("license.tab_name"))

    def _add_download(self):
        """Add download from URL entry."""
        url = self.url_entry.text().strip()

        if not url:
            self._show_status(_("main.messages.enter_url"), error=True)
            return

        # Validate URL
        if not URLParser.is_valid(url):
            self._show_status(_("main.messages.invalid_url"), error=True)
            return

        # Check if it's a Spotify album and show processing message
        platform, _ = URLParser.parse(url)
        is_album = platform == Platform.SPOTIFY and 'album/' in url

        if is_album:
            self._show_status(_("main.messages.processing_album"))

        # Add to download manager
        task = self.download_manager.add_download(url)

        if task:
            self.url_entry.clear()

            # For albums, create widgets for all queued tasks
            if is_album:
                # Get all album tasks from history (the last N tasks)
                history = self.download_manager.get_history()
                album_tasks = [t for t in history if t.album_name == task.album_name]
                for album_task in album_tasks:
                    if id(album_task) not in self.download_widgets:
                        self._create_download_widget(album_task)
            else:
                self._create_download_widget(task)

            # Hide placeholder
            if self.placeholder_label.isVisible():
                self.placeholder_label.hide()

            # Show appropriate status message (after widget creation)
            try:
                if is_album and task.total_tracks:
                    self._show_status(_("main.messages.album_added", count=task.total_tracks, name=task.album_name))
                else:
                    self._show_status(_("main.messages.added_to_queue", platform=task.platform.value))
            except Exception as e:
                self._show_status(f"Download added: {task.platform.value}")
        else:
            self._show_status("Failed to add download", error=True)

    def _create_download_widget(self, task: DownloadTask):
        """Create widget for download task."""
        widget = DownloadWidget(task)

        # Insert before the stretch
        index = self.downloads_layout.count() - 1
        self.downloads_layout.insertWidget(index, widget)

        # Store widget
        self.download_widgets[id(task)] = widget

    def _update_status(self):
        """Update download status (called every 500ms)."""
        try:
            # Update each download widget
            for task_id, widget in self.download_widgets.items():
                widget.update_progress()

            # Update queue count
            queue_size = self.download_manager.get_queue_size()
            self.queue_label.setText(_("main.queue_status", count=queue_size))

        except Exception as e:
            print(f"[ERROR] Update status failed: {e}")

    def _show_status(self, message: str, error: bool = False):
        """Show status message."""
        self.status_label.setText(message)
        if error:
            self.status_label.setStyleSheet(
                "background: rgba(231, 76, 60, 0.2); color: #e74c3c; "
                "padding: 8px 20px; font-size: 12px; border-radius: 8px;"
            )
        else:
            self.status_label.setStyleSheet(
                "background: rgba(0, 0, 0, 0.3); color: #a0a0a0; "
                "padding: 8px 20px; font-size: 12px;"
            )

    def _open_settings(self):
        """Open settings window."""
        from .settings_dialog import SettingsDialog
        dialog = SettingsDialog(self)
        # Connect to language change signal
        dialog.language_changed.connect(self._on_language_changed)
        if dialog.exec():
            self._show_status(_("main.messages.settings_saved"))

    def _open_downloads_folder(self):
        """Open downloads folder in file manager."""
        import subprocess

        folder = config.downloads_path

        try:
            if sys.platform == 'darwin':  # macOS
                subprocess.run(['open', folder])
            elif sys.platform == 'win32':  # Windows
                subprocess.run(['explorer', folder])
            else:  # Linux
                subprocess.run(['xdg-open', folder])
        except Exception as e:
            self._show_status(f"Failed to open folder: {e}", error=True)

    # Drag and drop support
    def dragEnterEvent(self, event):
        """Handle drag enter event."""
        if event.mimeData().hasUrls() or event.mimeData().hasText():
            print("[DRAG ENTER] URL detected")
            self._show_status("Drop URL here...")
            event.acceptProposedAction()
        else:
            event.ignore()

    def dragLeaveEvent(self, event):
        """Handle drag leave event."""
        print("[DRAG LEAVE]")
        self._show_status("Ready")
        event.accept()

    def dropEvent(self, event):
        """Handle drop event."""
        print("[DROP] Processing dropped data")

        # Extract URL
        url = None
        if event.mimeData().hasUrls():
            urls = event.mimeData().urls()
            if urls:
                url = urls[0].toString()
                print(f"[DEBUG] Dropped URL from URLs: {url}")
        elif event.mimeData().hasText():
            url = event.mimeData().text().strip()
            print(f"[DEBUG] Dropped URL from text: {url}")

        if url:
            # Set URL in entry
            self.url_entry.setText(url)

            # Validate and auto-start download
            if URLParser.is_valid(url):
                platform, _ = URLParser.parse(url)
                self._show_status(f"✓ Valid {platform.value} URL dropped - starting download...")
                print(f"[SUCCESS] Valid {platform.value} URL dropped!")

                # Auto-start download
                QTimer.singleShot(100, self._add_download)
            else:
                self._show_status("URL detected - verify before downloading")

            event.acceptProposedAction()
        else:
            print("[WARNING] No URL found in drop data")
            event.ignore()

    def _create_floating_button(self):
        """Create the floating button."""
        self.floating_button = FloatingButton(icon_path=None)

        # Connect signals
        self.floating_button.url_dropped.connect(self._on_floating_url_dropped)
        self.floating_button.local_file_dropped.connect(self._on_floating_file_dropped)
        self.floating_button.button_clicked.connect(self._on_floating_button_clicked)

        # Show floating button
        self.floating_button.show()
        self.floating_button.raise_()

        print("[SUCCESS] Floating button created!")

    def _on_floating_url_dropped(self, url):
        """Handle URL dropped on floating button."""
        print(f"[FLOATING BUTTON] URL dropped: {url}")

        # Set URL in entry
        self.url_entry.setText(url)

        # Validate and auto-start download
        if URLParser.is_valid(url):
            platform, _ = URLParser.parse(url)
            self._show_status(f"✓ Valid {platform.value} URL dropped - starting download...")
            QTimer.singleShot(100, self._add_download)
        else:
            self._show_status(_("main.url_detected"))

        # Show and focus main window
        self.show()
        self.raise_()
        self.activateWindow()

    def _on_floating_file_dropped(self, file_path):
        """Handle local file/folder dropped on floating button."""
        print(f"[FLOATING BUTTON] Local file dropped: {file_path}")

        # Show main window
        self.show()
        self.raise_()
        self.activateWindow()

        # Switch to Hebrefy tab
        self.tab_widget.setCurrentIndex(2)  # Hebrefy is 3rd tab (index 2)

        # Trigger Hebrefy on this file
        from pathlib import Path
        path = Path(file_path)

        if not path.exists():
            self._show_status(_("main.file_not_found"), error=True)
            return

        # Call Hebrefy tab's processing method directly
        self.hebrefy_tab._process_path(path)

    def _on_language_changed(self, language_code: str):
        """Handle language change event."""
        print(f"[i18n] Language changed to {language_code}, updating UI...")
        self.retranslate_ui()
        # Update child tabs
        if hasattr(self, 'search_tab'):
            self.search_tab.retranslate_ui()
        if hasattr(self, 'hebrefy_tab'):
            self.hebrefy_tab.retranslate_ui()
        if hasattr(self, 'floating_button'):
            self.floating_button.retranslate_ui()

    def retranslate_ui(self):
        """Update all UI text to current language."""
        # Window title
        self.setWindowTitle(_("app.title"))

        # Header
        self.title_label.setText(_("app.title"))
        self.settings_btn.setText(_("main.settings_button"))
        self.folder_btn.setText(_("main.open_folder_button"))

        # Downloads tab
        self.subtitle.setText(_("main.url_instruction"))
        self.url_entry.setPlaceholderText(_("main.url_placeholder"))
        self.download_btn.setText(_("main.download_button"))
        self.downloads_section_label.setText(_("main.downloads_tab"))
        self.placeholder_label.setText(_("main.empty_state"))

        # Status bar
        self.status_label.setText(_("common.ready"))
        queue_count = self.download_manager.queue_size()
        self.queue_label.setText(_("main.queue_status", count=queue_count))

        # Tab titles
        self.tab_widget.setTabText(0, _("main.downloads_tab"))
        self.tab_widget.setTabText(1, _("search.tab_name"))
        self.tab_widget.setTabText(2, _("hebrefy.tab_name"))

    def _on_floating_button_clicked(self):
        """Handle floating button clicked."""
        print("[FLOATING BUTTON] Button clicked")
        self.show()
        self.raise_()
        self.activateWindow()

    def closeEvent(self, event):
        """Handle window close."""
        print("[INFO] Closing application...")
        self.update_timer.stop()
        self.download_manager.stop_worker()

        # Close floating button
        if hasattr(self, 'floating_button'):
            self.floating_button.close()

        event.accept()
