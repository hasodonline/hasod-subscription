"""
Hebrefy tab - Convert Hebrew filenames to transliterated English
"""
import os
from pathlib import Path
from typing import List, Tuple, Optional
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTreeView, QFileSystemModel, QMessageBox, QProgressDialog,
    QTextEdit, QDialog, QDialogButtonBox
)
from PySide6.QtCore import Qt, QDir, QThread, Signal
from PySide6.QtGui import QFont
import logging

from ..utils.transliterator import Transliterator
from ..utils.i18n import translator, _

logger = logging.getLogger(__name__)

# Global transliterator instance
transliterator = Transliterator()


class PreviewDialog(QDialog):
    """Dialog to preview and confirm file renaming"""

    def __init__(self, changes: List[Tuple[Path, str]], parent=None):
        super().__init__(parent)
        self.changes = changes
        self.setWindowTitle(_("hebrefy.confirm_title"))
        self.resize(700, 500)
        self._setup_ui()

    def _setup_ui(self):
        layout = QVBoxLayout(self)

        # Title
        self.title_label = QLabel(f"🔤 Hebrefy - Preview Changes ({len(self.changes)} files)")
        self.title_label.setFont(QFont("Arial", 16, QFont.Weight.Bold))
        self.title_label.setStyleSheet("color: #3B8ED0; padding: 10px;")
        layout.addWidget(self.title_label)

        # Info label
        self.info_label = QLabel(_("hebrefy.confirm_message"))
        self.info_label.setStyleSheet("color: #666; padding: 5px;")
        layout.addWidget(self.info_label)

        # Preview text
        self.preview_text = QTextEdit()
        self.preview_text.setReadOnly(True)
        self.preview_text.setStyleSheet("""
            QTextEdit {
                background: #f5f5f5;
                border: 1px solid #ddd;
                border-radius: 5px;
                padding: 10px;
                font-family: monospace;
                font-size: 12px;
            }
        """)

        # Build preview text
        preview_lines = []
        for old_path, new_name in self.changes:
            old_name = old_path.name
            preview_lines.append(f"📄 {old_name}")
            preview_lines.append(f"   → {new_name}")
            preview_lines.append("")

        self.preview_text.setPlainText("\n".join(preview_lines))
        layout.addWidget(self.preview_text)

        # Warning
        self.warning_label = QLabel(_("hebrefy.confirm_warning"))
        self.warning_label.setStyleSheet("color: #e74c3c; font-weight: bold; padding: 10px;")
        layout.addWidget(self.warning_label)

        # Buttons
        button_box = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
        )
        button_box.accepted.connect(self.accept)
        button_box.rejected.connect(self.reject)
        layout.addWidget(button_box)

    def retranslate_ui(self):
        """Update all UI text to current language"""
        self.setWindowTitle(_("hebrefy.confirm_title"))
        self.title_label.setText(f"🔤 Hebrefy - Preview Changes ({len(self.changes)} files)")
        self.info_label.setText(_("hebrefy.confirm_message"))
        self.warning_label.setText(_("hebrefy.confirm_warning"))


class HebrefyWorker(QThread):
    """Background thread for renaming files"""
    progress = Signal(int, int)  # current, total
    finished = Signal(int)  # number of files renamed
    error = Signal(str)

    def __init__(self, changes: List[Tuple[Path, str]]):
        super().__init__()
        self.changes = changes

    def run(self):
        """Execute renaming"""
        renamed_count = 0
        total = len(self.changes)

        for i, (old_path, new_name) in enumerate(self.changes):
            try:
                new_path = old_path.parent / new_name

                # Skip if target already exists
                if new_path.exists() and new_path != old_path:
                    logger.warning(f"Target already exists, skipping: {new_path}")
                    continue

                # Rename
                old_path.rename(new_path)
                renamed_count += 1
                self.progress.emit(i + 1, total)

            except Exception as e:
                logger.error(f"Error renaming {old_path}: {e}")

        self.finished.emit(renamed_count)


