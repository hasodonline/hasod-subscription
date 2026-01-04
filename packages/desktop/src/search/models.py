"""
Data models for search results
"""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Dict, Any


@dataclass
class SearchResult:
    """Represents a single search result from any source"""
    source: str           # 'local', 'gdrive', 'dropbox'
    file_id: str         # Path for local, file ID for cloud
    filename: str
    path: str            # Display path (human-readable)
    size: int            # File size in bytes
    modified_date: datetime
    file_type: str       # Extension (e.g., '.mp3', '.m4a')
    metadata: Dict[str, Any] = field(default_factory=dict)  # Audio metadata (artist, title, album, etc.)
    thumbnail_url: Optional[str] = None  # Album art or preview image

    def __post_init__(self):
        """Ensure file_type starts with a dot"""
        if self.file_type and not self.file_type.startswith('.'):
            self.file_type = f'.{self.file_type}'

    @property
    def display_name(self) -> str:
        """Get display name with metadata if available"""
        if self.metadata.get('artist') and self.metadata.get('title'):
            return f"{self.metadata['artist']} - {self.metadata['title']}"
        return self.filename

    @property
    def size_mb(self) -> float:
        """Get file size in MB"""
        return self.size / (1024 * 1024)

    @property
    def is_audio(self) -> bool:
        """Check if file is an audio file"""
        audio_extensions = {'.mp3', '.m4a', '.wav', '.flac', '.aac', '.ogg', '.wma', '.opus'}
        return self.file_type.lower() in audio_extensions

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization"""
        return {
            'source': self.source,
            'file_id': self.file_id,
            'filename': self.filename,
            'path': self.path,
            'size': self.size,
            'modified_date': self.modified_date.isoformat(),
            'file_type': self.file_type,
            'metadata': self.metadata,
            'thumbnail_url': self.thumbnail_url
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'SearchResult':
        """Create from dictionary"""
        data['modified_date'] = datetime.fromisoformat(data['modified_date'])
        return cls(**data)
