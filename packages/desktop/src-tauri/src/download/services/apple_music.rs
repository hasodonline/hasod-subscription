// Apple Music download service (via iTunes API + YouTube fallback)

use serde::{Deserialize, Serialize};

// ============================================================================
// Types
// ============================================================================

/// Apple Music track metadata
#[derive(Debug, Clone)]
pub struct AppleMusicTrackInfo {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub artwork_url: Option<String>,
}

// ============================================================================
// Apple Music Downloader
// ============================================================================

pub struct AppleMusicDownloader;

impl AppleMusicDownloader {
    /// Extract track ID from Apple Music URL
    /// Formats:
    /// - https://music.apple.com/us/album/song-name/1234567890?i=1234567891
    /// - https://music.apple.com/us/song/song-name/1234567891
    pub fn extract_track_id(url: &str) -> Option<String> {
        // Check for ?i= parameter (song within album)
        if let Some(pos) = url.find("?i=") {
            let id_start = pos + 3;
            let id_end = url[id_start..].find('&').map(|p| id_start + p).unwrap_or(url.len());
            let id = &url[id_start..id_end];
            if !id.is_empty() && id.chars().all(|c| c.is_ascii_digit()) {
                return Some(id.to_string());
            }
        }

        // Check for /song/ URL format
        if url.contains("/song/") {
            let parts: Vec<&str> = url.split('/').collect();
            if let Some(last) = parts.last() {
                // Remove query string if present
                let id = last.split('?').next().unwrap_or(last);
                if !id.is_empty() && id.chars().all(|c| c.is_ascii_digit()) {
                    return Some(id.to_string());
                }
            }
        }

        None
    }

    /// Get Apple Music track info using iTunes Lookup API (no authentication required)
    /// Returns (search_query, artist, track_info)
    pub async fn get_track_info(url: &str) -> Result<(String, String, Option<AppleMusicTrackInfo>), String> {
        // Validate URL type
        let url_lower = url.to_lowercase();
        if url_lower.contains("/artist/") && !url_lower.contains("?i=") {
            return Err("Artist pages cannot be downloaded. Please use a specific song URL.".to_string());
        }
        if url_lower.contains("/playlist/") {
            return Err("Playlist pages are not yet supported. Please use individual song URLs.".to_string());
        }

        // Extract track ID
        let track_id = Self::extract_track_id(url)
            .ok_or_else(|| "Could not extract track ID from Apple Music URL. Please use a direct song link.".to_string())?;

        println!("[AppleMusic] Extracted track ID: {}", track_id);

        // Use iTunes Lookup API (no authentication required!)
        let lookup_url = format!("https://itunes.apple.com/lookup?id={}&entity=song", track_id);

        let client = reqwest::Client::new();
        let response = client
            .get(&lookup_url)
            .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")
            .send()
            .await
            .map_err(|e| format!("iTunes API request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("iTunes API error: {}", response.status()));
        }

        let json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse iTunes response: {}", e))?;

        // iTunes API returns { resultCount: N, results: [...] }
        let results = json.get("results")
            .and_then(|v| v.as_array())
            .ok_or("No results in iTunes response")?;

        if results.is_empty() {
            return Err("Song not found in iTunes database".to_string());
        }

        // First result is usually the track
        let track = &results[0];

        let title = track.get("trackName")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown")
            .to_string();

        let artist = track.get("artistName")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Artist")
            .to_string();

        let album = track.get("collectionName")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Album")
            .to_string();

        // Get artwork URL (replace size for higher quality)
        let artwork_url = track.get("artworkUrl100")
            .and_then(|v| v.as_str())
            .map(|url| url.replace("100x100", "600x600"));

        println!("[AppleMusic] Found: '{}' by '{}' from '{}'", title, artist, album);

        let search_query = format!("{} - {}", artist, title);
        let info = AppleMusicTrackInfo {
            title,
            artist: artist.clone(),
            album,
            artwork_url,
        };

        Ok((search_query, artist, Some(info)))
    }
}
