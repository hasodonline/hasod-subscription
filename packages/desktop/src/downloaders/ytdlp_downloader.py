"""YouTube and SoundCloud downloader using yt-dlp."""
import os
from pathlib import Path
from typing import Callable, Optional, Dict
import yt_dlp
from ..utils.config import config
from ..utils.transliterator import get_transliterator


class YTDLPDownloader:
    """Handle downloads from YouTube and SoundCloud using yt-dlp."""

    def __init__(self, output_dir: Path):
        """
        Initialize downloader.

        Args:
            output_dir: Directory to save downloaded files
        """
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def download(
        self,
        url: str,
        progress_callback: Optional[Callable[[Dict], None]] = None,
        filename: Optional[str] = None
    ) -> Optional[str]:
        """
        Download audio from URL.

        Args:
            url: YouTube or SoundCloud URL
            progress_callback: Optional callback for progress updates
            filename: Optional custom filename (without extension)

        Returns:
            Path to downloaded file or None if failed
        """

        def progress_hook(d):
            """Internal progress hook for yt-dlp."""
            if progress_callback and d['status'] in ['downloading', 'finished']:
                progress_data = {
                    'status': d['status'],
                    'downloaded_bytes': d.get('downloaded_bytes', 0),
                    'total_bytes': d.get('total_bytes', 0) or d.get('total_bytes_estimate', 0),
                    'speed': d.get('speed', 0),
                    'eta': d.get('eta', 0),
                    'filename': d.get('filename', '')
                }
                progress_callback(progress_data)

        try:
            # First, extract info to get metadata
            info_opts = {
                'quiet': True,
                'no_warnings': True,
            }

            with yt_dlp.YoutubeDL(info_opts) as ydl:
                info = ydl.extract_info(url, download=False)

                if info is None:
                    return None

                # Extract artist and album info
                artist = info.get('artist') or info.get('uploader') or info.get('channel') or 'Unknown Artist'
                album = info.get('album') or info.get('playlist') or 'Unknown Album'
                title = info.get('title', 'download')

                # Sanitize names for folder structure
                artist_safe = self._sanitize_filename(artist)
                album_safe = self._sanitize_filename(album)
                title_safe = self._sanitize_filename(title)

                # Transliterate folder names if enabled
                if config.get('transliterate_hebrew', False):
                    transliterator = get_transliterator()
                    if transliterator.has_hebrew(artist_safe):
                        artist_safe = transliterator.transliterate(artist_safe)
                        print(f"[INFO] Transliterated artist folder: {artist_safe}")
                    if transliterator.has_hebrew(album_safe):
                        album_safe = transliterator.transliterate(album_safe)
                        print(f"[INFO] Transliterated album folder: {album_safe}")

                # Create artist/album folder structure
                track_dir = self.output_dir / artist_safe / album_safe
                track_dir.mkdir(parents=True, exist_ok=True)

                # Output template with artist/album folders
                if filename:
                    output_template = str(track_dir / f"{filename}.%(ext)s")
                    final_filename = f"{filename}.mp3"
                else:
                    output_template = str(track_dir / f"{title_safe}.%(ext)s")
                    final_filename = f"{title_safe}.mp3"

            # yt-dlp options for best quality audio
            ydl_opts = {
                'format': 'bestaudio/best',
                'postprocessors': [
                    {
                        'key': 'FFmpegExtractAudio',
                        'preferredcodec': 'mp3',
                        'preferredquality': '320',
                    },
                    {
                        'key': 'EmbedThumbnail',
                        'already_have_thumbnail': False
                    },
                    {
                        'key': 'FFmpegMetadata',
                    }
                ],
                'outtmpl': output_template,
                'progress_hooks': [progress_hook],
                'quiet': True,
                'no_warnings': True,
                'extract_flat': False,
                'writeinfojson': False,
                'writethumbnail': True,  # Download thumbnail for embedding into MP3
                'postprocessor_args': [
                    '-ar', '48000',  # Sample rate
                    '-ac', '2',      # Stereo
                ],
            }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # Download
                ydl.download([url])

                # Check if file was downloaded
                output_file = track_dir / final_filename

                if output_file.exists():
                    # Clean up intermediate files
                    self._cleanup_intermediate_files(track_dir, output_file)
                    return str(output_file)

        except Exception as e:
            print(f"Download error: {e}")
            return None

        return None

    def get_info(self, url: str) -> Optional[Dict]:
        """
        Get video/track information without downloading.

        Args:
            url: URL to get info for

        Returns:
            Dictionary with track info or None
        """
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)

                if info:
                    return {
                        'title': info.get('title', 'Unknown'),
                        'artist': info.get('uploader', 'Unknown'),
                        'duration': info.get('duration', 0),
                        'thumbnail': info.get('thumbnail', ''),
                    }
        except Exception as e:
            print(f"Info extraction error: {e}")

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
        intermediate_extensions = ['.webp', '.jpg', '.jpeg', '.png', '.tmp', '.part', '.ytdl']

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
