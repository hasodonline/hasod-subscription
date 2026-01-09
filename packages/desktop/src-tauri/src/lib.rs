// Hasod Downloads - Desktop Application
// License validation and download management with Tauri
// OAuth 2.0 + PKCE authentication with device binding
// Multi-service download queue with organized file structure

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

// ============================================================================
// Module Imports
// ============================================================================

mod api_types;
mod auth;
mod download;
mod platform;
mod utils;

// Import API client
use api_types::{HasodApiClient, SpotifyTrackMetadata, DeezerQuality};

// Import auth types and utility functions
use auth::{
    LicenseStatus,
    OAuthStartResult,
    StoredAuth,
    get_auth_from_keychain,
};
// Auth command functions (check_license, etc.) are defined as command wrappers below

// Import download types and functions
use download::{
    DownloadContext, DownloadJob, DownloadProgress, DownloadStatus, MusicService, QueueManager,
    QueueStatus, TrackMetadata, JobProcessor,
};
use download::queue::{DOWNLOAD_QUEUE, QUEUE_PROCESSING};
use download::services::{
    YouTubeDownloader, SpotifyDownloader, DeezerDownloader, AppleMusicDownloader, AppleMusicTrackInfo,
};

// Import platform functions
#[cfg(target_os = "macos")]
use platform::{ClipboardManager, FloatingPanelManager};

// Import utilities
use utils::{
    get_hardware_id, get_or_create_device_uuid, sanitize_filename,
};
// get_download_dir and create_download_dir are defined as command wrappers below

// ============================================================================
// Constants
// ============================================================================

const API_BASE_URL: &str = "https://us-central1-hasod-41a23.cloudfunctions.net/api";
const REQUIRED_SERVICE_ID: &str = "hasod-downloader";

// OAuth and Firebase configuration
const FIREBASE_API_KEY: &str = env!("HASOD_FIREBASE_API_KEY");
const GOOGLE_OAUTH_CLIENT_ID: &str = env!("HASOD_GOOGLE_OAUTH_CLIENT_ID");
const GOOGLE_OAUTH_CLIENT_SECRET: &str = env!("HASOD_GOOGLE_OAUTH_CLIENT_SECRET");

// ============================================================================
// Global State (imported from download::queue module)
// ============================================================================
// DOWNLOAD_QUEUE and QUEUE_PROCESSING are defined in download/queue.rs and imported above

// ============================================================================
// Helper Functions for Download Orchestration
// ============================================================================

/// Update job status in queue
fn update_job_status(job_id: &str, status: DownloadStatus, progress: f32, message: &str) {
    if let Ok(mut queue) = DOWNLOAD_QUEUE.lock() {
        if let Some(job) = queue.iter_mut().find(|j| j.id == job_id) {
            job.status = status;
            job.progress = progress;
            job.message = message.to_string();
        }
    }
}

