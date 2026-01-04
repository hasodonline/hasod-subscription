"""
Dropbox search using official SDK
"""
from pathlib import Path
from datetime import datetime
from typing import List, Optional
import logging
import json

import dropbox
from dropbox.files import FileMetadata, SearchMatchV2
from tenacity import retry, stop_after_attempt, wait_exponential

from .models import SearchResult

logger = logging.getLogger(__name__)


class DropboxSearch:
    """Search Dropbox for audio files"""

    AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.flac', '.aac', '.ogg', '.wma', '.opus']

    def __init__(self, token_path: Optional[Path] = None):
        """Initialize Dropbox search"""
        if token_path is None:
            token_path = Path.home() / '.hasod_downloads' / 'dropbox_token.json'

        self.token_path = token_path
        self.token_path.parent.mkdir(parents=True, exist_ok=True)

        self.dbx = None
        self._authenticated = False

    def authenticate(self, access_token: str) -> bool:
        """
        Authenticate with Dropbox using access token
        Returns True if successful
        """
        try:
            self.dbx = dropbox.Dropbox(access_token)

            # Test the connection
            account = self.dbx.users_get_current_account()
            logger.info(f"Successfully authenticated with Dropbox as {account.name.display_name}")

            # Save token
            with open(self.token_path, 'w') as f:
                json.dump({'access_token': access_token}, f)

            self._authenticated = True
            return True

        except Exception as e:
            logger.error(f"Error authenticating with Dropbox: {e}")
            self._authenticated = False
            return False

    def load_token(self) -> bool:
        """
        Load saved token and authenticate
        Returns True if successful
        """
        if not self.token_path.exists():
            return False

        try:
            with open(self.token_path, 'r') as f:
                data = json.load(f)
                access_token = data.get('access_token')

            if access_token:
                return self.authenticate(access_token)

        except Exception as e:
            logger.error(f"Error loading Dropbox token: {e}")

        return False

    def is_authenticated(self) -> bool:
        """Check if authenticated"""
        return self._authenticated

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    def search(self, query: str, limit: int = 100) -> List[SearchResult]:
        """
        Search Dropbox for audio files
        Returns list of SearchResult objects
        """
        if not self._authenticated:
            logger.warning("Not authenticated with Dropbox")
            return []

        if not query.strip():
            return []

        results = []

        try:
            # Use files_search_v2 API
            search_result = self.dbx.files_search_v2(
                query=query,
                options=dropbox.files.SearchOptions(
                    max_results=limit,
                    file_extensions=self.AUDIO_EXTENSIONS
                )
            )

            for match in search_result.matches:
                try:
                    # Get file metadata
                    metadata = match.metadata.get_metadata()

                    if not isinstance(metadata, FileMetadata):
                        continue

                    file_path = metadata.path_display
                    filename = metadata.name
                    size = metadata.size
                    modified_date = metadata.client_modified

                    # Get file extension
                    file_type = Path(filename).suffix

                    # Get content hash for file ID
                    file_id = metadata.content_hash or metadata.id

                    result = SearchResult(
                        source='dropbox',
                        file_id=file_id,
                        filename=filename,
                        path=file_path,
                        size=size,
                        modified_date=modified_date,
                        file_type=file_type,
                        metadata={
                            'path_lower': metadata.path_lower,
                            'rev': metadata.rev,
                            'is_downloadable': metadata.is_downloadable
                        }
                    )

                    results.append(result)

                except Exception as e:
                    logger.error(f"Error processing search result: {e}")
                    continue

            logger.info(f"Found {len(results)} files on Dropbox")

        except Exception as e:
            logger.error(f"Error searching Dropbox: {e}")

        return results

    def download_file(self, file_path: str, output_path: Path) -> bool:
        """
        Download a file from Dropbox
        file_path: The Dropbox path (e.g., /Music/song.mp3)
        output_path: Local path to save the file
        Returns True if successful
        """
        if not self._authenticated:
            logger.warning("Not authenticated with Dropbox")
            return False

        try:
            metadata, response = self.dbx.files_download(file_path)

            with open(output_path, 'wb') as f:
                f.write(response.content)

            logger.info(f"Downloaded file to {output_path}")
            return True

        except Exception as e:
            logger.error(f"Error downloading file: {e}")
            return False

    def get_temporary_link(self, file_path: str) -> Optional[str]:
        """
        Get a temporary download link for a file
        Returns URL string or None
        """
        if not self._authenticated:
            return None

        try:
            link = self.dbx.files_get_temporary_link(file_path)
            return link.link

        except Exception as e:
            logger.error(f"Error getting temporary link: {e}")
            return None

    def get_storage_info(self) -> dict:
        """Get storage quota information"""
        if not self._authenticated:
            return {}

        try:
            space = self.dbx.users_get_space_usage()

            allocated = space.allocation.get_individual().allocated
            used = space.used

            return {
                'total_gb': allocated / (1024 ** 3),
                'used_gb': used / (1024 ** 3),
                'free_gb': (allocated - used) / (1024 ** 3),
                'percent_used': (used / allocated) * 100 if allocated > 0 else 0
            }

        except Exception as e:
            logger.error(f"Error getting storage info: {e}")
            return {}

    def disconnect(self):
        """Disconnect and clear credentials"""
        if self.token_path.exists():
            self.token_path.unlink()
        self.dbx = None
        self._authenticated = False
        logger.info("Disconnected from Dropbox")
