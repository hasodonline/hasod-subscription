"""Spotify downloader using Spotify API + yt-dlp (no authentication needed)."""
from pathlib import Path
from typing import Callable, Optional, Dict
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
import yt_dlp
from ..utils.config import config
from ..utils.transliterator import get_transliterator


class SpotifyDownloader:
    """Handle Spotify downloads using Spotify API + yt-dlp."""

    def __init__(self, output_dir: Path, auth_handler=None):
        """
        Initialize Spotify downloader.

        Args:
            output_dir: Directory to save downloaded files
            auth_handler: Not used (kept for compatibility)
        """
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Initialize Spotify API client
        self.spotify = spotipy.Spotify(
            auth_manager=SpotifyClientCredentials(
                client_id='5f573c9620494bae87890c0f08a60293',
                client_secret='212476d9b0f3472eaa762d90b19b0ba8'
            )
        )

    def download(
        self,
        url: str,
        progress_callback: Optional[Callable[[Dict], None]] = None,
        album_name: Optional[str] = None
    ) -> Optional[str]:
        """
        Download from Spotify using Spotify API + yt-dlp.

        Args:
            url: Spotify URL (track, album, or playlist)
            progress_callback: Optional callback for progress updates
            album_name: Optional album name for folder organization

        Returns:
            Path to downloaded file(s) directory or None if failed
        """
        try:
            # Notify download started
            if progress_callback:
                progress_callback({
                    'status': 'downloading',
                    'message': 'Fetching Spotify metadata...'
                })

            # Extract Spotify ID and type from URL
            track_id = self._extract_track_id(url)
            if not track_id:
                if progress_callback:
                    progress_callback({
                        'status': 'error',
                        'message': 'Invalid Spotify URL'
                    })
                return None

            # Get track info from Spotify API
            track = self.spotify.track(track_id)
            artist = track['artists'][0]['name']
            title = track['name']

            # Get album name if not provided
            if not album_name and track.get('album'):
                album_name = track['album']['name']

            # Create artist/album folder structure
            artist_safe = self._sanitize_filename(artist)
            album_safe = self._sanitize_filename(album_name) if album_name else 'Unknown Album'

            # Transliterate folder names if enabled
            if config.get('transliterate_hebrew', False):
                transliterator = get_transliterator()
                if transliterator.has_hebrew(artist_safe):
                    artist_safe = transliterator.transliterate(artist_safe)
                    print(f"[INFO] Transliterated artist folder: {artist_safe}")
                if transliterator.has_hebrew(album_safe):
                    album_safe = transliterator.transliterate(album_safe)
                    print(f"[INFO] Transliterated album folder: {album_safe}")

            # Create the folder path: output_dir/artist/album/
            track_dir = self.output_dir / artist_safe / album_safe
            track_dir.mkdir(parents=True, exist_ok=True)

            # Search YouTube for the track
            search_query = f"{artist} - {title} official audio"

            if progress_callback:
                progress_callback({
                    'status': 'downloading',
                    'message': f'Downloading: {artist} - {title}'
                })

            # Progress hook for detailed download status
            def progress_hook(d):
                if d['status'] == 'downloading' and progress_callback:
                    # Extract progress info
                    percent = d.get('_percent_str', '0%').strip()
                    speed = d.get('_speed_str', 'Unknown').strip()
                    eta = d.get('_eta_str', 'Unknown').strip()

                    progress_callback({
                        'status': 'downloading',
                        'message': f'{artist} - {title} | {percent} | {speed} | ETA: {eta}'
                    })
                elif d['status'] == 'finished' and progress_callback:
                    progress_callback({
                        'status': 'downloading',
                        'message': f'Converting to MP3...'
                    })

            # Download using yt-dlp library to the artist/album folder
            ydl_opts = {
                'format': 'bestaudio/best',
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '320',
                }],
                'outtmpl': str(track_dir / f'{artist} - {title}.%(ext)s'),
                'writethumbnail': True,
                'embedthumbnail': True,
                'addmetadata': True,
                'quiet': True,
                'no_warnings': True,
                'progress_hooks': [progress_hook],
            }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([f'ytsearch1:{search_query}'])

            # Check if file was downloaded in the album folder
            mp3_files = sorted(track_dir.glob('*.mp3'), key=lambda p: p.stat().st_mtime, reverse=True)
            if mp3_files:
                # Return the path to the actual file that was just downloaded (newest one)
                downloaded_file = mp3_files[0]

                # Clean up intermediate files (thumbnails, etc.)
                self._cleanup_intermediate_files(track_dir, downloaded_file)

                if progress_callback:
                    progress_callback({
                        'status': 'finished',
                        'message': f'Downloaded: {artist} - {title}',
                        'file_path': str(downloaded_file)  # Include actual file path
                    })
                return str(downloaded_file)  # Return file path, not directory
            else:
                if progress_callback:
                    progress_callback({
                        'status': 'error',
                        'message': 'Download failed - no files created'
                    })
                return None

        except Exception as e:
            if progress_callback:
                progress_callback({
                    'status': 'error',
                    'message': f'Error: {str(e)}'
                })
            return None

    @staticmethod
    def _sanitize_filename(filename: str) -> str:
        """Remove invalid characters from filename."""
        invalid_chars = '<>:"/\\|?*'
        for char in invalid_chars:
            filename = filename.replace(char, '_')
        return filename.strip()

    @staticmethod
    def _cleanup_intermediate_files(directory: Path, mp3_file: Path):
        """Clean up intermediate files like thumbnails.

        Args:
            directory: Directory to clean
            mp3_file: The MP3 file to keep (used to find related files)
        """
        # List of intermediate file extensions to remove
        intermediate_extensions = ['.webp', '.jpg', '.jpeg', '.png', '.tmp', '.part']

        # Get the base name of the mp3 file (without extension)
        mp3_stem = mp3_file.stem

        for ext in intermediate_extensions:
            # Look for files with the same stem but different extensions
            for file_path in directory.glob(f'{mp3_stem}*{ext}'):
                try:
                    file_path.unlink()
                    print(f"[CLEANUP] Removed intermediate file: {file_path.name}")
                except Exception as e:
                    print(f"[WARNING] Failed to remove {file_path.name}: {e}")

            # Also look for any other files with these extensions in the directory
            for file_path in directory.glob(f'*{ext}'):
                try:
                    file_path.unlink()
                    print(f"[CLEANUP] Removed intermediate file: {file_path.name}")
                except Exception as e:
                    print(f"[WARNING] Failed to remove {file_path.name}: {e}")

    def _extract_track_id(self, url: str) -> Optional[str]:
        """Extract Spotify track ID from URL."""
        import re
        match = re.search(r'track/([a-zA-Z0-9]+)', url)
        if match:
            return match.group(1)
        return None

    def _extract_album_id(self, url: str) -> Optional[str]:
        """Extract Spotify album ID from URL."""
        import re
        match = re.search(r'album/([a-zA-Z0-9]+)', url)
        if match:
            return match.group(1)
        return None

    def _is_album_url(self, url: str) -> bool:
        """Check if URL is a Spotify album."""
        return 'album/' in url

    def get_album_tracks(self, url: str) -> list:
        """
        Get all track URLs from a Spotify album.

        Args:
            url: Spotify album URL

        Returns:
            List of Spotify track URLs
        """
        try:
            album_id = self._extract_album_id(url)
            if not album_id:
                return []

            # Get album info from Spotify API
            album = self.spotify.album(album_id)
            track_urls = []

            # Extract track IDs and build URLs
            for track in album['tracks']['items']:
                track_id = track['id']
                track_url = f'https://open.spotify.com/track/{track_id}'
                track_urls.append(track_url)

            return track_urls

        except Exception as e:
            print(f"Error fetching album tracks: {e}")
            return []

    def get_album_info_and_tracks(self, url: str) -> tuple:
        """
        Get album information and all track URLs from a Spotify album.

        Args:
            url: Spotify album URL

        Returns:
            Tuple of (album_info dict, list of track URLs)
            album_info contains: name, artist, release_date, total_tracks
        """
        try:
            album_id = self._extract_album_id(url)
            if not album_id:
                return ({}, [])

            # Get album info from Spotify API
            album = self.spotify.album(album_id)

            # Extract album information
            album_info = {
                'name': album.get('name', 'Unknown Album'),
                'artist': album['artists'][0]['name'] if album.get('artists') else 'Unknown Artist',
                'release_date': album.get('release_date', ''),
                'total_tracks': album.get('total_tracks', 0)
            }

            # Extract track URLs
            track_urls = []
            for track in album['tracks']['items']:
                track_id = track['id']
                track_url = f'https://open.spotify.com/track/{track_id}'
                track_urls.append(track_url)

            return (album_info, track_urls)

        except Exception as e:
            print(f"Error fetching album info and tracks: {e}")
            return ({}, [])

    def check_installation(self) -> bool:
        """Check if required tools are installed."""
        try:
            import yt_dlp
            return True
        except ImportError:
            return False

    def is_authenticated(self) -> bool:
        """
        Check if authenticated (always True - uses public Spotify API).

        Returns:
            True (no user authentication needed)
        """
        return True

    def install_instructions(self) -> str:
        """Get installation instructions."""
        return """
Spotify downloads use the Spotify API + yt-dlp.

Requirements:
- yt-dlp (bundled with the app)
- Internet connection

Features:
- No Spotify account required
- Downloads from YouTube with Spotify metadata
- Up to 320kbps quality
- Automatic metadata embedding
"""
