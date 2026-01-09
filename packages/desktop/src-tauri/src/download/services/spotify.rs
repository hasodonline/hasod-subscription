// Spotify download service

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

use crate::api_types::{HasodApiClient, SpotifyTrackMetadata};

// Spotify API credentials (loaded from environment at compile time)
pub const SPOTIFY_CLIENT_ID_DEFAULT: &str = "c6b23f1e91f84b6a9361de16aba0ae17";
pub const SPOTIFY_CLIENT_SECRET_DEFAULT: &str = "237e355acaa24636abc79f1a089e6204";
pub const SPOTIFY_CLIENT_ID: Option<&str> = option_env!("HASOD_SPOTIFY_CLIENT_ID");
pub const SPOTIFY_CLIENT_SECRET: Option<&str> = option_env!("HASOD_SPOTIFY_CLIENT_SECRET");

// Cached Spotify token (access_token, expires_at)
static SPOTIFY_TOKEN_CACHE: std::sync::LazyLock<Arc<Mutex<Option<(String, i64)>>>> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(None)));

// ============================================================================
// Types
// ============================================================================

/// Spotify track metadata from Web API
#[derive(Debug, Clone)]
pub struct SpotifyTrackInfo {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub thumbnail: Option<String>,
    pub duration_ms: Option<u64>,  // Track duration in milliseconds for verification
}

// ============================================================================
// Spotify Downloader
// ============================================================================

pub struct SpotifyDownloader;

impl SpotifyDownloader {
    /// Get Spotify access token using Client Credentials flow
    pub async fn get_access_token() -> Result<String, String> {
        let client_id = SPOTIFY_CLIENT_ID.ok_or("Spotify Client ID not configured")?;
        let client_secret = SPOTIFY_CLIENT_SECRET.ok_or("Spotify Client Secret not configured")?;

        // Check cache first
        {
            let cache = SPOTIFY_TOKEN_CACHE.lock().map_err(|e| format!("Lock error: {}", e))?;
            if let Some((token, expires_at)) = cache.as_ref() {
                let now = chrono::Utc::now().timestamp();
                if *expires_at > now + 60 {  // 60 second buffer
                    println!("[Spotify] Using cached access token");
                    return Ok(token.clone());
                }
            }
        }

        println!("[Spotify] Fetching new access token via Client Credentials");

        // Base64 encode client_id:client_secret
        let credentials = format!("{}:{}", client_id, client_secret);
        let encoded = base64::engine::general_purpose::STANDARD.encode(credentials.as_bytes());

        let client = reqwest::Client::new();
        let response = client
            .post("https://accounts.spotify.com/api/token")
            .header("Authorization", format!("Basic {}", encoded))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body("grant_type=client_credentials")
            .send()
            .await
            .map_err(|e| format!("Spotify token request failed: {}", e))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Spotify token request failed: {}", error_text));
        }

        #[derive(Deserialize)]
        struct TokenResponse {
            access_token: String,
            expires_in: i64,
        }

        let token_data: TokenResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Spotify token response: {}", e))?;

        // Cache the token
        let expires_at = chrono::Utc::now().timestamp() + token_data.expires_in;
        {
            let mut cache = SPOTIFY_TOKEN_CACHE.lock().map_err(|e| format!("Lock error: {}", e))?;
            *cache = Some((token_data.access_token.clone(), expires_at));
        }

