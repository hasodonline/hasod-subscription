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

    /// Download a Spotify track (tries Deezer first, falls back to YouTube)
    /// Returns the path to the downloaded file
    pub async fn download_track(
        app: &tauri::AppHandle,
        url: &str,
        base_output_dir: &str,
        download_context: &crate::download::DownloadContext,
        job_id: &str,
        update_status_fn: impl Fn(&str, crate::download::DownloadStatus, f32, &str),
        emit_queue_fn: impl Fn(),
        update_metadata_fn: impl Fn(crate::download::TrackMetadata),
    ) -> Result<String, String> {
        use crate::auth::get_auth_from_keychain;
        use crate::download::services::{DeezerDownloader, YouTubeDownloader};
        use crate::download::{DownloadStatus, TrackMetadata};
        use tauri_plugin_shell::ShellExt;

        println!("[Spotify] Using backend API for metadata extraction");

        update_status_fn(job_id, DownloadStatus::Downloading, 5.0, "Getting track info...");
        emit_queue_fn();

        // Step 1: Get metadata from backend API
        let spotify_metadata = Self::get_metadata_from_api(url).await?;

        // Step 2: Update job metadata
        let track_metadata = TrackMetadata {
            title: spotify_metadata.name.clone(),
            artist: spotify_metadata.artist.clone(),
            album: spotify_metadata.album.clone(),
            duration: Some((spotify_metadata.duration_ms / 1000) as u32),
            thumbnail: Some(spotify_metadata.image_url.clone()),
        };
        update_metadata_fn(track_metadata.clone());

        // Step 3: Calculate output path
        let output_path = crate::utils::filesystem::get_organized_output_path(
            base_output_dir,
            &track_metadata,
            download_context,
        );
        let output_path_str = output_path.to_string_lossy().to_string();

        // Step 4: Try Deezer download first
        println!("[Spotify] Attempting Deezer download using ISRC: {}", spotify_metadata.isrc);
        update_status_fn(job_id, DownloadStatus::Downloading, 10.0, "Trying Deezer...");
        emit_queue_fn();

        let auth_token = get_auth_from_keychain()
            .map(|auth| auth.id_token)
            .unwrap_or_default();

        if !auth_token.is_empty() {
            println!("[Spotify] Using auth token for Deezer API call");

            match DeezerDownloader::download_and_decrypt(
                app,
                &spotify_metadata.isrc,
                &auth_token,
                &output_path_str,
                Some(&spotify_metadata.image_url),
            )
            .await
            {
                Ok(deezer_file_path) => {
                    println!("[Spotify] ✅ Deezer download successful!");
                    println!("[Spotify] File ready at: {}", deezer_file_path);

                    update_status_fn(job_id, DownloadStatus::Complete, 100.0, "Download complete");
                    emit_queue_fn();

                    return Ok(deezer_file_path);
                }
                Err(e) => {
                    println!("[Spotify] ⚠️ Deezer download failed: {}", e);
                    println!("[Spotify] Falling back to YouTube search...");
                }
            }
        } else {
            println!("[Spotify] No auth token, skipping Deezer, using YouTube fallback");
        }

        // Step 5: Fallback to YouTube
        println!(
            "[Spotify] Searching YouTube for: {} - {} (Album: {})",
            spotify_metadata.artist, spotify_metadata.name, spotify_metadata.album
        );

        update_status_fn(
            job_id,
            DownloadStatus::Downloading,
            15.0,
            &format!("Searching: {}", spotify_metadata.name),
        );
        emit_queue_fn();

        let youtube_url = YouTubeDownloader::find_best_source(
            app,
            &spotify_metadata.artist,
            &spotify_metadata.name,
            job_id,
            &update_status_fn,
            &emit_queue_fn,
        )
        .await?;

        println!("[Spotify] Found YouTube match: {}", youtube_url);

        // Step 6: Download from YouTube using yt-dlp
        let output_dir = output_path.parent().unwrap().to_string_lossy().to_string();
        std::fs::create_dir_all(&output_dir)
            .map_err(|e| format!("Failed to create directory: {}", e))?;

        let output_template = format!("{}/%(title)s.%(ext)s", output_dir);

        let sidecar = app.shell().sidecar("yt-dlp")
            .map_err(|e| format!("Failed to get yt-dlp sidecar: {}", e))?;

        let args: Vec<&str> = vec![
            &youtube_url,
            "-f", "bestaudio",
            "--extract-audio",
            "--audio-format", "mp3",
            "--audio-quality", "0",
            "--prefer-free-formats",
            "--embed-thumbnail",
            "--add-metadata",
            "--output", &output_template,
            "--progress",
            "--newline",
            "--no-warnings",
        ];

        let (mut rx, _child) = sidecar.args(args).spawn()
            .map_err(|e| format!("Failed to spawn yt-dlp: {}", e))?;

        update_status_fn(job_id, DownloadStatus::Downloading, 20.0, "Downloading...");

        let mut last_progress: f32 = 20.0;
        let track_title = track_metadata.title.clone();

        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    let line_str = String::from_utf8_lossy(&line).to_string();
                    println!("[yt-dlp] {}", line_str);

                    if let Some(pct) = YouTubeDownloader::parse_ytdlp_progress(&line_str) {
                        last_progress = 20.0 + (pct * 0.7); // 20-90%
                        update_status_fn(
                            job_id,
                            DownloadStatus::Downloading,
                            last_progress,
                            &format!("Downloading... {:.1}%", pct),
                        );
                    }

                    if line_str.contains("[ExtractAudio]") || line_str.contains("[Merger]") {
                        update_status_fn(job_id, DownloadStatus::Converting, 92.0, "Converting to MP3...");
                    }
                }
                tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                    let line_str = String::from_utf8_lossy(&line).to_string();
                    eprintln!("[yt-dlp stderr] {}", line_str);
                }
                tauri_plugin_shell::process::CommandEvent::Error(error) => {
                    update_status_fn(
                        job_id,
                        DownloadStatus::Error,
                        last_progress,
                        &format!("Error: {}", error),
                    );
                    return Err(format!("yt-dlp error: {}", error));
                }
                tauri_plugin_shell::process::CommandEvent::Terminated(payload) => {
                    if payload.code != Some(0) {
                        let error_msg = format!("yt-dlp exited with code: {:?}", payload.code);
                        update_status_fn(job_id, DownloadStatus::Error, last_progress, &error_msg);
                        return Err(error_msg);
                    }
                    break;
                }
                _ => {}
            }
        }

        update_status_fn(job_id, DownloadStatus::Complete, 100.0, "Download complete!");
        emit_queue_fn();

        Ok(output_path_str)
    }
}
