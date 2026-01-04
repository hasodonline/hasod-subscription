"""
Local file system search using Whoosh indexing
"""
import os
from pathlib import Path
from datetime import datetime
from typing import List, Optional, Set
import logging

from whoosh import index
from whoosh.fields import Schema, TEXT, ID, DATETIME, NUMERIC
from whoosh.qparser import MultifieldParser, OrGroup
from mutagen import File as MutagenFile

from .models import SearchResult

logger = logging.getLogger(__name__)


class LocalSearch:
    """Search local file system for audio files"""

    AUDIO_EXTENSIONS = {'.mp3', '.m4a', '.wav', '.flac', '.aac', '.ogg', '.wma', '.opus'}

    def __init__(self, index_dir: Optional[Path] = None):
        """Initialize local search with Whoosh index"""
        if index_dir is None:
            index_dir = Path.home() / '.hasod_downloads' / 'search_index'

        self.index_dir = index_dir
        self.index_dir.mkdir(parents=True, exist_ok=True)

        # Create or open index
        self.schema = Schema(
            path=ID(stored=True, unique=True),
            filename=TEXT(stored=True),
            artist=TEXT(stored=True),
            title=TEXT(stored=True),
            album=TEXT(stored=True),
            size=NUMERIC(stored=True),
            modified=DATETIME(stored=True)
        )

        if index.exists_in(str(self.index_dir)):
            self.ix = index.open_dir(str(self.index_dir))
        else:
            self.ix = index.create_in(str(self.index_dir), self.schema)

    def index_directory(self, directory: Path, recursive: bool = True) -> int:
        """
        Index all audio files in a directory
        Returns the number of files indexed
        """
        logger.info(f"Indexing directory: {directory}")
        indexed_count = 0

        writer = self.ix.writer()

        try:
            if recursive:
                files = directory.rglob('*')
            else:
                files = directory.glob('*')

            for file_path in files:
                if not file_path.is_file():
                    continue

                if file_path.suffix.lower() not in self.AUDIO_EXTENSIONS:
                    continue

                try:
                    # Get file stats
                    stat = file_path.stat()

                    # Extract audio metadata
                    metadata = self._extract_metadata(file_path)

                    # Add to index
                    writer.add_document(
                        path=str(file_path),
                        filename=file_path.name,
                        artist=metadata.get('artist', ''),
                        title=metadata.get('title', ''),
                        album=metadata.get('album', ''),
                        size=stat.st_size,
                        modified=datetime.fromtimestamp(stat.st_mtime)
                    )

                    indexed_count += 1

                    if indexed_count % 100 == 0:
                        logger.info(f"Indexed {indexed_count} files...")

                except Exception as e:
                    logger.error(f"Error indexing {file_path}: {e}")
                    continue

            writer.commit()
            logger.info(f"Successfully indexed {indexed_count} files from {directory}")

        except Exception as e:
            writer.cancel()
            logger.error(f"Error during indexing: {e}")
            raise

        return indexed_count

    def index_multiple_directories(self, directories: List[Path]) -> int:
        """Index multiple directories"""
        total = 0
        for directory in directories:
            if directory.exists() and directory.is_dir():
                total += self.index_directory(directory)
        return total

    def search(self, query: str, limit: int = 100) -> List[SearchResult]:
        """
        Search indexed files with improved Unicode/Hebrew support
        Returns list of SearchResult objects
        """
        if not query.strip():
            return []

        results = []

        try:
            # Normalize query for better matching
            query = ' '.join(query.split())  # Remove extra whitespace

            # Create parser for multiple fields
            parser = MultifieldParser(
                ['filename', 'artist', 'title', 'album'],
                schema=self.ix.schema,
                group=OrGroup
            )

            parsed_query = parser.parse(query)

            with self.ix.searcher() as searcher:
                hits = searcher.search(parsed_query, limit=limit)

                for hit in hits:
                    try:
                        file_path = Path(hit['path'])

                        # Skip if file no longer exists
                        if not file_path.exists():
                            continue

                        # Get metadata
                        metadata = {
                            'artist': hit.get('artist', ''),
                            'title': hit.get('title', ''),
                            'album': hit.get('album', '')
                        }

                        # Remove empty metadata
                        metadata = {k: v for k, v in metadata.items() if v}

                        result = SearchResult(
                            source='local',
                            file_id=hit['path'],
                            filename=hit['filename'],
                            path=hit['path'],
                            size=hit['size'],
                            modified_date=hit['modified'],
                            file_type=file_path.suffix,
                            metadata=metadata
                        )

                        results.append(result)

                    except Exception as e:
                        logger.error(f"Error processing search result: {e}")
                        continue

        except Exception as e:
            logger.error(f"Error searching: {e}")

        return results

    def get_index_stats(self) -> dict:
        """Get statistics about the index"""
        with self.ix.searcher() as searcher:
            return {
                'total_files': searcher.doc_count_all(),
                'index_size_mb': sum(f.stat().st_size for f in self.index_dir.glob('*')) / (1024 * 1024),
                'last_updated': datetime.fromtimestamp(max(
                    f.stat().st_mtime for f in self.index_dir.glob('*')
                )) if list(self.index_dir.glob('*')) else None
            }

    def clear_index(self):
        """Clear the entire index"""
        writer = self.ix.writer()
        writer.commit(merge=True, optimize=True, mergetype='CLEAR')
        logger.info("Index cleared")

    @staticmethod
    def _extract_metadata(file_path: Path) -> dict:
        """Extract audio metadata using mutagen"""
        metadata = {}

        try:
            audio = MutagenFile(str(file_path), easy=True)

            if audio is None:
                return metadata

            # Extract common tags
            if hasattr(audio, 'get'):
                metadata['artist'] = audio.get('artist', [''])[0] if audio.get('artist') else ''
                metadata['title'] = audio.get('title', [''])[0] if audio.get('title') else ''
                metadata['album'] = audio.get('album', [''])[0] if audio.get('album') else ''
                metadata['year'] = audio.get('date', [''])[0] if audio.get('date') else ''

        except Exception as e:
            logger.debug(f"Could not extract metadata from {file_path}: {e}")

        return metadata

    @staticmethod
    def get_default_music_directories() -> List[Path]:
        """Get default directories to index on the system"""
        directories = []
        home = Path.home()

        # Common music directories
        possible_dirs = [
            home / 'Music',
            home / 'Downloads',
            home / 'Documents' / 'Music',
            Path('/Users/Shared/Music')  # macOS shared music
        ]

        # Add only existing directories
        for dir_path in possible_dirs:
            if dir_path.exists() and dir_path.is_dir():
                directories.append(dir_path)

        return directories
