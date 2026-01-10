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

    /// Download an Apple Music track (via YouTube search)
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
        use crate::download::services::YouTubeDownloader;
        use crate::download::{DownloadStatus, TrackMetadata};
        use tauri_plugin_shell::ShellExt;

        // Step 1: Get track info from iTunes API
        update_status_fn(job_id, DownloadStatus::Downloading, 2.0, "Fetching Apple Music track info...");
        emit_queue_fn();

        let (_search_query_base, _artist, apple_info) = Self::get_track_info(url).await?;

        let (artist, title) = if let Some(ref info) = apple_info {
            (info.artist.clone(), info.title.clone())
        } else {
            let parts: Vec<&str> = _search_query_base.splitn(2, " - ").collect();
            if parts.len() == 2 {
                (parts[0].to_string(), parts[1].to_string())
            } else {
                ("".to_string(), _search_query_base.clone())
            }
        };

        // Step 2: Update job metadata
        let track_metadata = if let Some(ref info) = apple_info {
            TrackMetadata {
                title: info.title.clone(),
                artist: info.artist.clone(),
                album: info.album.clone(),
                duration: None,
                thumbnail: info.artwork_url.clone(),
            }
        } else {
            TrackMetadata {
                title: title.clone(),
                artist: artist.clone(),
                album: String::new(),
                duration: None,
                thumbnail: None,
            }
        };
        update_metadata_fn(track_metadata.clone());

        // Step 3: Find best YouTube source
        println!("[AppleMusic] Finding best YouTube source for: {} - {}", artist, title);
        update_status_fn(
            job_id,
            DownloadStatus::Downloading,
            3.0,
            &format!("Finding best quality: {} - {}", artist, title),
        );
        emit_queue_fn();

        let youtube_url = YouTubeDownloader::find_best_source(
            app,
            &artist,
            &title,
            job_id,
            &update_status_fn,
            &emit_queue_fn,
        )
        .await?;

        println!("[AppleMusic] Best source found: {}", youtube_url);

        // Step 4: Calculate output path
        let output_path = crate::utils::filesystem::get_organized_output_path(
            base_output_dir,
            &track_metadata,
            download_context,
        );
        let output_dir = output_path.parent().unwrap().to_string_lossy().to_string();

        std::fs::create_dir_all(&output_dir)
            .map_err(|e| format!("Failed to create directory: {}", e))?;

        let output_template = format!("{}/%(title)s.%(ext)s", output_dir);

        // Step 5: Download from YouTube using yt-dlp
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

        update_status_fn(job_id, DownloadStatus::Downloading, 10.0, "Downloading...");

        let mut last_progress: f32 = 10.0;
        let track_title = track_metadata.title.clone();

        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    let line_str = String::from_utf8_lossy(&line).to_string();
                    println!("[yt-dlp] {}", line_str);

                    if let Some(pct) = YouTubeDownloader::parse_ytdlp_progress(&line_str) {
                        last_progress = 10.0 + (pct * 0.8); // 10-90%
                        update_status_fn(
                            job_id,
                            DownloadStatus::Downloading,
                            last_progress,
                            &format!("Downloading... {:.1}%", pct),
                        );
                        // Real-time UI update
                        emit_queue_fn();
                    }

                    if line_str.contains("[ExtractAudio]") || line_str.contains("[Merger]") {
                        update_status_fn(job_id, DownloadStatus::Converting, 92.0, "Converting to MP3...");
                        emit_queue_fn();
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

        Ok(output_path.to_string_lossy().to_string())
    }
}
