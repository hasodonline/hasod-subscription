"""
License Tab for Hasod Downloads
Shows license status and registration options
"""
from PySide6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel,
                                QPushButton, QTextEdit, QFrame, QMessageBox)
from PySide6.QtCore import Qt, QThread, Signal, QUrl
from PySide6.QtGui import QFont, QDesktopServices
import webbrowser
from pathlib import Path
from src.utils.license_manager import get_license_manager
from src.utils.google_auth import get_google_auth
from src.utils.i18n import translator, _


class LicenseCheckThread(QThread):
    """Thread for checking license status"""
    result_ready = Signal(dict)

    def __init__(self, license_manager, user_email=None):
        super().__init__()
        self.license_manager = license_manager
        self.user_email = user_email

    def run(self):
        """Check license in background"""
        result = self.license_manager.check_license(self.user_email)
        self.result_ready.emit(result)


class LicenseTab(QWidget):
    """License management tab"""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.license_manager = get_license_manager()
        self.google_auth = get_google_auth()
        self.license_status = None
        self.check_thread = None
        self.user_email = None
        self.init_ui()
        self._check_google_auth()
        self.check_license_status()

    def init_ui(self):
        """Initialize the user interface"""
        layout = QVBoxLayout()
        layout.setContentsMargins(20, 20, 20, 20)
        layout.setSpacing(15)

        # Title
        self.title_label = QLabel(_("license.title"))
        title_font = QFont()
        title_font.setPointSize(18)
        title_font.setBold(True)
        self.title_label.setFont(title_font)
        self.title_label.setStyleSheet("color: #ffffff;")
        layout.addWidget(self.title_label)

        # Google Account section
        google_frame = QFrame()
        google_frame.setStyleSheet("""
            QFrame {
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 10px;
                padding: 15px;
            }
        """)
        google_layout = QVBoxLayout()

        google_title = QLabel(_("license.google_account"))
        google_title.setStyleSheet("color: #ffffff; font-weight: bold; font-size: 13px;")
        google_layout.addWidget(google_title)

        # Email display
        self.email_label = QLabel(_("license.not_logged_in"))
        self.email_label.setStyleSheet("color: #a0a0a0; padding: 5px 0;")
        google_layout.addWidget(self.email_label)

        # Google login/logout button
        google_btn_layout = QHBoxLayout()
        self.google_btn = QPushButton(_("license.login_google"))
        self.google_btn.clicked.connect(self._handle_google_auth)
        self.google_btn.setMinimumHeight(35)
        self.google_btn.setStyleSheet("""
            QPushButton {
                background: #4285F4;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 13px;
                font-weight: bold;
                padding: 8px 16px;
            }
            QPushButton:hover {
                background: #357ae8;
            }
        """)
        google_btn_layout.addWidget(self.google_btn)
        google_btn_layout.addStretch()
        google_layout.addLayout(google_btn_layout)

        google_frame.setLayout(google_layout)
        layout.addWidget(google_frame)

        # Status frame
        self.status_frame = QFrame()
        self.status_frame.setFrameShape(QFrame.StyledPanel)
        self.status_frame.setStyleSheet("""
            QFrame {
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 10px;
                padding: 15px;
            }
        """)
        status_layout = QVBoxLayout()

        # Status label
        self.status_label = QLabel(_("license.checking"))
        status_font = QFont()
        status_font.setPointSize(14)
        self.status_label.setFont(status_font)
        self.status_label.setStyleSheet("color: #ffffff;")
        status_layout.addWidget(self.status_label)

        # Status details
        self.status_details = QLabel("")
        self.status_details.setWordWrap(True)
        self.status_details.setStyleSheet("color: #a0a0a0;")
        status_layout.addWidget(self.status_details)

        self.status_frame.setLayout(status_layout)
        layout.addWidget(self.status_frame)

        # Device UUID section
        uuid_layout = QHBoxLayout()
        self.uuid_label = QLabel(_("license.device_id"))
        self.uuid_label.setStyleSheet("font-weight: bold; color: #ffffff;")
        uuid_layout.addWidget(self.uuid_label)

        self.uuid_display = QLabel(self.license_manager.get_device_uuid())
        self.uuid_display.setTextInteractionFlags(Qt.TextSelectableByMouse)
        self.uuid_display.setStyleSheet("color: #3B8ED0; font-family: monospace;")
        uuid_layout.addWidget(self.uuid_display)

        self.copy_uuid_btn = QPushButton(_("license.copy_id"))
        self.copy_uuid_btn.clicked.connect(self.copy_uuid)
        self.copy_uuid_btn.setStyleSheet("""
            QPushButton {
                background: rgba(255, 255, 255, 0.05);
                color: #ffffff;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                padding: 6px 12px;
            }
            QPushButton:hover {
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
            }
        """)
        uuid_layout.addWidget(self.copy_uuid_btn)

        uuid_layout.addStretch()
        layout.addLayout(uuid_layout)

        # Action buttons
        button_layout = QHBoxLayout()

        self.register_btn = QPushButton(_("license.register_button"))
        self.register_btn.clicked.connect(self.open_registration)
        self.register_btn.setMinimumHeight(40)
        self.register_btn.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                                           stop:0 #3B8ED0, stop:1 #1F6AA5);
                color: white;
                border: none;
                border-radius: 10px;
                font-size: 14px;
                font-weight: bold;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                                           stop:0 #36719F, stop:1 #144870);
            }
            QPushButton:disabled {
                background: rgba(100, 100, 100, 0.3);
                color: #606060;
            }
        """)
        button_layout.addWidget(self.register_btn)

        self.refresh_btn = QPushButton(_("license.refresh_button"))
        self.refresh_btn.clicked.connect(self.check_license_status)
        self.refresh_btn.setMinimumHeight(40)
        self.refresh_btn.setStyleSheet("""
            QPushButton {
                background: rgba(255, 255, 255, 0.05);
                color: #ffffff;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 10px;
                font-size: 14px;
            }
            QPushButton:hover {
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
            }
        """)
        button_layout.addWidget(self.refresh_btn)

        layout.addLayout(button_layout)

        # Information section
        self.info_text = QTextEdit()
        self.info_text.setReadOnly(True)
        self.info_text.setMaximumHeight(150)
        self.info_text.setStyleSheet("""
            QTextEdit {
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 10px;
                color: #a0a0a0;
                padding: 10px;
            }
        """)
        self._update_info_text()
        layout.addWidget(self.info_text)

        layout.addStretch()
        self.setLayout(layout)

        # Connect to language change signal
        translator.language_changed.connect(self._on_language_changed)

    def _check_google_auth(self):
        """Check if user is already logged in with Google"""
        if self.google_auth.is_authenticated():
            self.user_email = self.google_auth.get_user_email()
            self._update_google_ui(authenticated=True)

    def _handle_google_auth(self):
        """Handle Google login/logout"""
        if self.google_auth.is_authenticated():
            # Logout
            reply = QMessageBox.question(
                self,
                _("license.logout_title"),
                _("license.logout_message"),
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
            )
            if reply == QMessageBox.StandardButton.Yes:
                if self.google_auth.logout():
                    self.user_email = None
                    self._update_google_ui(authenticated=False)
                    self.check_license_status()  # Recheck license
        else:
            # Login
            self.google_btn.setEnabled(False)
            self.google_btn.setText(_("license.logging_in"))

            # Check if client_secrets.json exists
            if not Path('client_secrets.json').exists():
                QMessageBox.information(
                    self,
                    _("license.setup_required_title"),
                    _("license.setup_required_message")
                )
                self.google_btn.setEnabled(True)
                self.google_btn.setText(_("license.login_google"))
                return

            # Authenticate
            if self.google_auth.authenticate():
                self.user_email = self.google_auth.get_user_email()
                self._update_google_ui(authenticated=True)
                self.check_license_status()  # Check license with email
            else:
                QMessageBox.warning(
                    self,
                    _("license.login_failed_title"),
                    _("license.login_failed_message")
                )
                self.google_btn.setEnabled(True)
                self.google_btn.setText(_("license.login_google"))

    def _update_google_ui(self, authenticated: bool):
        """Update UI based on Google auth status"""
        if authenticated and self.user_email:
            self.email_label.setText(f"✓ {self.user_email}")
            self.email_label.setStyleSheet("color: #2ecc71; font-weight: bold; padding: 5px 0;")
            self.google_btn.setText(_("license.logout_google"))
            self.google_btn.setEnabled(True)
        else:
            self.email_label.setText(_("license.not_logged_in"))
            self.email_label.setStyleSheet("color: #a0a0a0; padding: 5px 0;")
            self.google_btn.setText(_("license.login_google"))
            self.google_btn.setEnabled(True)

    def _update_info_text(self):
        """Update info text with current language"""
        self.info_text.setHtml(f"""
        <h3 style="color: #ffffff;">{_("license.info_title")}</h3>
        <p style="color: #a0a0a0;">{_("license.info_description")}</p>
        <p style="color: #a0a0a0;">{_("license.info_device_id")}</p>
        """)

    def _on_language_changed(self):
        """Handle language change"""
        self.title_label.setText(_("license.title"))
        self.uuid_label.setText(_("license.device_id"))
        self.copy_uuid_btn.setText(_("license.copy_id"))
        self.register_btn.setText(_("license.register_button") if self.register_btn.isEnabled() else _("license.active_button"))
        self.refresh_btn.setText(_("license.refresh_button"))
        self._update_info_text()

        # Update status if available
        if self.license_status:
            self.on_license_checked(self.license_status)

    def check_license_status(self):
        """Check license status with backend"""
        self.status_label.setText(_("license.checking"))
        self.status_details.setText("")
        self.refresh_btn.setEnabled(False)

        # Start background thread with email if logged in
        self.check_thread = LicenseCheckThread(self.license_manager, self.user_email)
        self.check_thread.result_ready.connect(self.on_license_checked)
        self.check_thread.start()

    def on_license_checked(self, result):
        """Handle license check result"""
        self.license_status = result
        self.refresh_btn.setEnabled(True)

        status = result.get('status')
        is_valid = result.get('is_valid', False)

        if status == 'registered' and is_valid:
            # Licensed
            self.status_label.setText(_("license.status.active"))
            self.status_label.setStyleSheet("color: #2ecc71; font-weight: bold;")

            email = result.get('email', 'N/A')
            expires_at = result.get('expires_at', _("license.never"))
            self.status_details.setText(_("license.status.registered_to", email=email, expires=expires_at))

            self.register_btn.setEnabled(False)
            self.register_btn.setText(_("license.active_button"))

        elif status == 'not_registered':
            # Not registered
            self.status_label.setText(_("license.status.not_registered"))
            self.status_label.setStyleSheet("color: #e74c3c; font-weight: bold;")
            self.status_details.setText(_("license.status.not_registered_details"))

            self.register_btn.setEnabled(True)
            self.register_btn.setText(_("license.register_button"))

        elif status == 'expired':
            # Expired
            self.status_label.setText(_("license.status.expired"))
            self.status_label.setStyleSheet("color: #f39c12; font-weight: bold;")
            self.status_details.setText(_("license.status.expired_details"))

            self.register_btn.setEnabled(True)
            self.register_btn.setText(_("license.renew_button"))

        elif status == 'suspended':
            # Suspended
            self.status_label.setText(_("license.status.suspended"))
            self.status_label.setStyleSheet("color: #e74c3c; font-weight: bold;")
            self.status_details.setText(_("license.status.suspended_details"))

            self.register_btn.setEnabled(False)

        else:
            # Error
            self.status_label.setText(_("license.status.error"))
            self.status_label.setStyleSheet("color: #f39c12; font-weight: bold;")
            error_msg = result.get('error', _("license.unknown_error"))
            self.status_details.setText(_("license.status.error_details", error=error_msg))

            self.register_btn.setEnabled(True)

    def copy_uuid(self):
        """Copy device UUID to clipboard"""
        from PySide6.QtWidgets import QApplication
        clipboard = QApplication.clipboard()
        clipboard.setText(self.license_manager.get_device_uuid())

        QMessageBox.information(self, _("license.copied_title"), _("license.copied_message"))

    def open_registration(self):
        """Open registration URL in browser"""
        registration_url = self.license_manager.get_registration_url()

        try:
            webbrowser.open(registration_url)
        except Exception as e:
            print(f"Error opening browser: {e}")
            QMessageBox.warning(
                self,
                _("license.browser_error_title"),
                _("license.browser_error_message", url=registration_url)
            )

    def is_licensed(self):
        """
        Check if the app is currently licensed

        Returns:
            bool: True if licensed, False otherwise
        """
        if self.license_status is None:
            # If status hasn't been checked yet, check it synchronously
            self.license_status = self.license_manager.check_license()

        return self.license_status.get('is_valid', False)
