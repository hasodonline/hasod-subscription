"""Settings dialog for Hasod Downloads."""
from pathlib import Path
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QCheckBox,
    QPushButton, QFileDialog, QLineEdit, QComboBox
)
from PySide6.QtCore import Qt, Signal
from ..utils.config import config
from ..utils.i18n import translator, _


class SettingsDialog(QDialog):
    """Settings dialog window."""

    language_changed = Signal(str)  # Emitted when language changes

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle(_("settings.title"))
        self.setMinimumWidth(500)
        self.setModal(True)

        # Apply dark theme
        self.setStyleSheet("""
            QDialog {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                                           stop:0 #1a1a2e, stop:1 #16213e);
                color: #ffffff;
            }
            QLabel {
                color: #ffffff;
                font-size: 13px;
            }
            QLabel#sectionLabel {
                color: #3B8ED0;
                font-size: 16px;
                font-weight: bold;
                padding: 10px 0;
            }
            QCheckBox {
                color: #ffffff;
                font-size: 13px;
                spacing: 8px;
            }
            QCheckBox::indicator {
                width: 20px;
                height: 20px;
                border-radius: 4px;
                border: 2px solid #3B8ED0;
                background: rgba(255, 255, 255, 0.05);
            }
            QCheckBox::indicator:checked {
                background: #3B8ED0;
                border: 2px solid #3B8ED0;
            }
            QLineEdit {
                background: rgba(255, 255, 255, 0.05);
                border: 2px solid rgba(59, 142, 208, 0.3);
                border-radius: 8px;
                color: #ffffff;
                padding: 8px 12px;
                font-size: 13px;
            }
            QLineEdit:focus {
                border: 2px solid #3B8ED0;
            }
            QComboBox {
                background: rgba(255, 255, 255, 0.05);
                border: 2px solid rgba(59, 142, 208, 0.3);
                border-radius: 8px;
                color: #ffffff;
                padding: 8px 12px;
                font-size: 13px;
                min-width: 200px;
            }
            QComboBox:focus {
                border: 2px solid #3B8ED0;
            }
            QComboBox::drop-down {
                border: none;
                width: 30px;
            }
            QComboBox::down-arrow {
                image: none;
                border-left: 5px solid transparent;
                border-right: 5px solid transparent;
                border-top: 5px solid #ffffff;
                margin-right: 10px;
            }
            QComboBox QAbstractItemView {
                background: #1a1a2e;
                border: 2px solid #3B8ED0;
                border-radius: 8px;
                color: #ffffff;
                selection-background-color: #3B8ED0;
                padding: 5px;
            }
            QPushButton {
                background: rgba(255, 255, 255, 0.05);
                color: #ffffff;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                padding: 8px 16px;
                font-size: 13px;
            }
            QPushButton:hover {
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
            }
            QPushButton#saveBtn {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                                           stop:0 #3B8ED0, stop:1 #1F6AA5);
                border: none;
                font-weight: bold;
            }
            QPushButton#saveBtn:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                                           stop:0 #36719F, stop:1 #144870);
            }
        """)

        self._setup_ui()
        self._load_settings()

    def _setup_ui(self):
        """Setup the UI."""
        layout = QVBoxLayout(self)
        layout.setSpacing(20)
        layout.setContentsMargins(30, 30, 30, 30)

        # Language section
        self.language_label = QLabel(_("settings.language_section"))
        self.language_label.setObjectName("sectionLabel")
        layout.addWidget(self.language_label)

        language_layout = QHBoxLayout()
        language_select_label = QLabel(_("settings.language_label"))
        language_layout.addWidget(language_select_label)

        self.language_combo = QComboBox()
        # Populate with available languages
        available_languages = translator.get_available_languages()
        for lang_code, lang_info in available_languages.items():
            # Display both native name and English name
            display_name = f"{lang_info['native_name']} ({lang_info['name']})"
            self.language_combo.addItem(display_name, lang_code)

        language_layout.addWidget(self.language_combo)
        language_layout.addStretch()
        layout.addLayout(language_layout)

        self.language_note = QLabel(_("settings.language_note"))
        self.language_note.setStyleSheet("color: #a0a0a0; font-size: 11px; padding-left: 0px;")
        self.language_note.setWordWrap(True)
        layout.addWidget(self.language_note)

        # Download location section
        self.location_label = QLabel(_("settings.download_location"))
        self.location_label.setObjectName("sectionLabel")
        layout.addWidget(self.location_label)

        location_layout = QHBoxLayout()
        self.location_input = QLineEdit()
        self.location_input.setReadOnly(True)
        location_layout.addWidget(self.location_input, stretch=1)

        self.browse_btn = QPushButton(_("common.browse"))
        self.browse_btn.clicked.connect(self._browse_folder)
        location_layout.addWidget(self.browse_btn)

        layout.addLayout(location_layout)

        # Transliteration section
        self.transliteration_label = QLabel(_("settings.transliteration_section"))
        self.transliteration_label.setObjectName("sectionLabel")
        layout.addWidget(self.transliteration_label)

        self.transliterate_checkbox = QCheckBox(_("settings.transliterate_hebrew"))
        self.transliterate_checkbox.setToolTip(
            "Automatically convert Hebrew characters in filenames to Latin alphabet using OpenAI"
        )
        layout.addWidget(self.transliterate_checkbox)

        self.transliterate_note = QLabel(_("settings.transliterate_note"))
        self.transliterate_note.setStyleSheet("color: #a0a0a0; font-size: 11px; padding-left: 28px;")
        self.transliterate_note.setWordWrap(True)
        layout.addWidget(self.transliterate_note)

        # Add stretch to push buttons to bottom
        layout.addStretch()

        # Buttons
        button_layout = QHBoxLayout()
        button_layout.addStretch()

        self.cancel_btn = QPushButton(_("common.cancel"))
        self.cancel_btn.clicked.connect(self.reject)
        button_layout.addWidget(self.cancel_btn)

        self.save_btn = QPushButton(_("common.save"))
        self.save_btn.setObjectName("saveBtn")
        self.save_btn.clicked.connect(self._save_settings)
        button_layout.addWidget(self.save_btn)

        layout.addLayout(button_layout)

    def _load_settings(self):
        """Load current settings."""
        # Load language setting
        current_lang = config.get('language', 'en_US')
        for i in range(self.language_combo.count()):
            if self.language_combo.itemData(i) == current_lang:
                self.language_combo.setCurrentIndex(i)
                break

        self.location_input.setText(str(config.downloads_path))
        self.transliterate_checkbox.setChecked(config.get('transliterate_hebrew', False))

    def _browse_folder(self):
        """Browse for download folder."""
        folder = QFileDialog.getExistingDirectory(
            self,
            _("settings.download_location"),
            str(config.downloads_path)
        )
        if folder:
            self.location_input.setText(folder)

    def _save_settings(self):
        """Save settings."""
        # Check if language changed
        new_language = self.language_combo.currentData()
        old_language = config.get('language', 'en_US')
        language_changed = new_language != old_language

        # Save language setting
        if language_changed:
            config.set('language', new_language)
            translator.set_language(new_language)
            # Emit signal so main window can update
            self.language_changed.emit(new_language)

        # Save download location
        new_path = Path(self.location_input.text())
        if new_path.exists():
            config.set('downloads_dir', str(new_path))

        # Save transliteration setting
        config.set('transliterate_hebrew', self.transliterate_checkbox.isChecked())

        # Save config to disk
        config.save_config()

        self.accept()

    def retranslate_ui(self):
        """Update all UI text to current language."""
        self.setWindowTitle(_("settings.title"))
        self.language_label.setText(_("settings.language_section"))
        self.language_note.setText(_("settings.language_note"))
        self.location_label.setText(_("settings.download_location"))
        self.browse_btn.setText(_("common.browse"))
        self.transliteration_label.setText(_("settings.transliteration_section"))
        self.transliterate_checkbox.setText(_("settings.transliterate_hebrew"))
        self.transliterate_note.setText(_("settings.transliterate_note"))
        self.cancel_btn.setText(_("common.cancel"))
        self.save_btn.setText(_("common.save"))

    def _gdrive_login(self):
        """Handle Google Drive login."""
        try:
            from ..utils.cloud_auth import GoogleDriveAuth
            auth = GoogleDriveAuth()
            success, message = auth.login()

            if success:
                QMessageBox.information(self, "Success", message)
                self._update_cloud_status()
            else:
                QMessageBox.warning(self, "Error", message)
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Login failed: {str(e)}")

    def _gdrive_logout(self):
        """Handle Google Drive logout."""
        try:
            from ..utils.cloud_auth import GoogleDriveAuth
            auth = GoogleDriveAuth()
            auth.logout()
            QMessageBox.information(self, "Success", "Disconnected from Google Drive")
            self._update_cloud_status()
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Logout failed: {str(e)}")

    def _dropbox_login(self):
        """Handle Dropbox login."""
        try:
            from ..utils.cloud_auth import DropboxAuth
            # Get app credentials from user
            app_key, ok = QInputDialog.getText(self, "Dropbox App Key", "Enter your Dropbox App Key:")
            if not ok or not app_key:
                return

            app_secret, ok = QInputDialog.getText(self, "Dropbox App Secret", "Enter your Dropbox App Secret:")
            if not ok or not app_secret:
                return

            auth = DropboxAuth()
            success, auth_url = auth.login(app_key, app_secret)

            if success:
                QMessageBox.information(self, "Authorization Required",
                                      f"Please visit this URL to authorize:\n\n{auth_url}\n\nThen paste the authorization code.")

                auth_code, ok = QInputDialog.getText(self, "Authorization Code", "Enter the authorization code:")
                if ok and auth_code:
                    success, message = auth.complete_login(auth_code, app_key, app_secret)
                    if success:
                        QMessageBox.information(self, "Success", message)
                        self._update_cloud_status()
                    else:
                        QMessageBox.warning(self, "Error", message)
            else:
                QMessageBox.warning(self, "Error", auth_url)
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Login failed: {str(e)}")

    def _dropbox_logout(self):
        """Handle Dropbox logout."""
        try:
            from ..utils.cloud_auth import DropboxAuth
            auth = DropboxAuth()
            auth.logout()
            QMessageBox.information(self, "Success", "Disconnected from Dropbox")
            self._update_cloud_status()
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Logout failed: {str(e)}")

    def _update_cloud_status(self):
        """Update cloud storage connection status."""
        try:
            from ..utils.cloud_auth import GoogleDriveAuth, DropboxAuth

            # Google Drive status
            gdrive = GoogleDriveAuth()
            if gdrive.is_authenticated():
                self.gdrive_status_label.setText("Google Drive: Connected ✓")
                self.gdrive_status_label.setStyleSheet("color: #2ecc71; font-size: 12px;")
                self.gdrive_login_btn.setVisible(False)
                self.gdrive_logout_btn.setVisible(True)
            else:
                self.gdrive_status_label.setText("Google Drive: Not connected")
                self.gdrive_status_label.setStyleSheet("color: #a0a0a0; font-size: 12px;")
                self.gdrive_login_btn.setVisible(True)
                self.gdrive_logout_btn.setVisible(False)

            # Dropbox status
            dropbox = DropboxAuth()
            if dropbox.is_authenticated():
                self.dropbox_status_label.setText("Dropbox: Connected ✓")
                self.dropbox_status_label.setStyleSheet("color: #2ecc71; font-size: 12px;")
                self.dropbox_login_btn.setVisible(False)
                self.dropbox_logout_btn.setVisible(True)
            else:
                self.dropbox_status_label.setText("Dropbox: Not connected")
                self.dropbox_status_label.setStyleSheet("color: #a0a0a0; font-size: 12px;")
                self.dropbox_login_btn.setVisible(True)
                self.dropbox_logout_btn.setVisible(False)
        except Exception as e:
            print(f"[ERROR] Failed to update cloud status: {e}")
