"""
Unified search manager that coordinates all search backends
"""
from pathlib import Path
from typing import List, Optional, Set
import logging

from .models import SearchResult
from .local_search import LocalSearch
from .gdrive_search import GDriveSearch
from .dropbox_search import DropboxSearch

logger = logging.getLogger(__name__)


class SearchManager:
    """Unified interface for searching across all sources"""

    def __init__(self):
        """Initialize search manager with all backends"""
        self.local = LocalSearch()
        self.gdrive = GDriveSearch()
        self.dropbox = DropboxSearch()

        # Try to load saved credentials for cloud services (silently fail if not configured)
        try:
            self.gdrive.load_token() if hasattr(self.gdrive, 'load_token') else None
        except Exception:
            pass  # Google Drive not configured, that's okay

        try:
            self.dropbox.load_token()
        except Exception:
            pass  # Dropbox not configured, that's okay

    def search(
        self,
        query: str,
        sources: Optional[Set[str]] = None,
        limit_per_source: int = 100
    ) -> List[SearchResult]:
        """
        Search across sources sequentially (not parallel to avoid threading issues)

        Args:
            query: Search query string
            sources: Set of sources to search ('local', 'gdrive', 'dropbox'). If None, search all.
            limit_per_source: Maximum results per source

        Returns:
            List of SearchResult objects from all sources combined
        """
        if sources is None:
            sources = {'local', 'gdrive', 'dropbox'}

        if not query.strip():
            return []

        all_results = []

        # Search each source sequentially to avoid threading issues with API calls
        if 'local' in sources:
            try:
                results = self.local.search(query, limit=limit_per_source)
                all_results.extend(results)
                logger.info(f"Got {len(results)} results from local")
            except Exception as e:
                logger.error(f"Error searching local: {e}")

        if 'gdrive' in sources and self.gdrive.is_authenticated():
            try:
                results = self.gdrive.search(query, limit=limit_per_source)
                all_results.extend(results)
                logger.info(f"Got {len(results)} results from gdrive")
            except Exception as e:
                logger.error(f"Error searching gdrive: {e}")

        if 'dropbox' in sources and self.dropbox.is_authenticated():
            try:
                results = self.dropbox.search(query, limit=limit_per_source)
                all_results.extend(results)
                logger.info(f"Got {len(results)} results from dropbox")
            except Exception as e:
                logger.error(f"Error searching dropbox: {e}")

        # Sort by modified date (newest first)
        all_results.sort(key=lambda r: r.modified_date, reverse=True)

        return all_results

    def index_local_files(self, directories: Optional[List[Path]] = None) -> int:
        """
        Index local files from specified directories

        Args:
            directories: List of directories to index. If None, use defaults.

        Returns:
            Number of files indexed
        """
        if directories is None:
            directories = LocalSearch.get_default_music_directories()

        return self.local.index_multiple_directories(directories)


    def get_sources_status(self) -> dict:
        """
        Get status of all search sources

        Returns:
            Dictionary with status information for each source
        """
        status = {}

        # Local status
        try:
            local_stats = self.local.get_index_stats()
            status['local'] = {
                'enabled': True,
                'connected': True,
                'files_indexed': local_stats['total_files'],
                'index_size_mb': local_stats['index_size_mb'],
                'last_updated': local_stats['last_updated']
            }
        except Exception as e:
            logger.error(f"Error getting local status: {e}")
            status['local'] = {'enabled': True, 'connected': False, 'error': str(e)}

        # Google Drive status
        try:
            is_connected = self.gdrive.is_authenticated()
            gdrive_status = {
                'enabled': True,
                'connected': is_connected
            }
            if is_connected:
                storage = self.gdrive.get_storage_info()
                gdrive_status.update(storage)
            status['gdrive'] = gdrive_status
        except Exception as e:
            logger.error(f"Error getting Google Drive status: {e}")
            status['gdrive'] = {'enabled': True, 'connected': False, 'error': str(e)}

        # Dropbox status
        try:
            is_connected = self.dropbox.is_authenticated()
            dropbox_status = {
                'enabled': True,
                'connected': is_connected
            }
            if is_connected:
                storage = self.dropbox.get_storage_info()
                dropbox_status.update(storage)
            status['dropbox'] = dropbox_status
        except Exception as e:
            logger.error(f"Error getting Dropbox status: {e}")
            status['dropbox'] = {'enabled': True, 'connected': False, 'error': str(e)}

        return status

    def authenticate_gdrive(self) -> bool:
        """Authenticate with Google Drive"""
        try:
            return self.gdrive.authenticate()
        except Exception as e:
            logger.error(f"Error authenticating with Google Drive: {e}")
            return False

    def authenticate_dropbox(self, access_token: str) -> bool:
        """Authenticate with Dropbox"""
        try:
            return self.dropbox.authenticate(access_token)
        except Exception as e:
            logger.error(f"Error authenticating with Dropbox: {e}")
            return False

    def disconnect_gdrive(self):
        """Disconnect from Google Drive"""
        self.gdrive.disconnect()

    def disconnect_dropbox(self):
        """Disconnect from Dropbox"""
        self.dropbox.disconnect()

    def download_cloud_file(self, result: SearchResult, output_path: Path) -> bool:
        """
        Download a cloud file to local storage

        Args:
            result: SearchResult from cloud source
            output_path: Local path to save the file

        Returns:
            True if successful
        """
        try:
            if result.source == 'gdrive':
                return self.gdrive.download_file(result.file_id, output_path)
            elif result.source == 'dropbox':
                return self.dropbox.download_file(result.path, output_path)
            else:
                logger.error(f"Cannot download from source: {result.source}")
                return False
        except Exception as e:
            logger.error(f"Error downloading cloud file: {e}")
            return False

    def get_cloud_file_link(self, result: SearchResult) -> Optional[str]:
        """
        Get a shareable/downloadable link for a cloud file

        Args:
            result: SearchResult from cloud source

        Returns:
            URL string or None
        """
        try:
            if result.source == 'dropbox':
                return self.dropbox.get_temporary_link(result.path)
            elif result.source == 'gdrive':
                return result.metadata.get('web_view_link')
            return None
        except Exception as e:
            logger.error(f"Error getting cloud file link: {e}")
            return None
