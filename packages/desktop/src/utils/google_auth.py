"""
Shared Google OAuth authentication utility
"""
from pathlib import Path
from typing import Optional
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
import logging
import json

logger = logging.getLogger(__name__)

# OAuth scopes
SCOPES = [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'openid'
]


class GoogleAuthManager:
    """Manages Google OAuth authentication"""

    def __init__(self, token_path: Path = None, credentials_path: Path = None):
        """
        Initialize Google Auth Manager

        Args:
            token_path: Path to save OAuth token
            credentials_path: Path to client_secrets.json
        """
        if token_path is None:
            token_path = Path.home() / '.hasod_downloads' / 'google_token.json'

        if credentials_path is None:
            credentials_path = Path('client_secrets.json')

        self.token_path = token_path
        self.credentials_path = credentials_path
        self.token_path.parent.mkdir(parents=True, exist_ok=True)

        self.creds = None
        self._user_email = None

    def authenticate(self) -> bool:
        """
        Authenticate with Google using OAuth 2.0

        Returns:
            bool: True if successful
        """
        try:
            # Check if credentials file exists
            if not self.credentials_path.exists():
                logger.error(f"Credentials file not found: {self.credentials_path}")
                return False

            # Load existing token if available
            if self.token_path.exists():
                self.creds = Credentials.from_authorized_user_file(str(self.token_path), SCOPES)

            # If no valid credentials, authenticate
            if not self.creds or not self.creds.valid:
                if self.creds and self.creds.expired and self.creds.refresh_token:
                    # Refresh expired token
                    self.creds.refresh(Request())
                else:
                    # New authentication flow
                    flow = InstalledAppFlow.from_client_secrets_file(
                        str(self.credentials_path), SCOPES)
                    self.creds = flow.run_local_server(port=0)

                # Save credentials for future use
                self._save_credentials()

            # Get user email
            self._user_email = self._get_user_email()

            logger.info(f"Successfully authenticated as {self._user_email}")
            return True

        except Exception as e:
            logger.error(f"Error authenticating with Google: {e}")
            return False

    def _save_credentials(self):
        """Save credentials to file"""
        try:
            with open(self.token_path, 'w') as token:
                token.write(self.creds.to_json())
        except Exception as e:
            logger.error(f"Error saving credentials: {e}")

    def _get_user_email(self) -> str:
        """
        Get user email from OAuth token

        Returns:
            str: User email or None
        """
        try:
            # Load token data to get email
            if self.token_path.exists():
                with open(self.token_path, 'r') as f:
                    token_data = json.load(f)
                    # Try to get email from token data
                    if 'email' in token_data:
                        return token_data['email']

            # If not in token, get from Google UserInfo API
            if self.creds:
                from googleapiclient.discovery import build
                service = build('oauth2', 'v2', credentials=self.creds)
                user_info = service.userinfo().get().execute()
                email = user_info.get('email')

                # Save email to token file for future use
                if email and self.token_path.exists():
                    with open(self.token_path, 'r') as f:
                        token_data = json.load(f)
                    token_data['email'] = email
                    with open(self.token_path, 'w') as f:
                        json.dump(token_data, f, indent=2)

                return email

        except Exception as e:
            logger.error(f"Error getting user email: {e}")

        return None

    def is_authenticated(self) -> bool:
        """Check if user is authenticated"""
        if not self.token_path.exists():
            return False

        try:
            self.creds = Credentials.from_authorized_user_file(str(self.token_path), SCOPES)
            if self.creds and self.creds.valid:
                self._user_email = self._get_user_email()
                return True
        except Exception as e:
            logger.error(f"Error checking authentication: {e}")

        return False

    def get_user_email(self) -> Optional[str]:
        """
        Get authenticated user's email

        Returns:
            str: Email or None if not authenticated
        """
        if not self._user_email and self.is_authenticated():
            self._user_email = self._get_user_email()
        return self._user_email

    def logout(self):
        """Logout and remove stored credentials"""
        try:
            if self.token_path.exists():
                self.token_path.unlink()
            self.creds = None
            self._user_email = None
            return True
        except Exception as e:
            logger.error(f"Error logging out: {e}")
            return False


# Singleton instance
_google_auth = None


def get_google_auth() -> GoogleAuthManager:
    """Get or create Google auth manager singleton"""
    global _google_auth
    if _google_auth is None:
        _google_auth = GoogleAuthManager()
    return _google_auth
