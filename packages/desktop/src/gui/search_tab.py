"""
File Search tab UI for searching local and cloud audio files
"""
import sys
from pathlib import Path
from typing import List, Optional
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QLineEdit, QTableWidget, QTableWidgetItem, QHeaderView,
    QFrame, QFileDialog, QMessageBox, QCheckBox, QComboBox
)
from PySide6.QtCore import Qt, QTimer, Signal, QThread, QUrl
from PySide6.QtGui import QDesktopServices, QPixmap
import logging
from pathlib import Path

from ..search.search_manager import SearchManager
from ..search.models import SearchResult
from ..utils.i18n import translator, _

logger = logging.getLogger(__name__)


class IndexWorker(QThread):
    """Background thread for indexing local files"""
    indexing_complete = Signal(int)
    error = Signal(str)

    def __init__(self, search_manager: SearchManager, directories: List[Path]):
        super().__init__()
        self.search_manager = search_manager
        self.directories = directories

    def run(self):
        """Execute indexing in background"""
        try:
            count = self.search_manager.index_local_files(self.directories)
            self.indexing_complete.emit(count)
        except Exception as e:
            logger.error(f"Indexing error: {e}")
            self.error.emit(str(e))


class SearchTab(QWidget):
    """File Search tab widget"""

    status_message = Signal(str, bool)  # message, is_error

    def __init__(self, parent=None):
        super().__init__(parent)
        self.search_manager = SearchManager()
        self.current_results = []
        self.search_worker = None
        self.index_worker = None
        self._setup_ui()

        # Debounce timer for search
        self.search_timer = QTimer()
        self.search_timer.setSingleShot(True)
        self.search_timer.timeout.connect(self._execute_search)

        # Update source status on init
        self._update_source_status()

        # Connect to language change signal
        translator.language_changed.connect(self.retranslate_ui)

    def _setup_ui(self):
        """Setup the search tab UI"""
        layout = QVBoxLayout(self)
        layout.setSpacing(20)
        layout.setContentsMargins(30, 20, 30, 20)

        # Search section
        self.search_label = QLabel(_("search.title"))
        self.search_label.setStyleSheet("color: #ffffff; font-size: 24px; font-weight: bold;")
        layout.addWidget(self.search_label)

        self.subtitle = QLabel(_("search.subtitle"))
        self.subtitle.setStyleSheet("color: #a0a0a0; font-size: 13px; padding-bottom: 10px;")
        layout.addWidget(self.subtitle)

        # Search bar with filters
        search_layout = QHBoxLayout()

        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText(_("search.search_placeholder"))
        self.search_input.textChanged.connect(self._on_search_changed)
        search_layout.addWidget(self.search_input, stretch=1)

        # Filter buttons
        self.filter_all = QCheckBox("All")
        self.filter_all.setChecked(True)
        self.filter_all.stateChanged.connect(self._on_filter_changed)
        search_layout.addWidget(self.filter_all)

        self.filter_local = QCheckBox("Local")
        self.filter_local.setChecked(True)
        self.filter_local.stateChanged.connect(self._on_filter_changed)
        search_layout.addWidget(self.filter_local)

        self.filter_gdrive = QCheckBox("Google Drive")
        self.filter_gdrive.setChecked(True)
        self.filter_gdrive.stateChanged.connect(self._on_filter_changed)
        search_layout.addWidget(self.filter_gdrive)

        self.filter_dropbox = QCheckBox("Dropbox")
        self.filter_dropbox.setChecked(True)
        self.filter_dropbox.stateChanged.connect(self._on_filter_changed)
        search_layout.addWidget(self.filter_dropbox)

        layout.addLayout(search_layout)

        # Source connection status
        status_frame = QFrame()
        status_frame.setStyleSheet("""
            QFrame {
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 8px;
                padding: 10px;
            }
        """)
        status_layout = QHBoxLayout(status_frame)

        # Local folder icon (emoji fallback)
        local_icon = QLabel("📁")
        local_icon.setStyleSheet("font-size: 20px; padding-right: 5px;")
        status_layout.addWidget(local_icon)

        self.local_status = QLabel(_("search.local_not_indexed"))
        self.local_status.setStyleSheet("color: #a0a0a0; font-size: 12px;")
        status_layout.addWidget(self.local_status)

        self.index_button = QPushButton(_("search.index_button"))
        self.index_button.setStyleSheet("""
            QPushButton {
                background: rgba(46, 204, 113, 0.2);
                color: #2ecc71;
                border: 1px solid #2ecc71;
                border-radius: 6px;
                padding: 6px 12px;
                font-size: 12px;
            }
            QPushButton:hover {
                background: rgba(46, 204, 113, 0.3);
            }
        """)
        self.index_button.clicked.connect(self._index_local_files)
        status_layout.addWidget(self.index_button)

        status_layout.addStretch()

        # Google Drive icon (official logo)
        gdrive_icon = QLabel()
        icon_path = Path(__file__).parent.parent.parent / "assets" / "icons" / "google_drive.png"
        if icon_path.exists():
            pixmap = QPixmap(str(icon_path))
            gdrive_icon.setPixmap(pixmap.scaled(24, 24, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))
        else:
            gdrive_icon.setText("☁️")
            gdrive_icon.setStyleSheet("font-size: 20px;")
        gdrive_icon.setStyleSheet("padding-right: 5px;")
        status_layout.addWidget(gdrive_icon)

        self.gdrive_status = QLabel(_("search.google_drive_not_connected"))
        self.gdrive_status.setStyleSheet("color: #a0a0a0; font-size: 12px;")
        status_layout.addWidget(self.gdrive_status)

        self.gdrive_button = QPushButton(_("search.connect_button"))
        self.gdrive_button.setStyleSheet("""
            QPushButton {
                background: rgba(59, 142, 208, 0.2);
                color: #3B8ED0;
                border: 1px solid #3B8ED0;
                border-radius: 6px;
                padding: 6px 12px;
                font-size: 12px;
            }
            QPushButton:hover {
                background: rgba(59, 142, 208, 0.3);
            }
        """)
        self.gdrive_button.clicked.connect(self._connect_gdrive)
        status_layout.addWidget(self.gdrive_button)

        status_layout.addStretch()

        # Dropbox icon (official logo)
        dropbox_icon = QLabel()
        icon_path = Path(__file__).parent.parent.parent / "assets" / "icons" / "dropbox.png"
        if icon_path.exists():
            pixmap = QPixmap(str(icon_path))
            dropbox_icon.setPixmap(pixmap.scaled(24, 24, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))
        else:
            dropbox_icon.setText("📦")
            dropbox_icon.setStyleSheet("font-size: 20px;")
        dropbox_icon.setStyleSheet("padding-right: 5px;")
        status_layout.addWidget(dropbox_icon)

        self.dropbox_status = QLabel(_("search.dropbox_not_connected"))
        self.dropbox_status.setStyleSheet("color: #a0a0a0; font-size: 12px;")
        status_layout.addWidget(self.dropbox_status)

        self.dropbox_button = QPushButton(_("search.connect_button"))
        self.dropbox_button.setStyleSheet("""
            QPushButton {
                background: rgba(59, 142, 208, 0.2);
                color: #3B8ED0;
                border: 1px solid #3B8ED0;
                border-radius: 6px;
                padding: 6px 12px;
                font-size: 12px;
            }
            QPushButton:hover {
                background: rgba(59, 142, 208, 0.3);
            }
        """)
        self.dropbox_button.clicked.connect(self._connect_dropbox)
        status_layout.addWidget(self.dropbox_button)

        layout.addWidget(status_frame)

        # Results table
        self.results_label = QLabel(_("search.results_title"))
        self.results_label.setStyleSheet("color: #ffffff; font-size: 16px; font-weight: bold; padding: 10px 0;")
        layout.addWidget(self.results_label)

        self.results_table = QTableWidget()
        self.results_table.setColumnCount(5)
        self.results_table.setHorizontalHeaderLabels([
            _("search.table.source"),
            _("search.table.filename"),
            _("search.table.artist_title"),
            _("search.table.size"),
            _("search.table.modified")
        ])
        self.results_table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.results_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        self.results_table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        self.results_table.horizontalHeader().setSectionResizeMode(4, QHeaderView.ResizeMode.ResizeToContents)
        self.results_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.results_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.results_table.setStyleSheet("""
            QTableWidget {
                background: rgba(255, 255, 255, 0.02);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 8px;
                color: #ffffff;
                gridline-color: rgba(255, 255, 255, 0.05);
            }
            QTableWidget::item {
                padding: 8px;
            }
            QTableWidget::item:selected {
                background: rgba(59, 142, 208, 0.3);
            }
            QHeaderView::section {
                background: rgba(255, 255, 255, 0.05);
                color: #a0a0a0;
                padding: 8px;
                border: none;
                font-weight: bold;
            }
        """)
        self.results_table.doubleClicked.connect(self._on_result_double_clicked)
        layout.addWidget(self.results_table, stretch=1)

        # Action buttons
        action_layout = QHBoxLayout()

        self.open_button = QPushButton(_("search.open_button"))
        self.open_button.clicked.connect(self._open_selected)
        action_layout.addWidget(self.open_button)

        self.download_button = QPushButton(_("search.download_button"))
        self.download_button.clicked.connect(self._download_selected)
        action_layout.addWidget(self.download_button)

        action_layout.addStretch()

        self.results_count_label = QLabel(_("search.results_count", count=0))
        self.results_count_label.setStyleSheet("color: #a0a0a0; font-size: 12px;")
        action_layout.addWidget(self.results_count_label)

        layout.addLayout(action_layout)

    def _on_search_changed(self):
        """Handle search input changed (with debounce)"""
        self.search_timer.stop()
        self.search_timer.start(300)  # 300ms debounce

    def _on_filter_changed(self):
        """Handle filter checkbox changed"""
        # Update "All" checkbox
        if self.sender() == self.filter_all:
            checked = self.filter_all.isChecked()
            self.filter_local.setChecked(checked)
            self.filter_gdrive.setChecked(checked)
            self.filter_dropbox.setChecked(checked)
        else:
            # Update "All" based on individual filters
            all_checked = (self.filter_local.isChecked() and
                          self.filter_gdrive.isChecked() and
                          self.filter_dropbox.isChecked())
            self.filter_all.setChecked(all_checked)

        # Re-run search if there's a query
        if self.search_input.text().strip():
            self._execute_search()

    def _execute_search(self):
        """Execute search with current query and filters"""
        query = self.search_input.text().strip()

        if not query:
            self.results_table.setRowCount(0)
            self.results_count_label.setText(_("search.results_count", count=0))
            return

        # Get selected sources
        sources = set()
        if self.filter_local.isChecked():
            sources.add('local')
        if self.filter_gdrive.isChecked():
            sources.add('gdrive')
        if self.filter_dropbox.isChecked():
            sources.add('dropbox')

        if not sources:
            return

        # Show loading state
        self.results_table.setRowCount(0)
        self.results_count_label.setText(_("search.messages.searching", query=query))
        self.status_message.emit(_("search.messages.searching", query=query), False)

        # Search directly in UI thread to avoid QThread + API issues
        # This is fast enough since we removed parallel execution
        try:
            results = self.search_manager.search(query, sources=sources)
            self._on_results_ready(results)
        except Exception as e:
            self._on_search_error(str(e))

    def _on_results_ready(self, results: List[SearchResult]):
        """Handle search results"""
        self.current_results = results
        self._populate_results_table(results)
        self.results_count_label.setText(_("search.results_count", count=len(results)))
        self.status_message.emit(_("search.messages.found_files", count=len(results)), False)

    def _on_search_error(self, error_msg: str):
        """Handle search error"""
        self.status_message.emit(_("search.messages.search_error", error=error_msg), True)
        self.results_count_label.setText(_("common.error"))

    def _populate_results_table(self, results: List[SearchResult]):
        """Populate results table with search results"""
        self.results_table.setRowCount(len(results))

        for i, result in enumerate(results):
            # Source
            source_item = QTableWidgetItem(result.source.upper())
            if result.source == 'local':
                source_item.setForeground(Qt.GlobalColor.green)
            elif result.source == 'gdrive':
                source_item.setForeground(Qt.GlobalColor.cyan)
            else:
                source_item.setForeground(Qt.GlobalColor.blue)
            self.results_table.setItem(i, 0, source_item)

            # Filename
            self.results_table.setItem(i, 1, QTableWidgetItem(result.filename))

            # Artist - Title
            display_name = result.display_name if result.display_name != result.filename else ""
            self.results_table.setItem(i, 2, QTableWidgetItem(display_name))

            # Size
            self.results_table.setItem(i, 3, QTableWidgetItem(f"{result.size_mb:.1f}"))

            # Modified date
            date_str = result.modified_date.strftime("%Y-%m-%d %H:%M")
            self.results_table.setItem(i, 4, QTableWidgetItem(date_str))

    def _on_result_double_clicked(self, index):
        """Handle double-click on result"""
        self._open_selected()

    def _open_selected(self):
        """Open selected file or show in folder/cloud"""
        selected_rows = self.results_table.selectedIndexes()
        if not selected_rows:
            return

        row = selected_rows[0].row()
        if row >= len(self.current_results):
            return

        result = self.current_results[row]

        if result.source == 'local':
            # Open local file
            file_path = Path(result.path)
            if file_path.exists():
                QDesktopServices.openUrl(QUrl.fromLocalFile(str(file_path)))
            else:
                self.status_message.emit(_("search.messages.file_not_found"), True)
        else:
            # Open cloud link
            link = self.search_manager.get_cloud_file_link(result)
            if link:
                QDesktopServices.openUrl(QUrl(link))
            else:
                self.status_message.emit(_("search.messages.no_cloud_link"), True)

    def _download_selected(self):
        """Download selected cloud file to local"""
        selected_rows = self.results_table.selectedIndexes()
        if not selected_rows:
            return

        row = selected_rows[0].row()
        if row >= len(self.current_results):
            return

        result = self.current_results[row]

        if result.source == 'local':
            self.status_message.emit(_("search.messages.already_local"), False)
            return

        # Ask user where to save
        from ..utils.config import config
        default_path = Path(config.downloads_path) / result.filename

        save_path, _ = QFileDialog.getSaveFileName(
            self,
            _("common.save"),
            str(default_path),
            f"Audio Files (*{result.file_type})"
        )

        if not save_path:
            return

        # Download file
        self.status_message.emit(_("search.messages.downloading", filename=result.filename), False)

        success = self.search_manager.download_cloud_file(result, Path(save_path))

        if success:
            self.status_message.emit(_("search.messages.downloaded", path=save_path), False)
        else:
            self.status_message.emit(_("search.messages.download_failed"), True)

    def _index_local_files(self):
        """Index local audio files"""
        # Ask user to select directories
        dialog = QFileDialog()
        dialog.setFileMode(QFileDialog.FileMode.Directory)
        dialog.setOption(QFileDialog.Option.ShowDirsOnly, True)

        directories = []
        if dialog.exec():
            directories = [Path(d) for d in dialog.selectedFiles()]

        if not directories:
            # Use defaults
            directories = self.search_manager.local.get_default_music_directories()

        if not directories:
            self.status_message.emit(_("search.messages.indexing_error", error="No directories selected"), True)
            return

        # Show indexing state
        self.index_button.setEnabled(False)
        self.index_button.setText(_("search.messages.indexing"))
        self.status_message.emit(_("search.messages.indexing"), False)

        # Start indexing in background
        self.index_worker = IndexWorker(self.search_manager, directories)
        self.index_worker.indexing_complete.connect(self._on_indexing_complete)
        self.index_worker.error.connect(self._on_indexing_error)
        self.index_worker.start()

    def _on_indexing_complete(self, count: int):
        """Handle indexing completion"""
        self.index_button.setEnabled(True)
        self.index_button.setText(_("search.index_button"))
        self.status_message.emit(_("search.messages.indexed", count=count), False)
        self._update_source_status()

    def _on_indexing_error(self, error_msg: str):
        """Handle indexing error"""
        self.index_button.setEnabled(True)
        self.index_button.setText(_("search.index_button"))
        self.status_message.emit(_("search.messages.indexing_error", error=error_msg), True)

    def _connect_gdrive(self):
        """Connect to Google Drive"""
        if self.search_manager.gdrive.is_authenticated():
            # Already connected, offer to disconnect
            reply = QMessageBox.question(
                self,
                _("search.disconnect_button") + " Google Drive",
                "Do you want to disconnect from Google Drive?",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
            )
            if reply == QMessageBox.StandardButton.Yes:
                self.search_manager.disconnect_gdrive()
                self._update_source_status()
                self.status_message.emit(_("search.messages.disconnected_google"), False)
            return

        # Check if client_secrets.json exists
        from pathlib import Path
        if not Path('client_secrets.json').exists():
            # Show setup instructions
            QMessageBox.information(
                self,
                "Google Drive Setup Required",
                "Google Drive integration requires a one-time developer setup:\n\n"
                "1. Go to https://console.cloud.google.com\n"
                "2. Create a project and enable Google Drive API\n"
                "3. Create OAuth 2.0 credentials (Desktop app)\n"
                "4. Download client_secrets.json to app directory\n\n"
                "For now, you can use Local Search and Dropbox!\n\n"
                "This feature will be fully automated in a future update."
            )
            return

        # Authenticate
        self.status_message.emit(_("search.messages.authenticating_google"), False)
        success = self.search_manager.authenticate_gdrive()

        if success:
            self.status_message.emit(_("search.messages.connected_google"), False)
            self._update_source_status()
        else:
            self.status_message.emit(_("search.messages.failed_google"), True)

    def _connect_dropbox(self):
        """Connect to Dropbox"""
        if self.search_manager.dropbox.is_authenticated():
            # Already connected, offer to disconnect
            reply = QMessageBox.question(
                self,
                _("search.disconnect_button") + " Dropbox",
                "Do you want to disconnect from Dropbox?",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
            )
            if reply == QMessageBox.StandardButton.Yes:
                self.search_manager.disconnect_dropbox()
                self._update_source_status()
                self.status_message.emit(_("search.messages.disconnected_dropbox"), False)
            return

        # Get access token from user
        from PySide6.QtWidgets import QInputDialog
        token, ok = QInputDialog.getText(
            self,
            "Dropbox Access Token",
            "Enter your Dropbox access token:\n(Get it from https://www.dropbox.com/developers/apps)",
            QLineEdit.EchoMode.Normal
        )

        if not ok or not token:
            return

        # Authenticate
        self.status_message.emit(_("search.messages.authenticating_dropbox"), False)
        success = self.search_manager.authenticate_dropbox(token.strip())

        if success:
            self.status_message.emit(_("search.messages.connected_dropbox"), False)
            self._update_source_status()
        else:
            self.status_message.emit(_("search.messages.failed_dropbox"), True)

    def _update_source_status(self):
        """Update source connection status labels"""
        status = self.search_manager.get_sources_status()

        # Local status
        if status.get('local', {}).get('connected'):
            files = status['local'].get('files_indexed', 0)
            self.local_status.setText(_("search.local_indexed", count=files))
            self.local_status.setStyleSheet("color: #2ecc71; font-size: 12px;")
            self.index_button.setText(_("search.index_button"))
        else:
            self.local_status.setText(_("search.local_not_indexed"))
            self.local_status.setStyleSheet("color: #a0a0a0; font-size: 12px;")

        # Google Drive status
        if status.get('gdrive', {}).get('connected'):
            self.gdrive_status.setText(_("search.google_drive_connected") + " ✓")
            self.gdrive_status.setStyleSheet("color: #2ecc71; font-size: 12px;")
            self.gdrive_button.setText(_("search.disconnect_button"))
        else:
            self.gdrive_status.setText(_("search.google_drive_not_connected"))
            self.gdrive_status.setStyleSheet("color: #a0a0a0; font-size: 12px;")
            self.gdrive_button.setText(_("search.connect_button"))

        # Dropbox status
        if status.get('dropbox', {}).get('connected'):
            self.dropbox_status.setText(_("search.dropbox_connected") + " ✓")
            self.dropbox_status.setStyleSheet("color: #2ecc71; font-size: 12px;")
            self.dropbox_button.setText(_("search.disconnect_button"))
        else:
            self.dropbox_status.setText(_("search.dropbox_not_connected"))
            self.dropbox_status.setStyleSheet("color: #a0a0a0; font-size: 12px;")
            self.dropbox_button.setText(_("search.connect_button"))

    def retranslate_ui(self):
        """Update all UI text to the current language"""
        # Update labels
        self.search_label.setText(_("search.title"))
        self.subtitle.setText(_("search.subtitle"))
        self.results_label.setText(_("search.results_title"))

        # Update search input placeholder
        self.search_input.setPlaceholderText(_("search.search_placeholder"))

        # Update buttons
        self.open_button.setText(_("search.open_button"))
        self.download_button.setText(_("search.download_button"))

        # Update table headers
        self.results_table.setHorizontalHeaderLabels([
            _("search.table.source"),
            _("search.table.filename"),
            _("search.table.artist_title"),
            _("search.table.size"),
            _("search.table.modified")
        ])

        # Update source status and buttons
        self._update_source_status()

        # Update results count if there are results
        if hasattr(self, 'current_results'):
            count = len(self.current_results)
            self.results_count_label.setText(_("search.results_count", count=count))
