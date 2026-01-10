// Filesystem utilities for path handling and downloads

use std::fs;
use std::path::PathBuf;

/// Sanitize a filename by removing/replacing invalid characters
/// Replaces: / \ : * ? " < > | with underscore
pub fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

/// Get the default download directory for Hasod Downloads
/// Returns: ~/Downloads/Hasod Downloads
pub fn get_download_dir() -> String {
    dirs::download_dir()
        .unwrap_or_else(|| dirs::home_dir().expect("No home dir").join("Downloads"))
        .join("Hasod Downloads")
        .to_string_lossy()
        .to_string()
}

/// Create the download directory if it doesn't exist
pub fn create_download_dir() -> Result<String, String> {
    let download_dir = get_download_dir();
    fs::create_dir_all(&download_dir)
        .map_err(|e| format!("Failed to create download directory: {}", e))?;
    Ok(download_dir)
}

/// Calculate organized output path based on metadata and context
pub fn get_organized_output_path(
    base_dir: &str,
    metadata: &crate::download::TrackMetadata,
    context: &crate::download::DownloadContext,
) -> PathBuf {
    let artist = sanitize_filename(&metadata.artist);
    let title = sanitize_filename(&metadata.title);

    // Filename is always: "artist - song.mp3"
    let filename = if artist.is_empty() || artist == "Unknown Artist" {
        format!("{}.mp3", title)
    } else {
        format!("{} - {}.mp3", artist, title)
    };

    // Determine folder structure based on context
    let path = match context {
        crate::download::DownloadContext::Single => {
            // Single track: /unsorted/
            PathBuf::from(base_dir).join("unsorted")
        }
        crate::download::DownloadContext::Album(_) => {
            // Album: /artist/album name/
            // Use metadata.album (which is transliterated) instead of context album_name
            let album = sanitize_filename(&metadata.album);
            PathBuf::from(base_dir)
                .join(if artist.is_empty() || artist == "Unknown Artist" {
                    "Unknown Artist"
                } else {
                    &artist
                })
                .join(if album.is_empty() {
                    "Unknown Album"
                } else {
                    &album
                })
        }
        crate::download::DownloadContext::Playlist(playlist_name) => {
            // Playlist: /playlist_name/
            let playlist = sanitize_filename(playlist_name);
            PathBuf::from(base_dir).join(if playlist.is_empty() {
                "Unknown Playlist"
            } else {
                &playlist
            })
        }
    };

    // Ensure directory exists
    fs::create_dir_all(&path).ok();

    path.join(filename)
}
