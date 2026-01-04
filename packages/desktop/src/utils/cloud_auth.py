"""Cloud storage authentication handlers for Google Drive and Dropbox."""
import json
import pickle
from pathlib import Path
from typing import Optional

# Google Drive imports
try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    GOOGLE_AVAILABLE = True
except ImportError:
    GOOGLE_AVAILABLE = False

# Dropbox imports
try:
    import dropbox
    from dropbox import DropboxOAuth2FlowNoRedirect
    DROPBOX_AVAILABLE = True
except ImportError:
    DROPBOX_AVAILABLE = False


class GoogleDriveAuth:
    """Handle Google Drive OAuth authentication."""

    SCOPES = ['https://www.googleapis.com/auth/drive.file']
    TOKEN_FILE = Path.home() / '.hasod_downloads' / 'gdrive_token.pickle'
    CREDENTIALS_FILE = Path.home() / '.hasod_downloads' / 'gdrive_credentials.json'

    def __init__(self):
        self.creds = None
        self.service = None
        self._load_credentials()

    def _load_credentials(self):
        """Load saved credentials if they exist."""
        if self.TOKEN_FILE.exists():
            try:
                with open(self.TOKEN_FILE, 'rb') as token:
                    self.creds = pickle.load(token)
            except Exception as e:
                print(f"[ERROR] Failed to load Google Drive credentials: {e}")

    def is_authenticated(self) -> bool:
        """Check if user is authenticated."""
        if not self.creds:
            return False

        # Check if credentials are valid
        if self.creds.expired and self.creds.refresh_token:
            try:
                self.creds.refresh(Request())
                self._save_credentials()
                return True
            except:
                return False

        return self.creds.valid

    def login(self):
        """
        Initiate OAuth flow and authenticate user.

        Returns:
            Tuple of (success, message/error)
        """
        if not GOOGLE_AVAILABLE:
            return False, "Google API libraries not installed"

        try:
            # Check if credentials file exists
            if not self.CREDENTIALS_FILE.exists():
                return False, f"Please place your Google OAuth credentials file at: {self.CREDENTIALS_FILE}"

            # Run OAuth flow
            flow = InstalledAppFlow.from_client_secrets_file(
                str(self.CREDENTIALS_FILE),
                self.SCOPES
            )
            self.creds = flow.run_local_server(port=0)

            # Save credentials
            self._save_credentials()

            return True, "Successfully authenticated with Google Drive"

        except Exception as e:
            return False, f"Authentication failed: {str(e)}"

    def logout(self):
        """Remove saved credentials."""
        if self.TOKEN_FILE.exists():
            self.TOKEN_FILE.unlink()
        self.creds = None
        self.service = None

    def _save_credentials(self):
        """Save credentials to file."""
        self.TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(self.TOKEN_FILE, 'wb') as token:
            pickle.dump(self.creds, token)

    def get_service(self):
        """Get Google Drive API service."""
        if not self.is_authenticated():
            return None

        if not self.service:
            self.service = build('drive', 'v3', credentials=self.creds)

        return self.service


class DropboxAuth:
    """Handle Dropbox OAuth authentication."""

    TOKEN_FILE = Path.home() / '.hasod_downloads' / 'dropbox_token.json'
    APP_KEY = None  # User will need to provide this
    APP_SECRET = None  # User will need to provide this

    def __init__(self):
        self.access_token = None
        self._load_token()

    def _load_token(self):
        """Load saved access token if it exists."""
        if self.TOKEN_FILE.exists():
            try:
                with open(self.TOKEN_FILE, 'r') as f:
                    data = json.load(f)
                    self.access_token = data.get('access_token')
            except Exception as e:
                print(f"[ERROR] Failed to load Dropbox token: {e}")

    def is_authenticated(self) -> bool:
        """Check if user is authenticated."""
        return self.access_token is not None

    def login(self, app_key: str, app_secret: str):
        """
        Initiate OAuth flow and authenticate user.

        Args:
            app_key: Dropbox app key
            app_secret: Dropbox app secret

        Returns:
            Tuple of (success, auth_url_or_error)
        """
        if not DROPBOX_AVAILABLE:
            return False, "Dropbox library not installed"

        try:
            self.APP_KEY = app_key
            self.APP_SECRET = app_secret

            # Start OAuth flow
            auth_flow = DropboxOAuth2FlowNoRedirect(
                app_key,
                app_secret,
                token_access_type='offline'
            )

            authorize_url = auth_flow.start()
            return True, authorize_url

        except Exception as e:
            return False, f"Authentication failed: {str(e)}"

    def complete_login(self, auth_code: str, app_key: str, app_secret: str):
        """
        Complete OAuth flow with authorization code.

        Args:
            auth_code: Authorization code from user
            app_key: Dropbox app key
            app_secret: Dropbox app secret

        Returns:
            Tuple of (success, message)
        """
        try:
            auth_flow = DropboxOAuth2FlowNoRedirect(app_key, app_secret)
            oauth_result = auth_flow.finish(auth_code)
            self.access_token = oauth_result.access_token

            # Save token
            self._save_token()

            return True, "Successfully authenticated with Dropbox"

        except Exception as e:
            return False, f"Authentication failed: {str(e)}"

    def logout(self):
        """Remove saved access token."""
        if self.TOKEN_FILE.exists():
            self.TOKEN_FILE.unlink()
        self.access_token = None

    def _save_token(self):
        """Save access token to file."""
        self.TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(self.TOKEN_FILE, 'w') as f:
            json.dump({'access_token': self.access_token}, f)

    def get_client(self):
        """Get Dropbox client."""
        if not self.is_authenticated():
            return None

        return dropbox.Dropbox(self.access_token)
