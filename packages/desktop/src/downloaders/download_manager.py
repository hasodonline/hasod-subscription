"""Main download manager coordinating all downloaders."""
import threading
from pathlib import Path
from typing import Callable, Optional, Dict
from queue import Queue

from .ytdlp_downloader import YTDLPDownloader
from .spotify_downloader import SpotifyDownloader
from ..utils.url_parser import URLParser, Platform
from ..utils.metadata import MetadataHandler
from ..utils.config import config
from ..utils.transliterator import get_transliterator
import os


class DownloadTask:
    """Represents a download task."""

    def __init__(self, url: str, platform: Platform):
        self.url = url
        self.platform = platform
        self.status = "pending"  # pending, downloading, completed, error
        self.progress = 0
        self.message = ""
        self.output_path = None
        # Album context (for album downloads)
        self.album_name = None
        self.artist_name = None
        self.track_position = None
        self.total_tracks = None


class DownloadManager:
    """Manages downloads from all supported platforms."""

    def __init__(self, spotify_auth_handler=None):
        """
        Initialize download manager.

        Args:
            spotify_auth_handler: Optional SpotifyAuthHandler for authentication
        """
        self.downloads_dir = config.downloads_path
        self.downloads_dir.mkdir(parents=True, exist_ok=True)

        # Initialize downloaders
        self.ytdlp = YTDLPDownloader(self.downloads_dir)
        self.spotify = SpotifyDownloader(self.downloads_dir, auth_handler=spotify_auth_handler)

        # Initialize metadata handler
        spotify_id = config.get('spotify_client_id', '')
        spotify_secret = config.get('spotify_client_secret', '')
        self.metadata_handler = MetadataHandler(spotify_id, spotify_secret)

        # Download queue
        self.queue = Queue()
        self.current_task: Optional[DownloadTask] = None
        self.tasks_history = []

        # Worker thread
        self.worker_thread = None
        self.is_running = False

    def add_download(self, url: str) -> Optional[DownloadTask]:
        """
        Add a download to the queue.

        Args:
            url: URL to download

        Returns:
            DownloadTask object or None if invalid (for single tracks)
            First DownloadTask if album (multiple tasks queued)
        """
        # Parse URL
        platform, clean_url = URLParser.parse(url)

        if platform == Platform.UNKNOWN:
            return None

        # Check if it's a Spotify album URL
        if platform == Platform.SPOTIFY and 'album/' in clean_url:
            return self._add_album_download(clean_url)

        # Create task
        task = DownloadTask(clean_url, platform)
        self.queue.put(task)
        self.tasks_history.append(task)

        # Start worker if not running
        if not self.is_running:
            self.start_worker()

        return task

    def _add_album_download(self, album_url: str) -> Optional[DownloadTask]:
        """
        Add all tracks from a Spotify album to the queue.

        Args:
            album_url: Spotify album URL

        Returns:
            First DownloadTask object or None if failed
        """
        try:
            # Get album info and track URLs from the album
            album_info, track_urls = self.spotify.get_album_info_and_tracks(album_url)

            if not track_urls:
                print(f"[ERROR] No tracks found in album: {album_url}")
                return None

            album_name = album_info.get('name', 'Unknown Album')
            artist_name = album_info.get('artist', 'Unknown Artist')
            track_count = len(track_urls)

            print(f"[INFO] Album: {album_name} by {artist_name}")
            print(f"[INFO] Found {track_count} tracks in album")

            # Queue all tracks with position info
            first_task = None
            for i, track_url in enumerate(track_urls, 1):
                task = DownloadTask(track_url, Platform.SPOTIFY)
                # Add album context to task
                task.album_name = album_name
                task.artist_name = artist_name
                task.track_position = i
                task.total_tracks = track_count
                task.message = f"Queued: Track {i}/{track_count} from '{album_name}'"

                self.queue.put(task)
                self.tasks_history.append(task)

                if first_task is None:
                    first_task = task

            # Start worker if not running
            if not self.is_running:
                self.start_worker()

            return first_task

        except Exception as e:
            print(f"[ERROR] Failed to add album download: {e}")
            return None

    def start_worker(self):
        """Start the download worker thread."""
        if self.worker_thread and self.worker_thread.is_alive():
            return

        self.is_running = True
        self.worker_thread = threading.Thread(target=self._worker, daemon=True)
        self.worker_thread.start()

    def stop_worker(self):
        """Stop the download worker thread."""
        self.is_running = False

    def _worker(self):
        """Worker thread that processes download queue."""
        while self.is_running:
            try:
                # Get next task (with timeout to allow checking is_running)
                task = self.queue.get(timeout=1)
                self.current_task = task
                self._process_task(task)
                self.current_task = None
                self.queue.task_done()
            except:
                # Queue empty or timeout
                continue

    def _process_task(self, task: DownloadTask):
        """
        Process a download task.

        Args:
            task: DownloadTask to process
        """
        task.status = "downloading"
        task.message = f"Downloading from {task.platform.value}..."

        try:
            if task.platform in [Platform.YOUTUBE, Platform.SOUNDCLOUD, Platform.BANDCAMP]:
                self._download_ytdlp(task)
            elif task.platform == Platform.SPOTIFY:
                self._download_spotify(task)
            else:
                task.status = "error"
                task.message = "Unsupported platform"

        except Exception as e:
            task.status = "error"
            task.message = f"Error: {str(e)}"

    def _download_ytdlp(self, task: DownloadTask):
        """Download using yt-dlp."""
        print(f"[DEBUG] Starting yt-dlp download for: {task.url}")

        def progress_callback(data):
            if data['status'] == 'downloading':
                total = data.get('total_bytes', 0)
                downloaded = data.get('downloaded_bytes', 0)
                if total > 0:
                    task.progress = int((downloaded / total) * 100)
                    task.message = f"Downloading... {task.progress}%"
                    print(f"[DEBUG] Progress: {task.progress}%")
            elif data['status'] == 'finished':
                task.message = "Processing..."
                print(f"[DEBUG] Download finished, processing...")

        # Download
        print(f"[DEBUG] Calling ytdlp.download()...")
        output_path = self.ytdlp.download(
            task.url,
            progress_callback=progress_callback
        )
        print(f"[DEBUG] Download result: {output_path}")

        if output_path:
            # Transliterate filename if enabled
            if config.get('transliterate_hebrew', False):
                output_path = self._transliterate_file(output_path)

            task.output_path = output_path
            task.status = "completed"
            task.progress = 100
            task.message = "Download complete!"

            # Add metadata if enabled
            if config.get('add_metadata', True):
                self._add_metadata_ytdlp(output_path, task.url)
        else:
            task.status = "error"
            task.message = "Download failed"

    def _download_spotify(self, task: DownloadTask):
        """Download from Spotify."""
        print(f"[DEBUG] Starting Spotify download for: {task.url}")

        # Build track position prefix if this is part of an album
        track_prefix = ""
        if task.track_position and task.total_tracks:
            track_prefix = f"[{task.track_position}/{task.total_tracks}] "

        def progress_callback(data):
            message = data.get('message', 'Downloading...')

            # Add track position prefix to progress messages
            if track_prefix:
                task.message = track_prefix + message
            else:
                task.message = message

            print(f"[DEBUG] Spotify progress: {data}")

            # Extract progress percentage from message if available
            if '|' in message and '%' in message:
                try:
                    # Parse percentage from message like "Artist | 24.0% | speed | ETA"
                    percent_part = message.split('|')[1].strip()
                    percent_value = float(percent_part.replace('%', ''))
                    task.progress = int(percent_value)
                except:
                    pass

            if data.get('status') == 'error':
                task.status = "error"

        # Download with album context if available
        print(f"[DEBUG] Calling spotify.download()...")
        output_path = self.spotify.download(
            task.url,
            progress_callback=progress_callback,
            album_name=task.album_name  # Pass album name for folder structure
        )
        print(f"[DEBUG] Spotify download result: {output_path}")

        if output_path and task.status != "error":
            # Transliterate filename if enabled (folder names are already transliterated in downloader)
            if config.get('transliterate_hebrew', False):
                from pathlib import Path
                file_path = Path(output_path)
                if file_path.exists() and file_path.suffix == '.mp3':
                    output_path = self._transliterate_file(str(file_path))

            # Note: Intermediate file cleanup is now handled in the downloaders themselves

            task.output_path = output_path
            task.status = "completed"
            task.progress = 100

            # Build completion message with track position if available
            if task.track_position and task.total_tracks:
                task.message = f"[{task.track_position}/{task.total_tracks}] Download complete!"
            else:
                task.message = "Download complete!"
        elif task.status != "error":
            task.status = "error"
            if task.track_position and task.total_tracks:
                task.message = f"[{task.track_position}/{task.total_tracks}] Download failed"
            else:
                task.message = "Download failed"

    def _add_metadata_ytdlp(self, file_path: str, url: str):
        """Add metadata to downloaded file from YouTube/SoundCloud."""
        try:
            # Try to extract metadata from filename
            metadata = self.metadata_handler.extract_metadata_from_filename(file_path)

            if metadata:
                self.metadata_handler.tag_mp3(
                    file_path,
                    title=metadata.get('title'),
                    artist=metadata.get('artist')
                )
        except Exception as e:
            print(f"Failed to add metadata: {e}")

    def get_queue_size(self) -> int:
        """Get number of tasks in queue."""
        return self.queue.qsize()

    def get_current_task(self) -> Optional[DownloadTask]:
        """Get currently downloading task."""
        return self.current_task

    def get_history(self) -> list:
        """Get download history."""
        return self.tasks_history

    def _transliterate_file(self, file_path: str) -> str:
        """Transliterate a file's name if it contains Hebrew characters.

        Args:
            file_path: Path to the file

        Returns:
            New file path (renamed if transliteration occurred)
        """
        try:
            path = Path(file_path)
            if not path.exists():
                print(f"[WARNING] File not found for transliteration: {file_path}")
                return file_path

            transliterator = get_transliterator()

            # Check if filename has Hebrew
            if not transliterator.has_hebrew(path.stem):
                print(f"[DEBUG] No Hebrew in filename: {path.name}")
                return file_path

            # Transliterate
            new_filename = transliterator.transliterate_filename(path.name)
            new_path = path.parent / new_filename

            # Rename file
            os.rename(str(path), str(new_path))
            print(f"[SUCCESS] Renamed: {path.name} -> {new_filename}")

            return str(new_path)

        except Exception as e:
            print(f"[ERROR] Transliteration failed: {e}")
            return file_path

    def _transliterate_spotify_files(self, directory_path: str) -> str:
        """Transliterate all files in a directory (for Spotify downloads).

        Args:
            directory_path: Path to the directory containing downloaded files

        Returns:
            Same directory path
        """
        try:
            directory = Path(directory_path)
            if not directory.exists():
                print(f"[WARNING] Directory not found for transliteration: {directory_path}")
                return directory_path

            # Find all MP3 files in the directory
            transliterator = get_transliterator()

            for file_path in directory.glob("*.mp3"):
                if transliterator.has_hebrew(file_path.stem):
                    new_filename = transliterator.transliterate_filename(file_path.name)
                    new_path = file_path.parent / new_filename

                    os.rename(str(file_path), str(new_path))
                    print(f"[SUCCESS] Renamed: {file_path.name} -> {new_filename}")

            return directory_path

        except Exception as e:
            print(f"[ERROR] Spotify transliteration failed: {e}")
            return directory_path
