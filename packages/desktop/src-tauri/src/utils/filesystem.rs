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

// Note: get_organized_output_path() will be moved here later when we extract download models
// It depends on TrackMetadata and DownloadContext which are currently in lib.rs