class HebrefyTab(QWidget):
    """Hebrefy tab - Convert Hebrew filenames to English transliteration"""

    status_message = Signal(str, bool)  # message, is_error

    def __init__(self, parent=None):
        super().__init__(parent)
        self._setup_ui()

        # Connect to language change signal
        translator.language_changed.connect(self.retranslate_ui)

    def _setup_ui(self):
        """Setup the Hebrefy tab UI"""
        layout = QVBoxLayout(self)
        layout.setSpacing(20)
        layout.setContentsMargins(30, 20, 30, 20)

        # Header
        self.header_label = QLabel(_("hebrefy.title"))
        self.header_label.setStyleSheet("color: #ffffff; font-size: 24px; font-weight: bold;")
        layout.addWidget(self.header_label)

        self.subtitle_label = QLabel(_("hebrefy.subtitle"))
        self.subtitle_label.setStyleSheet("color: #a0a0a0; font-size: 13px; padding-bottom: 10px;")
        layout.addWidget(self.subtitle_label)

        # Instructions
        instructions_text = (
            f"{_('hebrefy.instructions')}\n"
            f"• {_('hebrefy.instruction_file')}\n"
            f"• {_('hebrefy.instruction_folder')}"
        )
        self.instructions_label = QLabel(instructions_text)
        self.instructions_label.setStyleSheet("color: #a0a0a0; font-size: 12px; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 5px;")
        layout.addWidget(self.instructions_label)

        # File browser
        self.browser_label = QLabel(_("hebrefy.file_browser"))
        self.browser_label.setStyleSheet("color: #ffffff; font-size: 16px; font-weight: bold; padding: 10px 0;")
        layout.addWidget(self.browser_label)

        # Create file system model
        self.file_model = QFileSystemModel()
        self.file_model.setRootPath(QDir.rootPath())
        self.file_model.setFilter(QDir.Filter.AllDirs | QDir.Filter.Files | QDir.Filter.NoDotAndDotDot)

        # Create tree view
        self.tree_view = QTreeView()
        self.tree_view.setModel(self.file_model)
        self.tree_view.setRootIndex(self.file_model.index(str(Path.home())))
        self.tree_view.setColumnWidth(0, 300)
        self.tree_view.setStyleSheet("""
            QTreeView {
                background: rgba(255, 255, 255, 0.02);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 8px;
                color: #ffffff;
            }
            QTreeView::item {
                padding: 5px;
            }
            QTreeView::item:selected {
                background: rgba(59, 142, 208, 0.3);
            }
            QTreeView::item:hover {
                background: rgba(255, 255, 255, 0.05);
            }
            QHeaderView::section {
                background: rgba(255, 255, 255, 0.05);
                color: #a0a0a0;
                padding: 8px;
                border: none;
            }
        """)
        layout.addWidget(self.tree_view, stretch=1)

        # Action buttons
        button_layout = QHBoxLayout()

        self.hebrefy_button = QPushButton(_("hebrefy.hebrefy_button"))
        self.hebrefy_button.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                                           stop:0 #3B8ED0, stop:1 #1F6AA5);
                color: white;
                border: none;
                border-radius: 8px;
                padding: 12px 24px;
                font-size: 14px;
                font-weight: bold;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                                           stop:0 #36719F, stop:1 #144870);
            }
            QPushButton:pressed {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                                           stop:0 #2d5a7f, stop:1 #103850);
            }
        """)
        self.hebrefy_button.clicked.connect(self._hebrefy_selected)
        button_layout.addWidget(self.hebrefy_button)

        button_layout.addStretch()

        layout.addLayout(button_layout)

    def _has_hebrew(self, text: str) -> bool:
        """Check if text contains Hebrew characters"""
        return any('\u0590' <= char <= '\u05FF' for char in text)

    def _collect_files_to_rename(self, path: Path) -> List[Tuple[Path, str]]:
        """
        Collect all files/folders that need renaming
        Returns list of (old_path, new_name) tuples
        """
        changes = []

        if path.is_file():
            # Single file
            if self._has_hebrew(path.name):
                new_name = transliterator.transliterate(path.name)
                if new_name != path.name:
                    changes.append((path, new_name))

        elif path.is_dir():
            # Directory - recursively process all files and subdirectories
            for root, dirs, files in os.walk(path, topdown=False):
                root_path = Path(root)

                # Process files first
                for filename in files:
                    if self._has_hebrew(filename):
                        file_path = root_path / filename
                        new_name = transliterator.transliterate(filename)
                        if new_name != filename:
                            changes.append((file_path, new_name))

                # Process directories (topdown=False so we do deepest first)
                for dirname in dirs:
                    if self._has_hebrew(dirname):
                        dir_path = root_path / dirname
                        new_name = transliterator.transliterate(dirname)
                        if new_name != dirname:
                            changes.append((dir_path, new_name))

        return changes

    def _hebrefy_selected(self):
        """Hebrefy the selected file or directory"""
        # Get selected path
        indexes = self.tree_view.selectedIndexes()
        if not indexes:
            QMessageBox.warning(
                self,
                _("hebrefy.messages.no_selection_title"),
                _("hebrefy.messages.no_selection_message")
            )
            return

        # Get the path from the first selected index
        index = indexes[0]
        path = Path(self.file_model.filePath(index))

        if not path.exists():
            QMessageBox.warning(
                self,
                _("hebrefy.messages.invalid_path_title"),
                _("hebrefy.messages.invalid_path_message")
            )
            return

        self._process_path(path)

    def _process_path(self, path: Path):
        """Process a path (file or directory) for Hebrefy - can be called externally"""
        # Show processing message
        analyzing_msg = _("hebrefy.messages.analyzing").format(name=path.name)
        self.status_message.emit(analyzing_msg, False)

        # Collect files that need renaming
        changes = self._collect_files_to_rename(path)

        if not changes:
            QMessageBox.information(
                self,
                _("hebrefy.messages.no_changes_title"),
                _("hebrefy.messages.no_changes_message")
            )
            self.status_message.emit(_("hebrefy.messages.no_hebrew"), False)
            return

        # Show preview dialog
        preview_dialog = PreviewDialog(changes, self)
        if preview_dialog.exec() != QDialog.DialogCode.Accepted:
            self.status_message.emit(_("hebrefy.messages.cancelled"), False)
            return

        # Execute renaming
        self._execute_renaming(changes)

    def _execute_renaming(self, changes: List[Tuple[Path, str]]):
        """Execute the file renaming with progress dialog"""
        # Create progress dialog
        progress = QProgressDialog(
            _("hebrefy.progress_message"),
            _("common.cancel"),
            0,
            len(changes),
            self
        )
        progress.setWindowTitle(_("hebrefy.progress_title"))
        progress.setWindowModality(Qt.WindowModality.WindowModal)
        progress.setMinimumDuration(0)

        # Create worker thread
        self.hebrefy_worker = HebrefyWorker(changes)
        self.hebrefy_worker.progress.connect(lambda cur, total: progress.setValue(cur))
        self.hebrefy_worker.finished.connect(lambda count: self._on_hebrefy_complete(count, progress))
        self.hebrefy_worker.error.connect(lambda err: self._on_hebrefy_error(err, progress))

        # Start renaming
        self.hebrefy_worker.start()

    def _on_hebrefy_complete(self, count: int, progress_dialog):
        """Handle completion of Hebrefy operation"""
        progress_dialog.close()
        complete_msg = _("hebrefy.complete_message").format(count=count)
        QMessageBox.information(
            self,
            _("hebrefy.complete_title"),
            complete_msg
        )
        hebrefied_msg = _("hebrefy.messages.hebrefied").format(count=count)
        self.status_message.emit(hebrefied_msg, False)

        # Refresh the file browser
        self.file_model.setRootPath(QDir.rootPath())

    def _on_hebrefy_error(self, error_msg: str, progress_dialog):
        """Handle Hebrefy error"""
        progress_dialog.close()
        error_title = _("hebrefy.messages.error").format(error=error_msg)
        QMessageBox.critical(
            self,
            error_title,
            f"An error occurred during renaming:\n{error_msg}"
        )
        self.status_message.emit(error_title, True)

    def retranslate_ui(self):
        """Update all UI text to current language"""
        self.header_label.setText(_("hebrefy.title"))
        self.subtitle_label.setText(_("hebrefy.subtitle"))

        instructions_text = (
            f"{_('hebrefy.instructions')}\n"
            f"• {_('hebrefy.instruction_file')}\n"
            f"• {_('hebrefy.instruction_folder')}"
        )
        self.instructions_label.setText(instructions_text)

        self.browser_label.setText(_("hebrefy.file_browser"))
        self.hebrefy_button.setText(_("hebrefy.hebrefy_button"))
