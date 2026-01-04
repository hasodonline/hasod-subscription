"""
Google Drive search using official Google Drive API v3 with local metadata caching
"""
from pathlib import Path
from datetime import datetime
from typing import List, Optional
import logging
import json
import os.path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from tenacity import retry, stop_after_attempt, wait_exponential

from .models import SearchResult

logger = logging.getLogger(__name__)

# OAuth scopes - read-only access to Drive
SCOPES = ['https://www.googleapis.com/auth/drive.readonly']


class GDriveSearch:
    """Search Google Drive for audio files"""

    AUDIO_MIME_TYPES = [
        'audio/mpeg',       # MP3
        'audio/mp4',        # M4A
        'audio/x-m4a',      # M4A
        'audio/wav',        # WAV
        'audio/x-wav',      # WAV
        'audio/flac',       # FLAC
        'audio/x-flac',     # FLAC
        'audio/ogg',        # OGG
        'audio/aac',        # AAC
    ]

    def __init__(self, token_path: Optional[Path] = None, credentials_path: Optional[Path] = None):
        """Initialize Google Drive search"""
        if token_path is None:
            token_path = Path.home() / '.hasod_downloads' / 'gdrive_token.json'

        if credentials_path is None:
            credentials_path = Path('client_secrets.json')

        self.token_path = token_path
        self.credentials_path = credentials_path
        self.token_path.parent.mkdir(parents=True, exist_ok=True)

        self.service = None
        self.creds = None
        self._authenticated = False

    def authenticate(self) -> bool:
        """
        Authenticate with Google Drive using OAuth 2.0
        Returns True if successful
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
                with open(self.token_path, 'w') as token:
                    token.write(self.creds.to_json())

            # Build Drive service
            self.service = build('drive', 'v3', credentials=self.creds)
            self._authenticated = True
            logger.info("Successfully authenticated with Google Drive API v3")
            return True

        except Exception as e:
            logger.error(f"Error authenticating with Google Drive: {e}")
            self._authenticated = False
            return False

    def load_token(self) -> bool:
        """
        Load saved token and authenticate
        Returns True if successful
        """
        if not self.token_path.exists():
            return False

        return self.authenticate()

    def is_authenticated(self) -> bool:
        """Check if authenticated"""
        return self._authenticated

    def search(self, query: str, limit: int = 100) -> List[SearchResult]:
        """
        Search Google Drive directly using API v3
        Returns list of SearchResult objects
        """
        if not self._authenticated or not self.service:
            logger.warning("Not authenticated with Google Drive")
            return []

        if not query.strip():
            return []

        results = []

        try:
            logger.info(f"Searching Google Drive for: {query}")

            # Build query - search by filename with audio MIME type filter
            # API v3 syntax: name contains 'query' and (mimeType = 'audio/mpeg' or ...)
            mime_conditions = [f"mimeType='{mime}'" for mime in self.AUDIO_MIME_TYPES]
            gdrive_query = f"name contains '{query}' and ({' or '.join(mime_conditions)}) and trashed=false"

            logger.debug(f"Query: {gdrive_query}")

            # Execute search
            response = self.service.files().list(
                q=gdrive_query,
                pageSize=limit,
                fields="files(id, name, mimeType, size, modifiedTime, webViewLink, webContentLink, shared)",
                orderBy="modifiedTime desc"  # Newest first
            ).execute()

            files = response.get('files', [])
            logger.info(f"Found {len(files)} files on Google Drive")

            # Convert to SearchResult objects
            for file in files:
                try:
                    filename = file.get('name', '')
                    file_id = file.get('id', '')

                    # Parse modified date (make timezone-naive)
                    modified_str = file.get('modifiedTime', '')
                    try:
                        modified_date = datetime.fromisoformat(modified_str.replace('Z', '+00:00'))
                        modified_date = modified_date.replace(tzinfo=None)
                    except:
                        modified_date = datetime.now()

                    # Get file extension
                    file_type = Path(filename).suffix

                    result = SearchResult(
                        source='gdrive',
                        file_id=file_id,
                        filename=filename,
                        path=f"Google Drive/{filename}",
                        size=int(file.get('size', 0)),
                        modified_date=modified_date,
                        file_type=file_type,
                        metadata={
                            'mime_type': file.get('mimeType', ''),
                            'download_url': file.get('webContentLink', ''),
                            'web_view_link': file.get('webViewLink', ''),
                            'is_shared': file.get('shared', False)
                        }
                    )

                    results.append(result)

                except Exception as e:
                    logger.error(f"Error processing file: {e}")
                    continue

        except HttpError as error:
            logger.error(f"Google Drive API error: {error}")
        except Exception as e:
            logger.error(f"Error searching Google Drive: {e}")

        return results

    def download_file(self, file_id: str, output_path: Path) -> bool:
        """
        Download a file from Google Drive using API v3
        Returns True if successful
        """
        if not self._authenticated or not self.service:
            logger.warning("Not authenticated with Google Drive")
            return False

        try:
            # Get file metadata
            request = self.service.files().get_media(fileId=file_id)

            # Download to file
            import io
            from googleapiclient.http import MediaIoBaseDownload

            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, request)

            done = False
            while not done:
                status, done = downloader.next_chunk()
                if status:
                    logger.debug(f"Download {int(status.progress() * 100)}%")

            # Write to output file
            with open(output_path, 'wb') as f:
                f.write(fh.getvalue())

            logger.info(f"Downloaded file to {output_path}")
            return True

        except Exception as e:
            logger.error(f"Error downloading file: {e}")
            return False

    def get_storage_info(self) -> dict:
        """Get storage quota information using API v3"""
        if not self._authenticated or not self.service:
            return {}

        try:
            about = self.service.about().get(fields="storageQuota").execute()
            quota = about.get('storageQuota', {})

            limit = int(quota.get('limit', 0))
            usage = int(quota.get('usage', 0))

            return {
                'total_gb': limit / (1024 ** 3),
                'used_gb': usage / (1024 ** 3),
                'free_gb': (limit - usage) / (1024 ** 3),
                'percent_used': (usage / limit) * 100 if limit > 0 else 0
            }

        except Exception as e:
            logger.error(f"Error getting storage info: {e}")
            return {}

    def disconnect(self):
        """Disconnect and clear credentials"""
        if self.token_path.exists():
            self.token_path.unlink()
        self.service = None
        self.creds = None
        self._authenticated = False
        logger.info("Disconnected from Google Drive")
