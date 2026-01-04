"""URL parser and validator for supported platforms."""
import re
from enum import Enum
from typing import Optional, Tuple


class Platform(Enum):
    """Supported platforms."""
    YOUTUBE = "youtube"
    SPOTIFY = "spotify"
    SOUNDCLOUD = "soundcloud"
    BANDCAMP = "bandcamp"
    UNKNOWN = "unknown"


class URLParser:
    """Parse and validate URLs from supported platforms."""

    # URL patterns for each platform
    PATTERNS = {
        Platform.YOUTUBE: [
            r'(?:https?://)?(?:www\.)?youtube\.com/watch\?v=[\w-]+',
            r'(?:https?://)?(?:www\.)?youtu\.be/[\w-]+',
            r'(?:https?://)?(?:www\.)?youtube\.com/playlist\?list=[\w-]+',
            r'(?:https?://)?music\.youtube\.com/watch\?v=[\w-]+',
        ],
        Platform.SPOTIFY: [
            r'(?:https?://)?open\.spotify\.com/track/[\w]+',
            r'(?:https?://)?open\.spotify\.com/album/[\w]+',
            r'(?:https?://)?open\.spotify\.com/playlist/[\w]+',
            r'spotify:track:[\w]+',
            r'spotify:album:[\w]+',
            r'spotify:playlist:[\w]+',
        ],
        Platform.SOUNDCLOUD: [
            r'(?:https?://)?(?:www\.)?soundcloud\.com/[\w-]+/[\w-]+',
            r'(?:https?://)?(?:www\.)?soundcloud\.com/[\w-]+/sets/[\w-]+',
        ],
        Platform.BANDCAMP: [
            r'(?:https?://)?[\w-]+\.bandcamp\.com/track/[\w-]+',
            r'(?:https?://)?[\w-]+\.bandcamp\.com/album/[\w-]+',
        ]
    }

    @classmethod
    def parse(cls, url: str) -> Tuple[Platform, str]:
        """
        Parse URL and determine platform.

        Args:
            url: URL string to parse

        Returns:
            Tuple of (Platform, cleaned_url)
        """
        if not url or not isinstance(url, str):
            return (Platform.UNKNOWN, url)

        url = url.strip()

        # Check each platform's patterns
        for platform, patterns in cls.PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, url, re.IGNORECASE):
                    # Clean the URL based on platform
                    cleaned_url = cls._clean_url(url, platform)
                    return (platform, cleaned_url)

        return (Platform.UNKNOWN, url)

    @classmethod
    def _clean_url(cls, url: str, platform: Platform) -> str:
        """
        Clean URL by removing unwanted parameters.

        Args:
            url: URL to clean
            platform: Platform type

        Returns:
            Cleaned URL
        """
        if platform == Platform.YOUTUBE:
            # Remove playlist and radio parameters to download only the single video
            # Keep only the video ID parameter
            import urllib.parse
            parsed = urllib.parse.urlparse(url)

            if 'youtube.com' in parsed.netloc:
                # Parse query parameters
                params = urllib.parse.parse_qs(parsed.query)

                # Keep only 'v' parameter for standard YouTube URLs
                if 'v' in params:
                    clean_query = urllib.parse.urlencode({'v': params['v'][0]})
                    cleaned = urllib.parse.urlunparse((
                        parsed.scheme,
                        parsed.netloc,
                        parsed.path,
                        parsed.params,
                        clean_query,
                        parsed.fragment
                    ))
                    return cleaned

        return url

    @classmethod
    def is_valid(cls, url: str) -> bool:
        """Check if URL is from a supported platform."""
        platform, _ = cls.parse(url)
        return platform != Platform.UNKNOWN

    @classmethod
    def extract_id(cls, url: str, platform: Platform) -> Optional[str]:
        """
        Extract the media ID from URL.

        Args:
            url: URL to extract from
            platform: Platform type

        Returns:
            Extracted ID or None
        """
        if platform == Platform.YOUTUBE:
            # Extract video ID from various YouTube URL formats
            patterns = [
                r'v=([^&]+)',
                r'youtu\.be/([^?]+)',
                r'music\.youtube\.com/watch\?v=([^&]+)'
            ]
            for pattern in patterns:
                match = re.search(pattern, url)
                if match:
                    return match.group(1)

        elif platform == Platform.SPOTIFY:
            # Extract Spotify ID
            match = re.search(r'(?:track|album|playlist)[:/]([a-zA-Z0-9]+)', url)
            if match:
                return match.group(1)

        elif platform == Platform.SOUNDCLOUD:
            # SoundCloud uses full URL as identifier
            return url

        return None
