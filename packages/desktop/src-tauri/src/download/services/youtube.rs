// YouTube download service using yt-dlp

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

use crate::download::{TrackMetadata, DownloadStatus};

// ============================================================================
// YouTube Quality Search Strategy
// ============================================================================

/// Quality tier for YouTube sources (higher = better)
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
enum YouTubeSourceTier {
    Regular = 0,      // Any result
    OfficialAudio = 1, // "official audio" in title
    VEVO = 2,         // VEVO channel
    Topic = 3,        // Artist - Topic channel (Art Tracks, best quality)
}

/// YouTube search result with quality info
#[derive(Debug, Clone)]
struct YouTubeSearchResult {
    url: String,
    title: String,
    uploader: String,
    tier: YouTubeSourceTier,
    audio_bitrate: Option<u32>,
    duration_secs: Option<u64>,  // Video duration in seconds for verification
}

/// Analyze a yt-dlp JSON result to determine quality tier
fn analyze_youtube_result(json: &serde_json::Value) -> Option<YouTubeSearchResult> {
    let url = json.get("webpage_url")
        .or_else(|| json.get("url"))
        .and_then(|v| v.as_str())?
        .to_string();

    let title = json.get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown")
        .to_string();

    let uploader = json.get("uploader")
        .or_else(|| json.get("channel"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let description = json.get("description")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    // Determine quality tier
    let tier = if uploader.ends_with(" - Topic") {
        YouTubeSourceTier::Topic
    } else if uploader.contains("VEVO") || uploader.ends_with("VEVO") {
        YouTubeSourceTier::VEVO
    } else if title.to_lowercase().contains("official audio")
           || title.to_lowercase().contains("official music")
           || description.contains("Provided to YouTube") {
        YouTubeSourceTier::OfficialAudio
    } else {
        YouTubeSourceTier::Regular
    };

    // Try to get audio bitrate
    let audio_bitrate = json.get("abr")
        .and_then(|v| v.as_f64())
        .map(|v| v as u32);

    // Get video duration in seconds
    let duration_secs = json.get("duration")
        .and_then(|v| v.as_f64())
        .map(|v| v as u64);

    Some(YouTubeSearchResult {
        url,
        title,
        uploader: uploader.to_string(),
        tier,
        audio_bitrate,
        duration_secs,
    })
}

// ============================================================================
// YouTube Downloader
// ============================================================================

pub struct YouTubeDownloader;

impl YouTubeDownloader {
    /// Parse yt-dlp progress output to extract percentage
    pub fn parse_ytdlp_progress(line: &str) -> Option<f32> {
        // Format: [download]  45.2% of 10.00MiB at 1.00MiB/s ETA 00:05
        if line.contains("[download]") && line.contains("%") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            for part in parts {
                if part.ends_with('%') {
                    if let Ok(pct) = part.trim_end_matches('%').parse::<f32>() {
                        return Some(pct);
                    }
                }
            }
        }
        None
    }

    /// Parse yt-dlp metadata output
    pub fn parse_ytdlp_metadata(json_str: &str) -> TrackMetadata {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(json_str) {
            TrackMetadata {
                title: json.get("title").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string(),
                artist: json.get("artist")
                    .or_else(|| json.get("uploader"))
                    .or_else(|| json.get("channel"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown Artist")
                    .to_string(),
                album: json.get("album")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown Album")
                    .to_string(),
                duration: json.get("duration").and_then(|v| v.as_u64()).map(|d| d as u32),
                thumbnail: json.get("thumbnail").and_then(|v| v.as_str()).map(|s| s.to_string()),
            }
        } else {
            TrackMetadata::default()
        }
    }

    /// Search YouTube with multiple strategies to find the best quality source
    /// Returns the URL of the best matching video
    pub async fn find_best_source(
        app: &AppHandle,
        artist: &str,
        title: &str,
        job_id: &str,
        update_status_fn: impl Fn(&str, DownloadStatus, f32, &str),
        emit_queue_fn: impl Fn(),
    ) -> Result<String, String> {
        // Search queries in priority order
        let search_queries = vec![
            // Priority 1: Exact match targeting Topic channels (Art Tracks)
            format!("{} {} topic", artist, title),
            // Priority 2: Official audio
            format!("{} {} official audio", artist, title),
            // Priority 3: Artist + Title (standard)
            format!("{} {}", artist, title),
        ];

        let mut best_result: Option<YouTubeSearchResult> = None;

        for (idx, query) in search_queries.iter().enumerate() {
            let progress = 5.0 + (idx as f32 * 2.0);
            update_status_fn(job_id, DownloadStatus::Downloading, progress,
                &format!("Searching: {} ({}/{})", query, idx + 1, search_queries.len()));
            emit_queue_fn();

            println!("[Search] Trying query {}: '{}'", idx + 1, query);

            // Search for 5 results to find the best one
            let search_url = format!("ytsearch5:{}", query);

            let sidecar = app.shell().sidecar("yt-dlp")
                .map_err(|e| format!("Failed to get yt-dlp sidecar: {}", e))?;

            let (mut rx, _child) = sidecar
                .args([
                    "--dump-json",
                    "--no-download",
                    "--flat-playlist",
                    "--no-warnings",
                    &search_url
                ])
                .spawn()
                .map_err(|e| format!("Failed to spawn yt-dlp: {}", e))?;

            let mut json_lines = Vec::new();
            let mut current_line = String::new();

            while let Some(event) = rx.recv().await {
                match event {
                    tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                        let line_str = String::from_utf8_lossy(&line).to_string();
                        current_line.push_str(&line_str);

                        // Try to parse complete JSON objects
                        if current_line.trim().ends_with('}') {
                            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&current_line) {
                                json_lines.push(json);
                            }
                            current_line.clear();
                        }
                    }
                    tauri_plugin_shell::process::CommandEvent::Terminated(_) => break,
                    _ => {}
                }
            }

            // Analyze results from this search
            for json in &json_lines {
                if let Some(result) = analyze_youtube_result(json) {
                    println!("[Search] Found: '{}' by '{}' - Tier: {:?}",
                        result.title, result.uploader, result.tier);

                    // Keep if this is better than what we have
                    let dominated = best_result.as_ref().is_some_and(|best| result.tier <= best.tier);
                    if !dominated {
                        // Found a Topic channel - this is the best, stop searching
                        if result.tier == YouTubeSourceTier::Topic {
                            println!("[Search] Found Topic channel (best quality) - stopping search");
                            return Ok(result.url);
                        }
                        best_result = Some(result);
                    }
                }
            }

            // If we found VEVO, that's good enough - no need to try more queries
            if best_result.as_ref().is_some_and(|r| r.tier == YouTubeSourceTier::VEVO) {
                println!("[Search] Found VEVO channel - good enough");
                break;
            }
        }

        // Return the best result we found
        match best_result {
            Some(result) => {
                println!("[Search] Best result: '{}' by '{}' (Tier: {:?})",
                    result.title, result.uploader, result.tier);
                Ok(result.url)
            }
            None => {
                // Fallback: just use first result from basic search
                println!("[Search] No results found, using fallback");
                Ok(format!("ytsearch1:{} {}", artist, title))
            }
        }
    }

    /// Extract playlist information and return video URLs
    pub async fn extract_playlist_urls(
        app: &AppHandle,
        playlist_url: &str,
    ) -> Result<(String, Vec<String>), String> {
        println!("[YouTube Playlist] Processing: {}", playlist_url);

        // Use yt-dlp to extract playlist info
        let sidecar = app.shell().sidecar("yt-dlp")
            .map_err(|e| format!("Failed to get yt-dlp: {}", e))?;

        let (mut rx, _child) = sidecar
            .args(&[
                "--flat-playlist",
                "--dump-json",
                playlist_url,
            ])
            .spawn()
            .map_err(|e| format!("Failed to spawn yt-dlp: {}", e))?;

        let mut playlist_name = String::from("Unknown Playlist");
        let mut video_urls = Vec::new();

        // Collect JSON output
        let mut json_lines = Vec::new();
        while let Some(event) = rx.recv().await {
            if let tauri_plugin_shell::process::CommandEvent::Stdout(line) = event {
                json_lines.push(line);
            }
        }

        // Parse JSON lines to extract video URLs and playlist name
        for line in json_lines {
            let line_str = String::from_utf8_lossy(&line);
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line_str) {
                // First entry should have playlist title
                if playlist_name == "Unknown Playlist" {
                    if let Some(playlist_title) = json.get("playlist_title").and_then(|v| v.as_str()) {
                        playlist_name = playlist_title.to_string();
                    }
                }

                // Extract video URL
                if let Some(video_id) = json.get("id").and_then(|v| v.as_str()) {
                    video_urls.push(format!("https://www.youtube.com/watch?v={}", video_id));
                }
            }
        }

        println!("[YouTube Playlist] Playlist: '{}' ({} videos)", playlist_name, video_urls.len());

        if video_urls.is_empty() {
            return Err("No videos found in playlist".to_string());
        }

        Ok((playlist_name, video_urls))
    }
}
