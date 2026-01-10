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

    /// Download a YouTube video/track directly
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
        use crate::download::{DownloadStatus, TrackMetadata};
        use tauri_plugin_shell::ShellExt;

        // Step 1: Get metadata
        update_status_fn(job_id, DownloadStatus::Downloading, 8.0, "Fetching metadata...");
        emit_queue_fn();

        let sidecar = app.shell().sidecar("yt-dlp")
            .map_err(|e| format!("Failed to get yt-dlp sidecar: {}", e))?;

        let (mut rx, _child) = sidecar
            .args(["--dump-json", "--no-download", url])
            .spawn()
            .map_err(|e| format!("Failed to spawn yt-dlp: {}", e))?;

        let mut json_output = String::new();
        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    json_output.push_str(&String::from_utf8_lossy(&line));
                }
                tauri_plugin_shell::process::CommandEvent::Terminated(_) => break,
                _ => {}
            }
        }

        let mut metadata = Self::parse_ytdlp_metadata(&json_output);

        // For Spotify-style titles (Artist - Title), extract artist
        if metadata.artist == "Unknown Artist" {
            if let Some(dash_pos) = metadata.title.find(" - ") {
                let artist = metadata.title[..dash_pos].trim().to_string();
                let title = metadata.title[dash_pos + 3..].trim().to_string();
                if !artist.is_empty() {
                    metadata.artist = artist;
                    metadata.title = title;
                }
            }
        }

        // Step 2: Update job metadata
        update_metadata_fn(metadata.clone());
        emit_queue_fn();

        println!(
            "[YouTube] Title: '{}', Artist: '{}', Album: '{}'",
            metadata.title, metadata.artist, metadata.album
        );

        // Step 3: Calculate output path
        let output_path = crate::utils::filesystem::get_organized_output_path(
            base_output_dir,
            &metadata,
            download_context,
        );
        let output_dir = output_path.parent().unwrap().to_string_lossy().to_string();

        std::fs::create_dir_all(&output_dir)
            .map_err(|e| format!("Failed to create directory: {}", e))?;

        let output_template = format!("{}/%(title)s.%(ext)s", output_dir);

        // Step 4: Build yt-dlp command
        let sidecar = app.shell().sidecar("yt-dlp")
            .map_err(|e| format!("Failed to get yt-dlp sidecar: {}", e))?;

        let args: Vec<&str> = vec![
            url,
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

        update_status_fn(job_id, DownloadStatus::Downloading, 5.0, "Downloading...");

        // Step 5: Listen to progress
        let mut last_progress: f32 = 5.0;
        let track_title = metadata.title.clone();

        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    let line_str = String::from_utf8_lossy(&line).to_string();
                    println!("[yt-dlp] {}", line_str);

                    if let Some(pct) = Self::parse_ytdlp_progress(&line_str) {
                        last_progress = pct * 0.9;
                        update_status_fn(
                            job_id,
                            DownloadStatus::Downloading,
                            last_progress,
                            &format!("Downloading... {:.1}%", pct),
                        );
                        // Emit queue update for real-time UI refresh
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
