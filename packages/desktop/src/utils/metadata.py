"""Metadata handler using spotipy and mutagen."""
import os
import requests
from pathlib import Path
from typing import Optional, Dict
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, TIT2, TPE1, TALB, TDRC, APIC, TPE2
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials


class MetadataHandler:
    """Handle metadata tagging for MP3 files."""

    def __init__(self, spotify_client_id: str = "", spotify_client_secret: str = ""):
        """
        Initialize metadata handler.

        Args:
            spotify_client_id: Spotify API client ID
            spotify_client_secret: Spotify API client secret
        """
        self.spotify = None

        if spotify_client_id and spotify_client_secret:
            try:
                auth_manager = SpotifyClientCredentials(
                    client_id=spotify_client_id,
                    client_secret=spotify_client_secret
                )
                self.spotify = spotipy.Spotify(auth_manager=auth_manager)
            except Exception as e:
                print(f"Failed to initialize Spotify client: {e}")

    def get_spotify_metadata(self, spotify_url: str) -> Optional[Dict]:
        """
        Get metadata from Spotify API.

        Args:
            spotify_url: Spotify track URL

        Returns:
            Dictionary with metadata or None
        """
        if not self.spotify:
            return None

        try:
            # Extract track ID from URL
            track_id = spotify_url.split('/')[-1].split('?')[0]

            # Get track info
            track = self.spotify.track(track_id)

            metadata = {
                'title': track['name'],
                'artist': ', '.join([artist['name'] for artist in track['artists']]),
                'album': track['album']['name'],
                'year': track['album']['release_date'][:4],
                'album_art_url': track['album']['images'][0]['url'] if track['album']['images'] else None,
                'track_number': track['track_number'],
                'album_artist': track['album']['artists'][0]['name'] if track['album']['artists'] else None
            }

            return metadata

        except Exception as e:
            print(f"Error fetching Spotify metadata: {e}")
            return None

    def tag_mp3(
        self,
        file_path: str,
        title: Optional[str] = None,
        artist: Optional[str] = None,
        album: Optional[str] = None,
        year: Optional[str] = None,
        album_art_url: Optional[str] = None,
        album_art_path: Optional[str] = None,
        track_number: Optional[int] = None,
        album_artist: Optional[str] = None
    ) -> bool:
        """
        Tag MP3 file with metadata.

        Args:
            file_path: Path to MP3 file
            title: Track title
            artist: Artist name
            album: Album name
            year: Release year
            album_art_url: URL to album art image
            album_art_path: Local path to album art image
            track_number: Track number
            album_artist: Album artist

        Returns:
            True if successful, False otherwise
        """
        try:
            # Load or create ID3 tags
            try:
                audio = MP3(file_path, ID3=ID3)
                audio.add_tags()
            except:
                audio = MP3(file_path)

            # Add text frames
            if title:
                audio['TIT2'] = TIT2(encoding=3, text=title)
            if artist:
                audio['TPE1'] = TPE1(encoding=3, text=artist)
            if album:
                audio['TALB'] = TALB(encoding=3, text=album)
            if year:
                audio['TDRC'] = TDRC(encoding=3, text=year)
            if album_artist:
                audio['TPE2'] = TPE2(encoding=3, text=album_artist)

            # Add album art
            if album_art_url:
                try:
                    response = requests.get(album_art_url, timeout=10)
                    if response.status_code == 200:
                        audio['APIC'] = APIC(
                            encoding=3,
                            mime='image/jpeg',
                            type=3,  # Cover (front)
                            desc='Cover',
                            data=response.content
                        )
                except Exception as e:
                    print(f"Failed to download album art: {e}")

            elif album_art_path and os.path.exists(album_art_path):
                try:
                    with open(album_art_path, 'rb') as img:
                        audio['APIC'] = APIC(
                            encoding=3,
                            mime='image/jpeg',
                            type=3,
                            desc='Cover',
                            data=img.read()
                        )
                except Exception as e:
                    print(f"Failed to embed album art: {e}")

            # Save tags
            audio.save()
            return True

        except Exception as e:
            print(f"Error tagging MP3: {e}")
            return False

    def auto_tag_from_spotify(self, file_path: str, spotify_url: str) -> bool:
        """
        Automatically tag MP3 file using Spotify metadata.

        Args:
            file_path: Path to MP3 file
            spotify_url: Spotify track URL

        Returns:
            True if successful, False otherwise
        """
        metadata = self.get_spotify_metadata(spotify_url)

        if not metadata:
            return False

        return self.tag_mp3(
            file_path=file_path,
            title=metadata.get('title'),
            artist=metadata.get('artist'),
            album=metadata.get('album'),
            year=metadata.get('year'),
            album_art_url=metadata.get('album_art_url'),
            track_number=metadata.get('track_number'),
            album_artist=metadata.get('album_artist')
        )

    def extract_metadata_from_filename(self, filename: str) -> Dict[str, str]:
        """
        Try to extract artist and title from filename.

        Common formats:
        - Artist - Title.mp3
        - Artist_Title.mp3
        - Title.mp3

        Args:
            filename: Filename to parse

        Returns:
            Dictionary with extracted metadata
        """
        # Remove extension
        name = Path(filename).stem

        metadata = {}

        # Try common separators
        for separator in [' - ', '_', ' _ ']:
            if separator in name:
                parts = name.split(separator, 1)
                if len(parts) == 2:
                    metadata['artist'] = parts[0].strip()
                    metadata['title'] = parts[1].strip()
                    return metadata

        # If no separator found, use whole name as title
        metadata['title'] = name.strip()
        return metadata