/// Calculate organized output path based on metadata and context
fn get_organized_output_path(
    base_dir: &str,
    metadata: &TrackMetadata,
    context: &DownloadContext,
) -> PathBuf {
    use utils::filesystem::sanitize_filename;

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
        DownloadContext::Single => {
            // Single track: /unsorted/
            PathBuf::from(base_dir).join("unsorted")
        }
        DownloadContext::Album(album_name) => {
            // Album: /artist/album name/
            let album = sanitize_filename(album_name);
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
        DownloadContext::Playlist(playlist_name) => {
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

/// Parse yt-dlp progress output to extract percentage
fn parse_ytdlp_progress(line: &str) -> Option<f32> {
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
fn parse_ytdlp_metadata(json_str: &str) -> TrackMetadata {
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(json_str) {
        TrackMetadata {
            title: json
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string(),
            artist: json
                .get("artist")
                .or_else(|| json.get("uploader"))
                .or_else(|| json.get("channel"))
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown Artist")
                .to_string(),
            album: json
                .get("album")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown Album")
                .to_string(),
            duration: json.get("duration").and_then(|v| v.as_u64()).map(|d| d as u32),
            thumbnail: json
                .get("thumbnail")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
        }
    } else {
        TrackMetadata::default()
    }
}

// ============================================================================
// YouTube Source Quality Detection
// ============================================================================

#[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]
enum YouTubeSourceTier {
    Topic = 1,   // Best: "Artist - Topic" channels (Art Tracks)
    VEVO = 2,    // Good: Official VEVO channels
    Official = 3, // OK: Other official channels with "Official Audio"
    Other = 4,   // Fallback: Everything else
}

#[derive(Debug)]
struct YouTubeSearchResult {
    url: String,
    title: String,
    uploader: String,
    tier: YouTubeSourceTier,
}

/// Analyze a YouTube search result to determine quality tier
fn analyze_youtube_result(json: &serde_json::Value) -> Option<YouTubeSearchResult> {
    let url = json.get("url").and_then(|v| v.as_str())?;
    let title = json.get("title").and_then(|v| v.as_str()).unwrap_or("");
    let uploader = json
        .get("uploader")
        .or_else(|| json.get("channel"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let uploader_lower = uploader.to_lowercase();
    let title_lower = title.to_lowercase();

    // Determine tier
    let tier = if uploader_lower.contains(" - topic") || uploader_lower.ends_with(" topic") {
        YouTubeSourceTier::Topic
    } else if uploader_lower.contains("vevo") {
        YouTubeSourceTier::VEVO
    } else if title_lower.contains("official audio")
        || title_lower.contains("official video")
        || uploader_lower.contains("official")
    {
        YouTubeSourceTier::Official
    } else {
        YouTubeSourceTier::Other
    };

    Some(YouTubeSearchResult {
        url: url.to_string(),
        title: title.to_string(),
        uploader: uploader.to_string(),
        tier,
    })
}

/// Find best YouTube source using multi-tier search strategy
async fn find_best_youtube_source(
    app: &AppHandle,
    artist: &str,
    title: &str,
    job_id: &str,
) -> Result<String, String> {
    use tauri_plugin_shell::ShellExt;

    // Search queries in priority order
    let search_queries = vec![
        format!("{} {} topic", artist, title),
        format!("{} {} official audio", artist, title),
        format!("{} {}", artist, title),
    ];

    let mut best_result: Option<YouTubeSearchResult> = None;

    for (idx, query) in search_queries.iter().enumerate() {
        let progress = 5.0 + (idx as f32 * 2.0);
        update_job_status(
            job_id,
            DownloadStatus::Downloading,
            progress,
            &format!("Searching: {} ({}/{})", query, idx + 1, search_queries.len()),
        );
        app.emit("queue-update", get_queue_status().ok()).ok();

        println!("[Search] Trying query {}: '{}'", idx + 1, query);

        let search_url = format!("ytsearch5:{}", query);

        let sidecar = app
            .shell()
            .sidecar("yt-dlp")
            .map_err(|e| format!("Failed to get yt-dlp sidecar: {}", e))?;

        let (mut rx, _child) = sidecar
            .args([
                "--dump-json",
                "--no-download",
                "--flat-playlist",
                "--no-warnings",
                &search_url,
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

                    if current_line.trim().ends_with('}') {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&current_line)
                        {
                            json_lines.push(json);
                        }
                        current_line.clear();
                    }
                }
                tauri_plugin_shell::process::CommandEvent::Terminated(_) => break,
                _ => {}
            }
        }

        // Analyze results
        for json in &json_lines {
            if let Some(result) = analyze_youtube_result(json) {
                println!(
                    "[Search] Found: '{}' by '{}' - Tier: {:?}",
                    result.title, result.uploader, result.tier
                );

                let dominated = best_result
                    .as_ref()
                    .is_some_and(|best| result.tier <= best.tier);
                if !dominated {
                    if result.tier == YouTubeSourceTier::Topic {
                        println!("[Search] Found Topic channel (best quality) - stopping search");
                        return Ok(result.url);
                    }
                    best_result = Some(result);
                }
            }
        }

        if best_result
            .as_ref()
            .is_some_and(|r| r.tier == YouTubeSourceTier::VEVO)
        {
            println!("[Search] Found VEVO channel - good enough");
            break;
        }
    }

    match best_result {
        Some(result) => {
            println!(
                "[Search] Best result: '{}' by '{}' (Tier: {:?})",
                result.title, result.uploader, result.tier
            );
            Ok(result.url)
        }
        None => {
            println!("[Search] No results found, using fallback");
            Ok(format!("ytsearch1:{} {}", artist, title))
        }
    }
}

// ============================================================================
// Download Processing (Orchestration)
// ============================================================================

/// Process a single download job - orchestrates service-specific downloads
async fn process_download_job(
    app: &AppHandle,
    job_id: String,
    base_output_dir: String,
) -> Result<String, String> {
    use tauri_plugin_shell::ShellExt;

    // Get job details
    let (url, service, initial_title, download_context) = {
        let queue = DOWNLOAD_QUEUE
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        let job = queue.iter().find(|j| j.id == job_id).ok_or("Job not found")?;
        (
            job.url.clone(),
            job.service.clone(),
            job.metadata.title.clone(),
            job.download_context.clone(),
        )
    };

    // Helper to get queued count for floating panel
    let get_queued_count = || -> usize {
        DOWNLOAD_QUEUE
            .lock()
            .map(|q| {
                q.iter()
                    .filter(|j| j.status == DownloadStatus::Queued)
                    .count()
            })
            .unwrap_or(0)
    };

    // Update job to downloading
    update_job_status(
        &job_id,
        DownloadStatus::Downloading,
        0.0,
        "Starting download...",
    );
    if let Ok(mut queue) = DOWNLOAD_QUEUE.lock() {
        if let Some(job) = queue.iter_mut().find(|j| j.id == job_id) {
            job.started_at = Some(chrono::Utc::now().timestamp());
        }
    }

    app.emit("queue-update", get_queue_status().ok()).ok();

    #[cfg(target_os = "macos")]
    {
        // Use FloatingPanelManager::update_status() instead
        FloatingPanelManager::update_status("fetching", 1.0, &initial_title, get_queued_count());
    }

    println!(
        "[Download] Starting {} download for job {}",
        service.display_name(),
        job_id
    );

    // Service-specific URL resolution
    let mut apple_music_metadata: Option<download::services::apple_music::AppleMusicTrackInfo> = None;

    let download_url = if service == MusicService::Spotify {
        // Spotify: Use backend API for metadata + try Deezer first, fallback to YouTube
        println!("[Spotify] Using backend API for metadata extraction");

        update_job_status(
            &job_id,
            DownloadStatus::Downloading,
            5.0,
            "Getting track info...",
        );
        #[cfg(target_os = "macos")]
        {
            // Use FloatingPanelManager::update_status() instead
            FloatingPanelManager::update_status("fetching", 5.0, "Fetching metadata...", get_queued_count());
        }

        let spotify_metadata = match SpotifyDownloader::get_metadata_from_api(&url).await {
            Ok(metadata) => metadata,
            Err(e) => {
                let error_msg = format!("Failed to get Spotify metadata: {}", e);
                println!("[Spotify] {}", error_msg);
                update_job_status(&job_id, DownloadStatus::Error, 0.0, &error_msg);
                if let Ok(mut queue) = DOWNLOAD_QUEUE.lock() {
                    if let Some(job) = queue.iter_mut().find(|j| j.id == job_id) {
                        job.error = Some(error_msg.clone());
                    }
                }
                app.emit("queue-update", get_queue_status().ok()).ok();
                #[cfg(target_os = "macos")]
                {
                    // Use FloatingPanelManager::update_status() instead
                    FloatingPanelManager::update_status("error", 0.0, "Error", get_queued_count());
                }
                return Err(error_msg);
            }
        };

        // Update metadata in queue
        {
            let mut queue = DOWNLOAD_QUEUE
                .lock()
                .map_err(|e| format!("Lock error: {}", e))?;
            if let Some(job) = queue.iter_mut().find(|j| j.id == job_id) {
                job.metadata.title = spotify_metadata.name.clone();
                job.metadata.artist = spotify_metadata.artist.clone();
                job.metadata.album = spotify_metadata.album.clone();
            }
        }

        // Try Deezer download first
        println!(
            "[Spotify] Attempting Deezer download using ISRC: {}",
            spotify_metadata.isrc
        );
        update_job_status(&job_id, DownloadStatus::Downloading, 10.0, "Trying Deezer...");
        #[cfg(target_os = "macos")]
        {
            // Use FloatingPanelManager::update_status() instead
            FloatingPanelManager::update_status("downloading", 10.0, "Trying Deezer...", get_queued_count());
        }

        let auth_token: String = get_auth_from_keychain()
            .map(|auth| auth.id_token)
            .unwrap_or_default();

        if !auth_token.is_empty() {
            println!("[Spotify] Using auth token for Deezer API call");
            let temp_metadata = TrackMetadata {
                title: spotify_metadata.name.clone(),
                artist: spotify_metadata.artist.clone(),
                album: spotify_metadata.album.clone(),
                duration: Some((spotify_metadata.duration_ms / 1000) as u32),
                thumbnail: Some(spotify_metadata.image_url.clone()),
            };
            let context = download_context.as_ref().unwrap_or(&DownloadContext::Single);
            let output_path = get_organized_output_path(&base_output_dir, &temp_metadata, context);
            let temp_deezer_path = output_path.to_string_lossy().to_string();

            match DeezerDownloader::download_and_decrypt(
                app,
                &spotify_metadata.isrc,
                &auth_token,
                &temp_deezer_path,
                Some(&spotify_metadata.image_url),
            )
            .await
            {
                Ok(deezer_file_path) => {
                    println!("[Spotify] ✅ Deezer download successful!");
                    println!("[Spotify] File ready at: {}", deezer_file_path);

                    update_job_status(&job_id, DownloadStatus::Complete, 100.0, "Download complete");
                    if let Ok(mut queue) = DOWNLOAD_QUEUE.lock() {
                        if let Some(job) = queue.iter_mut().find(|j| j.id == job_id) {
                            job.output_path = Some(deezer_file_path.clone());
                            job.completed_at = Some(chrono::Utc::now().timestamp());
                        }
                    }
                    app.emit("queue-update", get_queue_status().ok()).ok();
                    #[cfg(target_os = "macos")]
                    {
                        // Use FloatingPanelManager::update_status() instead
                        FloatingPanelManager::update_status("complete", 100.0, "Complete", get_queued_count());
                    }

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

        // Fallback to YouTube
        println!(
            "[Spotify] Searching YouTube for: {} - {} (Album: {})",
            spotify_metadata.artist, spotify_metadata.name, spotify_metadata.album
        );

        update_job_status(
            &job_id,
            DownloadStatus::Downloading,
            15.0,
            &format!("Searching: {}", spotify_metadata.name),
        );
        #[cfg(target_os = "macos")]
        {
            // Use FloatingPanelManager::update_status() instead
            FloatingPanelManager::update_status(
                "searching",
                15.0,
                &format!("{} - {}", spotify_metadata.artist, spotify_metadata.name),
                get_queued_count(),
            );
        }

        match find_best_youtube_source(
            app,
            &spotify_metadata.artist,
            &spotify_metadata.name,
            &job_id,
        )
        .await
        {
            Ok(youtube_url) => {
                println!("[Spotify] Found YouTube match: {}", youtube_url);
                youtube_url
            }
            Err(e) => {
                let error_msg = format!("YouTube search failed: {}", e);
                println!("[Spotify] {}", error_msg);
                update_job_status(&job_id, DownloadStatus::Error, 0.0, &error_msg);
                if let Ok(mut queue) = DOWNLOAD_QUEUE.lock() {
                    if let Some(job) = queue.iter_mut().find(|j| j.id == job_id) {
                        job.error = Some(error_msg.clone());
                    }
                }
                app.emit("queue-update", get_queue_status().ok()).ok();
                #[cfg(target_os = "macos")]
                {
                    // Use FloatingPanelManager::update_status() instead
                    FloatingPanelManager::update_status("error", 0.0, "Error", get_queued_count());
                }
                return Err(error_msg);
            }
        }
    } else if service == MusicService::AppleMusic {
        // Apple Music: Use iTunes Lookup API
        update_job_status(
            &job_id,
            DownloadStatus::Downloading,
            2.0,
            "Fetching Apple Music track info...",
        );
        app.emit("queue-update", get_queue_status().ok()).ok();
        #[cfg(target_os = "macos")]
        {
            // Use FloatingPanelManager::update_status() instead
            FloatingPanelManager::update_status(
                "fetching",
                2.0,
                "Getting Apple Music info...",
                get_queued_count(),
            );
        }

        match AppleMusicDownloader::get_track_info(&url).await {
            Ok((_search_query_base, _artist, apple_info)) => {
                apple_music_metadata = apple_info.clone();

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

                println!(
                    "[AppleMusic] Finding best YouTube source for: {} - {}",
                    artist, title
                );
                update_job_status(
                    &job_id,
                    DownloadStatus::Downloading,
                    3.0,
                    &format!("Finding best quality: {} - {}", artist, title),
                );
                app.emit("queue-update", get_queue_status().ok()).ok();
                #[cfg(target_os = "macos")]
                {
                    // Use FloatingPanelManager::update_status() instead
                    FloatingPanelManager::update_status(
                        "searching",
                        3.0,
                        &format!("{} - {}", artist, title),
                        get_queued_count(),
                    );
                }

                match find_best_youtube_source(app, &artist, &title, &job_id).await {
                    Ok(best_url) => {
                        println!("[AppleMusic] Best source found: {}", best_url);
                        best_url
                    }
                    Err(e) => {
                        println!("[AppleMusic] Search failed, using fallback: {}", e);
                        format!("ytsearch1:{} {}", artist, title)
                    }
                }
            }
            Err(e) => {
                println!("[AppleMusic] Failed to get track info: {}", e);
                return Err(e);
            }
        }
    } else {
        url.clone()
    };

    // Get metadata
    let metadata = {
        update_job_status(
            &job_id,
            DownloadStatus::Downloading,
            8.0,
            "Fetching metadata...",
        );
        app.emit("queue-update", get_queue_status().ok()).ok();

        let meta = if let Some(ref apple_info) = apple_music_metadata {
            println!("[Metadata] Using Apple Music/iTunes API metadata");
            TrackMetadata {
                title: apple_info.title.clone(),
                artist: apple_info.artist.clone(),
                album: apple_info.album.clone(),
                duration: None,
                thumbnail: apple_info.artwork_url.clone(),
            }
        } else {
            // Fallback: get metadata from yt-dlp
            let sidecar = app
                .shell()
                .sidecar("yt-dlp")
                .map_err(|e| format!("Failed to get yt-dlp sidecar: {}", e))?;

            let (mut rx, _child) = sidecar
                .args(["--dump-json", "--no-download", &download_url])
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

            let mut yt_meta = parse_ytdlp_metadata(&json_output);

            // For Spotify without API, extract artist from video title
            if service == MusicService::Spotify && yt_meta.artist == "Unknown Artist" {
                if let Some(dash_pos) = yt_meta.title.find(" - ") {
                    let artist = yt_meta.title[..dash_pos].trim().to_string();
                    let title = yt_meta.title[dash_pos + 3..].trim().to_string();
                    if !artist.is_empty() {
                        yt_meta.artist = artist;
                        yt_meta.title = title;
                    }
                }
            }

            yt_meta
        };

        // Update job with metadata
        {
            let mut queue = DOWNLOAD_QUEUE
                .lock()
                .map_err(|e| format!("Lock error: {}", e))?;
            if let Some(job) = queue.iter_mut().find(|j| j.id == job_id) {
                job.metadata = meta.clone();
            }
        }

        app.emit("queue-update", get_queue_status().ok()).ok();

        #[cfg(target_os = "macos")]
        {
            // Use FloatingPanelManager::update_status() instead
            let display_title = if meta.artist.is_empty() {
                meta.title.clone()
            } else {
                format!("{} - {}", meta.artist, meta.title)
            };
            FloatingPanelManager::update_status("downloading", 10.0, &display_title, get_queued_count());
        }

        println!(
            "[Metadata] Title: '{}', Artist: '{}', Album: '{}'",
            meta.title, meta.artist, meta.album
        );
        meta
    };

    // Calculate output path
    let context = download_context.as_ref().unwrap_or(&DownloadContext::Single);
    let output_path = get_organized_output_path(&base_output_dir, &metadata, context);
    let output_dir = output_path.parent().unwrap().to_string_lossy().to_string();

    fs::create_dir_all(&output_dir).map_err(|e| format!("Failed to create directory: {}", e))?;

    // Build yt-dlp command
    let sidecar = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| format!("Failed to get yt-dlp sidecar: {}", e))?;

    let output_template = format!("{}/%(title)s.%(ext)s", output_dir);

    let args: Vec<&str> = vec![
        &download_url,
        "-f",
        "bestaudio",
        "--extract-audio",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "0",
        "--prefer-free-formats",
        "--embed-thumbnail",
        "--add-metadata",
        "--output",
        &output_template,
        "--progress",
        "--newline",
        "--no-warnings",
    ];

    let (mut rx, _child) = sidecar
        .args(args)
        .spawn()
        .map_err(|e| format!("Failed to spawn yt-dlp: {}", e))?;

    update_job_status(&job_id, DownloadStatus::Downloading, 5.0, "Downloading...");

    // Listen to progress
    let mut output = String::new();
    let mut last_progress: f32 = 5.0;
    let track_title = metadata.title.clone();

    while let Some(event) = rx.recv().await {
        match event {
            tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                let line_str = String::from_utf8_lossy(&line).to_string();
                println!("[yt-dlp] {}", line_str);
                output.push_str(&line_str);
                output.push('\n');

                if let Some(pct) = parse_ytdlp_progress(&line_str) {
                    last_progress = pct * 0.9;
                    update_job_status(
                        &job_id,
                        DownloadStatus::Downloading,
                        last_progress,
                        &format!("Downloading... {:.1}%", pct),
                    );

                    #[cfg(target_os = "macos")]
                    {
                        // Use FloatingPanelManager::update_status() instead
                        FloatingPanelManager::update_status(
                            "downloading",
                            pct,
                            &track_title,
                            get_queued_count(),
                        );
                    }
                }

                if line_str.contains("[ExtractAudio]") || line_str.contains("[Merger]") {
                    update_job_status(
                        &job_id,
                        DownloadStatus::Converting,
                        92.0,
                        "Converting to MP3...",
                    );

                    #[cfg(target_os = "macos")]
                    {
                        // Use FloatingPanelManager::update_status() instead
                        FloatingPanelManager::update_status(
                            "converting",
                            95.0,
                            &track_title,
                            get_queued_count(),
                        );
                    }
                }

                app.emit("download-progress", &line_str).ok();
                app.emit("queue-update", get_queue_status().ok()).ok();
            }
            tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                let line_str = String::from_utf8_lossy(&line).to_string();
                eprintln!("[yt-dlp stderr] {}", line_str);

                if !line_str.contains("WARNING") {
                    app.emit("download-progress", &format!("⚠️ {}", line_str))
                        .ok();
                }
            }
            tauri_plugin_shell::process::CommandEvent::Error(error) => {
                update_job_status(
                    &job_id,
                    DownloadStatus::Error,
                    last_progress,
                    &format!("Error: {}", error),
                );
                if let Ok(mut queue) = DOWNLOAD_QUEUE.lock() {
                    if let Some(job) = queue.iter_mut().find(|j| j.id == job_id) {
                        job.error = Some(error.clone());
                    }
                }
                app.emit("queue-update", get_queue_status().ok()).ok();

                #[cfg(target_os = "macos")]
                {
                    // Use FloatingPanelManager::update_status() instead
                    FloatingPanelManager::update_status("error", 0.0, "Error", get_queued_count());
                }

                return Err(format!("yt-dlp error: {}", error));
            }
            tauri_plugin_shell::process::CommandEvent::Terminated(payload) => {
                if payload.code != Some(0) {
                    let error_msg = format!("yt-dlp exited with code: {:?}", payload.code);
                    update_job_status(&job_id, DownloadStatus::Error, last_progress, &error_msg);
                    if let Ok(mut queue) = DOWNLOAD_QUEUE.lock() {
                        if let Some(job) = queue.iter_mut().find(|j| j.id == job_id) {
                            job.error = Some(error_msg.clone());
                        }
                    }
                    app.emit("queue-update", get_queue_status().ok()).ok();

                    #[cfg(target_os = "macos")]
                    {
                        // Use FloatingPanelManager::update_status() instead
                        FloatingPanelManager::update_status("error", 0.0, "Error", get_queued_count());
                    }

                    return Err(error_msg);
                }
                break;
            }
            _ => {}
        }
    }

    // Mark as complete
    update_job_status(
        &job_id,
        DownloadStatus::Complete,
        100.0,
        "Download complete!",
    );
    {
        let mut queue = DOWNLOAD_QUEUE
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        if let Some(job) = queue.iter_mut().find(|j| j.id == job_id) {
            job.completed_at = Some(chrono::Utc::now().timestamp());
            job.output_path = Some(output_path.to_string_lossy().to_string());
        }
    }

    app.emit("queue-update", get_queue_status().ok()).ok();

    #[cfg(target_os = "macos")]
    {
        // Use FloatingPanelManager::update_status() instead
        FloatingPanelManager::update_status("complete", 100.0, "Done!", get_queued_count());
    }

    Ok("Download complete".to_string())
}

/// Start processing the download queue
#[tauri::command]
async fn start_queue_processing(app: AppHandle) -> Result<(), String> {
    // Check if already processing
    {
        let mut processing = QUEUE_PROCESSING
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        if *processing {
            println!("[Queue] Already processing");
            return Ok(());
        }
        *processing = true;
    }

    let base_output_dir = get_download_dir();
    fs::create_dir_all(&base_output_dir).ok();

    println!("[Queue] Starting queue processing");
    app.emit("queue-update", get_queue_status().ok()).ok();

    // Process queue
    loop {
        let next_job_id = {
            let queue = DOWNLOAD_QUEUE
                .lock()
                .map_err(|e| format!("Lock error: {}", e))?;
            queue
                .iter()
                .find(|j| j.status == DownloadStatus::Queued)
                .map(|j| j.id.clone())
        };

        match next_job_id {
            Some(job_id) => {
                println!("[Queue] Processing job: {}", job_id);
                match process_download_job(&app, job_id.clone(), base_output_dir.clone()).await {
                    Ok(_) => println!("[Queue] Job {} completed successfully", job_id),
                    Err(e) => println!("[Queue] Job {} failed: {}", job_id, e),
                }
            }
            None => {
                println!("[Queue] No more jobs to process");
                break;
            }
        }
    }

    // Mark processing as complete
    {
        let mut processing = QUEUE_PROCESSING
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        *processing = false;
    }

    app.emit("queue-update", get_queue_status().ok()).ok();
    println!("[Queue] Queue processing complete");

    Ok(())
}

// ============================================================================
// Tauri Commands - License Management
// ============================================================================

#[tauri::command]
fn get_device_uuid() -> String {
    get_or_create_device_uuid()
}

#[tauri::command]
fn get_hardware_device_id() -> String {
    get_hardware_id()
}

// set_auth_token is replaced by OAuth - keep for backward compatibility
#[tauri::command]
fn set_auth_token(token: String) -> Result<(), String> {
    let uuid = get_or_create_device_uuid();
    auth::save_auth_token(&token, &uuid);
    Ok(())
}

#[tauri::command]
fn get_registration_url() -> String {
    let uuid = get_or_create_device_uuid();
    auth::get_registration_url(&uuid)
}

#[tauri::command]
async fn check_license(user_email: Option<String>) -> Result<LicenseStatus, String> {
    let device_uuid = get_or_create_device_uuid();
    auth::check_license(user_email, device_uuid).await
}

#[tauri::command]
fn start_google_login() -> Result<OAuthStartResult, String> {
    auth::start_google_login(GOOGLE_OAUTH_CLIENT_ID)
}

#[tauri::command]
async fn wait_for_oauth_callback(app: AppHandle) -> Result<String, String> {
    auth::wait_for_oauth_callback(app).await
}

#[tauri::command]
async fn exchange_oauth_code(code: String) -> Result<StoredAuth, String> {
    auth::exchange_oauth_code(code, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, FIREBASE_API_KEY).await
}

#[tauri::command]
fn get_stored_auth() -> Option<StoredAuth> {
    auth::get_stored_auth()
}

#[tauri::command]
async fn refresh_auth_token() -> Result<StoredAuth, String> {
    auth::refresh_auth_token(FIREBASE_API_KEY).await
}

#[tauri::command]
fn logout() -> Result<(), String> {
    auth::logout()
}

#[tauri::command]
fn get_download_dir() -> String {
    utils::get_download_dir()
}

#[tauri::command]
fn create_download_dir() -> Result<String, String> {
    utils::create_download_dir()
}

// ============================================================================
// Tauri Commands - Download Queue
// ============================================================================

#[tauri::command]
fn add_to_queue(url: String) -> Result<DownloadJob, String> {
    let job = DownloadJob::new(url);
    let mut queue = DOWNLOAD_QUEUE
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    queue.push(job.clone());
    Ok(job)
}

#[tauri::command]
fn add_multiple_to_queue(urls: Vec<String>) -> Result<Vec<DownloadJob>, String> {
    let mut jobs = Vec::new();
    let mut queue = DOWNLOAD_QUEUE
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    for url in urls {
        let job = DownloadJob::new(url);
        queue.push(job.clone());
        jobs.push(job);
    }

    Ok(jobs)
}

#[tauri::command]
async fn add_spotify_album_to_queue(album_url: String) -> Result<Vec<DownloadJob>, String> {
    println!("[Album] Processing Spotify album: {}", album_url);

    // Get album metadata from backend API
    let api_client = HasodApiClient::production();
    let album_metadata = api_client.get_spotify_album_metadata(&album_url).await?;

    println!("[Album] Album: '{}' by '{}' ({} tracks)",
             album_metadata.album.name,
             album_metadata.album.artist,
             album_metadata.tracks.len());

    let mut jobs = Vec::new();
    let mut queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;

    let album_context = DownloadContext::Album(album_metadata.album.name.clone());

    for track in album_metadata.tracks {
        let track_url = format!("https://open.spotify.com/track/{}", track.track_id);
        let mut job = DownloadJob::new(track_url);

        job.metadata = TrackMetadata {
            title: track.name,
            artist: track.artists,
            album: track.album,
            duration: Some((track.duration_ms / 1000) as u32),
            thumbnail: Some(track.image_url),
        };
        job.download_context = Some(album_context.clone());

        queue.push(job.clone());
        jobs.push(job);
    }

    println!("[Album] ✅ Queued {} tracks from album", jobs.len());
    Ok(jobs)
}

#[tauri::command]
async fn add_spotify_playlist_to_queue(playlist_url: String) -> Result<Vec<DownloadJob>, String> {
    println!("[Playlist] Processing Spotify playlist: {}", playlist_url);

    // Get playlist metadata from backend API
    let api_client = HasodApiClient::production();
    let playlist_metadata = api_client.get_spotify_playlist_metadata(&playlist_url).await?;

    println!("[Playlist] Playlist: '{}' by '{}' ({} tracks)",
             playlist_metadata.playlist.name,
             playlist_metadata.playlist.owner,
             playlist_metadata.tracks.len());

    let mut jobs = Vec::new();
    let mut queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;

    let playlist_context = DownloadContext::Playlist(playlist_metadata.playlist.name.clone());

    for track in playlist_metadata.tracks {
        let track_url = format!("https://open.spotify.com/track/{}", track.track_id);
        let mut job = DownloadJob::new(track_url);

        job.metadata = TrackMetadata {
            title: track.name,
            artist: track.artists,
            album: track.album,
            duration: Some((track.duration_ms / 1000) as u32),
            thumbnail: Some(track.image_url),
        };
        job.download_context = Some(playlist_context.clone());

        queue.push(job.clone());
        jobs.push(job);
    }

    println!("[Playlist] ✅ Queued {} tracks from playlist", jobs.len());
    Ok(jobs)
}

#[tauri::command]
async fn add_youtube_playlist_to_queue(
    app: AppHandle,
    playlist_url: String,
) -> Result<Vec<DownloadJob>, String> {
    // Use YouTube service to extract playlist
    let (playlist_name, video_urls) = YouTubeDownloader::extract_playlist_urls(&app, &playlist_url).await?;

    let mut jobs = Vec::new();
    let mut queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;

    let playlist_context = DownloadContext::Playlist(playlist_name.clone());

    for video_url in video_urls {
        let mut job = DownloadJob::new(video_url);
        job.download_context = Some(playlist_context.clone());
        queue.push(job.clone());
        jobs.push(job);
    }

    println!("[YouTube Playlist] ✅ Queued {} videos from playlist", jobs.len());
    Ok(jobs)
}

#[tauri::command]
fn get_queue_status() -> Result<QueueStatus, String> {
    let queue = DOWNLOAD_QUEUE
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    let active_count = queue
        .iter()
        .filter(|j| {
            j.status == DownloadStatus::Downloading || j.status == DownloadStatus::Converting
        })
        .count();
    let queued_count = queue
        .iter()
        .filter(|j| j.status == DownloadStatus::Queued)
        .count();
    let completed_count = queue
        .iter()
        .filter(|j| j.status == DownloadStatus::Complete)
        .count();
    let error_count = queue
        .iter()
        .filter(|j| j.status == DownloadStatus::Error)
        .count();

    let is_processing = QUEUE_PROCESSING.lock().map(|p| *p).unwrap_or(false);

    Ok(QueueStatus {
        jobs: queue.clone(),
        active_count,
        queued_count,
        completed_count,
        error_count,
        is_processing,
    })
}

#[tauri::command]
fn clear_completed_jobs() -> Result<usize, String> {
    let mut queue = DOWNLOAD_QUEUE
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    let before_count = queue.len();
    queue.retain(|j| j.status != DownloadStatus::Complete);
    Ok(before_count - queue.len())
}

#[tauri::command]
fn remove_from_queue(job_id: String) -> Result<bool, String> {
    let mut queue = DOWNLOAD_QUEUE
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    if let Some(pos) = queue.iter().position(|j| j.id == job_id) {
        queue.remove(pos);
        Ok(true)
    } else {
        Ok(false)
    }
}

// ============================================================================
// Tauri Commands - Legacy Download Commands (now use queue)
// ============================================================================

#[tauri::command]
async fn download_youtube(app: AppHandle, url: String, _output_dir: String) -> Result<String, String> {
    let job = add_to_queue(url)?;
    start_queue_processing(app).await?;
    Ok(format!("Added to queue: {}", job.id))
}

#[tauri::command]
async fn download_spotify(app: AppHandle, url: String, _output_dir: String) -> Result<String, String> {
    let job = add_to_queue(url)?;
    start_queue_processing(app).await?;
    Ok(format!("Added to queue: {}", job.id))
}

// ============================================================================
// Tauri Commands - Platform-Specific (Floating Window, Clipboard)
// ============================================================================

#[tauri::command]
fn handle_dropped_link(url: String) -> Result<String, String> {
    println!("[DragDrop] Received dropped link: {}", url);

    // Validate URL format
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Invalid URL format".to_string());
    }

    // Detect service
    let service = MusicService::from_url(&url);
    println!("[DragDrop] Detected service: {}", service.display_name());

    // Add to queue
    let job = add_to_queue(url.clone())?;

    Ok(format!(
        "Added {} link to queue: {}",
        service.display_name(),
        job.id
    ))
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn toggle_floating_window(app: AppHandle) -> Result<(), String> {
    use platform::FloatingPanelManager;
    FloatingPanelManager::toggle(app)
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn toggle_floating_window(_app: AppHandle) -> Result<(), String> {
    Err("Floating window is only supported on macOS".to_string())
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn is_floating_window_open(_app: AppHandle) -> bool {
    use platform::FloatingPanelManager;
    FloatingPanelManager::is_open()
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn is_floating_window_open(_app: AppHandle) -> bool {
    false
}

#[cfg(target_os = "macos")]
#[tauri::command]
async fn get_clipboard_url() -> Result<String, String> {
    use platform::ClipboardManager;
    ClipboardManager::get_url().await
}

#[cfg(target_os = "windows")]
#[tauri::command]
async fn get_clipboard_url() -> Result<String, String> {
    use std::process::Command;
    let output = Command::new("powershell")
        .args(["-command", "Get-Clipboard"])
        .output()
        .map_err(|e| format!("Failed to read clipboard: {}", e))?;

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if text.starts_with("http://") || text.starts_with("https://") {
        return Ok(text);
    }
    Err("Clipboard does not contain a valid URL".to_string())
}

#[cfg(target_os = "linux")]
#[tauri::command]
async fn get_clipboard_url() -> Result<String, String> {
    use std::process::Command;
    let output = Command::new("xclip")
        .args(["-selection", "clipboard", "-o"])
        .output()
        .map_err(|e| format!("Failed to read clipboard: {}", e))?;

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if text.starts_with("http://") || text.starts_with("https://") {
        return Ok(text);
    }
    Err("Clipboard does not contain a valid URL".to_string())
}

// ============================================================================
// Main Application
// ============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Create system tray menu items
            let show_item = MenuItem::with_id(app, "show", "Show App", true, None::<&str>)?;
            let toggle_floating_item =
                MenuItem::with_id(app, "toggle_floating", "Toggle Drop Zone", true, None::<&str>)?;
            let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let menu = Menu::with_items(
                app,
                &[&show_item, &toggle_floating_item, &separator, &quit_item],
            )?;

            // Load tray icon
            let icon = Image::from_path("icons/32x32.png")
                .or_else(|_| Image::from_path("icons/icon.png"))
                .unwrap_or_else(|_| {
                    Image::from_bytes(include_bytes!("../icons/32x32.png"))
                        .expect("Failed to load embedded icon")
                });

            // Build the tray icon
            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("Hasod Downloads")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            window.show().ok();
                            window.set_focus().ok();
                        }
                    }
                    "toggle_floating" => {
                        let _ = toggle_floating_window(app.clone());
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            window.show().ok();
                            window.set_focus().ok();
                        }
                    }
                })
                .build(app)?;

            println!("[Tray] System tray icon created");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // License management
            get_device_uuid,
            get_hardware_device_id,
            get_registration_url,
            set_auth_token,
            check_license,
            // OAuth 2.0
            start_google_login,
            wait_for_oauth_callback,
            exchange_oauth_code,
            get_stored_auth,
            refresh_auth_token,
            logout,
            // Download queue
            add_to_queue,
            add_multiple_to_queue,
            add_spotify_album_to_queue,
            add_spotify_playlist_to_queue,
            add_youtube_playlist_to_queue,
            get_queue_status,
            clear_completed_jobs,
            remove_from_queue,
            start_queue_processing,
            // Legacy download commands
            download_youtube,
            download_spotify,
            get_download_dir,
            create_download_dir,
            // Platform-specific
            toggle_floating_window,
            is_floating_window_open,
            get_clipboard_url,
            handle_dropped_link,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