        println!("[Spotify] Got new access token, expires in {} seconds", token_data.expires_in);
        Ok(token_data.access_token)
    }

    /// Extract track ID from Spotify URL
    pub fn extract_track_id(url: &str) -> Option<String> {
        // Handle URLs like:
        // - https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6
        // - https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6?si=xxx
        // - spotify:track:6rqhFgbbKwnb9MLmUQDhG6

        if url.starts_with("spotify:track:") {
            return Some(url.replace("spotify:track:", ""));
        }

        if url.contains("/track/") {
            let parts: Vec<&str> = url.split("/track/").collect();
            if parts.len() > 1 {
                // Remove query string if present
                let id_part = parts[1].split('?').next().unwrap_or(parts[1]);
                return Some(id_part.to_string());
            }
        }

        None
    }

    /// Get Spotify track metadata from our backend API
    /// Uses Groover API (primary) + ISRC Finder (fallback) for complete metadata
    pub async fn get_metadata_from_api(url: &str) -> Result<SpotifyTrackMetadata, String> {
        println!("[Spotify API] Fetching metadata from backend...");

        let api_client = HasodApiClient::production();
        let metadata = api_client.get_spotify_metadata(url).await?;

        println!("[Spotify API] ✅ Got: '{}' by '{}' from album '{}'", metadata.name, metadata.artist, metadata.album);
        println!("[Spotify API] ISRC: {}, Duration: {}ms", metadata.isrc, metadata.duration_ms);

        Ok(metadata)
    }

    /// Get full track metadata from Spotify Web API
    pub async fn get_track_from_api(track_id: &str) -> Result<SpotifyTrackInfo, String> {
        let token = Self::get_access_token().await?;

        let client = reqwest::Client::new();
        let response = client
            .get(&format!("https://api.spotify.com/v1/tracks/{}", track_id))
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| format!("Spotify API request failed: {}", e))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Spotify API error: {}", error_text));
        }

        let json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Spotify track response: {}", e))?;

        // Extract track info
        let title = json.get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown")
            .to_string();

        // Get artists (join multiple artists with ", ")
        let artist = json.get("artists")
            .and_then(|v| v.as_array())
            .map(|artists| {
                artists.iter()
                    .filter_map(|a| a.get("name").and_then(|n| n.as_str()))
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_else(|| "Unknown Artist".to_string());

        // Get album name
        let album = json.get("album")
            .and_then(|v| v.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Album")
            .to_string();

        // Get thumbnail (prefer 300x300)
        let thumbnail = json.get("album")
            .and_then(|v| v.get("images"))
            .and_then(|v| v.as_array())
            .and_then(|images| {
                // Find 300x300 or take first available
                images.iter()
                    .find(|img| img.get("width").and_then(|w| w.as_u64()) == Some(300))
                    .or_else(|| images.first())
                    .and_then(|img| img.get("url"))
                    .and_then(|url| url.as_str())
                    .map(|s| s.to_string())
            });

        // Get duration in milliseconds
        let duration_ms = json.get("duration_ms")
            .and_then(|v| v.as_u64());

        println!("[Spotify API] Track: '{}' by '{}' from album '{}' ({}ms)", title, artist, album, duration_ms.unwrap_or(0));

        Ok(SpotifyTrackInfo {
            title,
            artist,
            album,
            thumbnail,
            duration_ms,
        })
    }

    /// Extract Spotify track info - uses Web API if credentials available, falls back to oEmbed scraping
    pub async fn get_track_info(url: &str) -> Result<(String, String, Option<SpotifyTrackInfo>), String> {
        // Check if this is a track URL (not artist, album, or playlist)
        let url_lower = url.to_lowercase();
        if url_lower.contains("/artist/") {
            return Err("Artist pages cannot be downloaded. Please use a specific track URL.".to_string());
        }
        if url_lower.contains("/album/") {
            return Err("Album pages are not yet supported. Please use individual track URLs.".to_string());
        }
        if url_lower.contains("/playlist/") {
            return Err("Playlist pages are not yet supported. Please use individual track URLs.".to_string());
        }
        if !url_lower.contains("/track/") && !url_lower.contains("spotify:track:") {
            return Err("Please use a Spotify track URL (e.g., open.spotify.com/track/...).".to_string());
        }

        // Try Spotify Web API first if credentials are configured
        if SPOTIFY_CLIENT_ID.is_some() && SPOTIFY_CLIENT_SECRET.is_some() {
            if let Some(track_id) = Self::extract_track_id(url) {
                match Self::get_track_from_api(&track_id).await {
                    Ok(info) => {
                        // Return search query with artist for better YouTube results
                        let search_query = format!("{} - {}", info.artist, info.title);
                        println!("[Spotify] Using Web API - search query: '{}'", search_query);
                        return Ok((search_query, info.artist.clone(), Some(info)));
                    }
                    Err(e) => {
                        println!("[Spotify] Web API failed, falling back to oEmbed: {}", e);
                    }
                }
            }
        }

        // Fallback: Scrape the embed page for metadata
        Self::get_track_info_from_oembed(url).await
    }

    /// Fallback method: Get track info by scraping the Spotify embed page
    async fn get_track_info_from_oembed(url: &str) -> Result<(String, String, Option<SpotifyTrackInfo>), String> {
        println!("[Spotify] Scraping embed page for metadata (no API credentials configured)");

        let track_id = Self::extract_track_id(url)
            .ok_or("Could not extract Spotify track ID")?;

        let embed_url = format!("https://open.spotify.com/embed/track/{}", track_id);

        let client = reqwest::Client::new();
        let response = client.get(&embed_url)
            .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .send()
            .await
            .map_err(|e| format!("Failed to fetch Spotify embed page: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Spotify embed page failed with status: {}", response.status()));
        }

        let html = response.text().await
            .map_err(|e| format!("Failed to read Spotify embed page: {}", e))?;

        // Extract artist from JSON data in HTML
        let artist = if let Some(artists_start) = html.find("\"artists\":[") {
            let after_artists = &html[artists_start..];
            if let Some(name_start) = after_artists.find("\"name\":\"") {
                let name_start_idx = name_start + 8;
                let after_name = &after_artists[name_start_idx..];
                if let Some(name_end) = after_name.find("\"") {
                    after_name[..name_end].to_string()
                } else {
                    String::new()
                }
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        // Extract title from JSON data
        let title = if let Some(name_start) = html.find("\"name\":\"") {
            let name_start_idx = name_start + 8;
            let after_name = &html[name_start_idx..];
            if let Some(name_end) = after_name.find("\"") {
                after_name[..name_end].to_string()
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        if artist.is_empty() || title.is_empty() {
            println!("[Spotify] Warning: Could not extract full metadata from embed page");
            println!("[Spotify] Artist: '{}', Title: '{}'", artist, title);

            // Return basic search query from URL
            let search_query = format!("spotify:{}", track_id);
            return Ok((search_query, artist, None));
        }

        let search_query = format!("{} - {}", artist, title);
        println!("[Spotify] Scraped metadata - search query: '{}'", search_query);

        Ok((search_query, artist.clone(), Some(SpotifyTrackInfo {
            title,
            artist,
            album: String::new(),
            thumbnail: None,
            duration_ms: None,
        })))
    }
}
