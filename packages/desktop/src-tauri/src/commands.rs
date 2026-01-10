// Tauri command handlers - thin wrappers that delegate to modules

use tauri::AppHandle;

use crate::auth::{LicenseStatus, OAuthStartResult, StoredAuth};
use crate::download::{DownloadJob, QueueStatus, DownloadContext, TrackMetadata};
use crate::download::queue::{DOWNLOAD_QUEUE};
use crate::api_types::HasodApiClient;
use crate::utils::{get_or_create_device_uuid, get_hardware_id};

// Constants needed for commands
const FIREBASE_API_KEY: &str = env!("HASOD_FIREBASE_API_KEY");
const GOOGLE_OAUTH_CLIENT_ID: &str = env!("HASOD_GOOGLE_OAUTH_CLIENT_ID");
const GOOGLE_OAUTH_CLIENT_SECRET: &str = env!("HASOD_GOOGLE_OAUTH_CLIENT_SECRET");

// ============================================================================
// License Management Commands
// ============================================================================

#[tauri::command]
pub fn get_device_uuid() -> String {
    get_or_create_device_uuid()
}

#[tauri::command]
pub fn get_hardware_device_id() -> String {
    get_hardware_id()
}

#[tauri::command]
pub fn set_auth_token(token: String) -> Result<(), String> {
    let uuid = get_or_create_device_uuid();
    crate::auth::save_auth_token(&token, &uuid);
    Ok(())
}

#[tauri::command]
pub fn get_registration_url() -> String {
    let uuid = get_or_create_device_uuid();
    crate::auth::get_registration_url(&uuid)
}

#[tauri::command]
pub async fn check_license(user_email: Option<String>) -> Result<LicenseStatus, String> {
    let device_uuid = get_or_create_device_uuid();
    crate::auth::check_license(user_email, device_uuid).await
}

// ============================================================================
// OAuth 2.0 Commands
// ============================================================================

#[tauri::command]
pub fn start_google_login() -> Result<OAuthStartResult, String> {
    crate::auth::start_google_login(GOOGLE_OAUTH_CLIENT_ID)
}

#[tauri::command]
pub async fn wait_for_oauth_callback(app: AppHandle) -> Result<String, String> {
    crate::auth::wait_for_oauth_callback(app).await
}

#[tauri::command]
pub async fn exchange_oauth_code(code: String) -> Result<StoredAuth, String> {
    crate::auth::exchange_oauth_code(code, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, FIREBASE_API_KEY).await
}

#[tauri::command]
pub fn get_stored_auth() -> Option<StoredAuth> {
    crate::auth::get_stored_auth()
}

#[tauri::command]
pub async fn refresh_auth_token() -> Result<StoredAuth, String> {
    crate::auth::refresh_auth_token(FIREBASE_API_KEY).await
}

#[tauri::command]
pub fn logout() -> Result<(), String> {
    crate::auth::logout()
}

// ============================================================================
// Download Queue Commands
// ============================================================================

#[tauri::command]
pub fn add_to_queue(url: String) -> Result<DownloadJob, String> {
    let job = crate::download::DownloadJob::new(url);
    let mut queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;
    queue.push(job.clone());
    Ok(job)
}

#[tauri::command]
pub fn add_multiple_to_queue(urls: Vec<String>) -> Result<Vec<DownloadJob>, String> {
    let mut jobs = Vec::new();
    let mut queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;
    
    for url in urls {
        let job = crate::download::DownloadJob::new(url);
        queue.push(job.clone());
        jobs.push(job);
    }
    
    Ok(jobs)
}

#[tauri::command]
pub async fn add_spotify_album_to_queue(album_url: String) -> Result<Vec<DownloadJob>, String> {
    println!("[Album] Processing Spotify album: {}", album_url);

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
        let mut job = crate::download::DownloadJob::new(track_url);

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
pub async fn add_spotify_playlist_to_queue(playlist_url: String) -> Result<Vec<DownloadJob>, String> {
    println!("[Playlist] Processing Spotify playlist: {}", playlist_url);

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
        let mut job = crate::download::DownloadJob::new(track_url);

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
pub async fn add_youtube_playlist_to_queue(
    app: AppHandle,
    playlist_url: String,
) -> Result<Vec<DownloadJob>, String> {
    let (playlist_name, video_urls) = crate::download::services::YouTubeDownloader::extract_playlist_urls(&app, &playlist_url).await?;

    let mut jobs = Vec::new();
    let mut queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;

    let playlist_context = DownloadContext::Playlist(playlist_name.clone());

    for video_url in video_urls {
        let mut job = crate::download::DownloadJob::new(video_url);
        job.download_context = Some(playlist_context.clone());
        queue.push(job.clone());
        jobs.push(job);
    }

    println!("[YouTube Playlist] ✅ Queued {} videos from playlist", jobs.len());
    Ok(jobs)
}

#[tauri::command]
pub fn get_queue_status() -> Result<QueueStatus, String> {
    crate::download::QueueManager::get_status()
}

#[tauri::command]
pub fn clear_completed_jobs() -> Result<usize, String> {
    crate::download::QueueManager::clear_completed()
}

#[tauri::command]
pub fn remove_from_queue(job_id: String) -> Result<bool, String> {
    crate::download::QueueManager::remove_job(&job_id)
}

#[tauri::command]
pub fn clear_all_queue() -> Result<usize, String> {
    crate::download::QueueManager::clear_all()
}

#[tauri::command]
pub async fn start_queue_processing(app: AppHandle) -> Result<(), String> {
    crate::download::QueueManager::start_processing(app).await
}

// ============================================================================
// Filesystem Commands
// ============================================================================

#[tauri::command]
pub async fn open_file_location(file_path: String) -> Result<(), String> {
    use std::process::Command;

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-R")
            .arg(&file_path)
            .spawn()
            .map_err(|e| format!("Failed to open file location: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg("/select,")
            .arg(&file_path)
            .spawn()
            .map_err(|e| format!("Failed to open file location: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        // Extract directory from file path
        use std::path::Path;
        let path = Path::new(&file_path);
        if let Some(parent) = path.parent() {
            Command::new("xdg-open")
                .arg(parent)
                .spawn()
                .map_err(|e| format!("Failed to open file location: {}", e))?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn get_download_dir() -> String {
    crate::utils::get_download_dir()
}

#[tauri::command]
pub fn create_download_dir() -> Result<String, String> {
    crate::utils::create_download_dir()
}

// ============================================================================
// Legacy Download Commands (backward compatibility)
// ============================================================================

#[tauri::command]
pub async fn download_youtube(app: AppHandle, url: String, _output_dir: String) -> Result<String, String> {
    let job = add_to_queue(url)?;
    crate::download::QueueManager::start_processing(app).await?;
    Ok(format!("Added to queue: {}", job.id))
}

#[tauri::command]
pub async fn download_spotify(app: AppHandle, url: String, _output_dir: String) -> Result<String, String> {
    let job = add_to_queue(url)?;
    crate::download::QueueManager::start_processing(app).await?;
    Ok(format!("Added to queue: {}", job.id))
}

// ============================================================================
// Platform Commands (Cross-platform)
// ============================================================================

/// Toggle the floating panel window
/// Works on all platforms (macOS: native NSPanel, Windows/Linux: Tauri window)
#[tauri::command]
pub fn toggle_floating_window(app: AppHandle) -> Result<(), String> {
    use crate::platform::FloatingPanelManager;
    FloatingPanelManager::toggle(app)
}

/// Check if the floating panel is currently open
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn is_floating_window_open(_app: AppHandle) -> bool {
    use crate::platform::FloatingPanelManager;
    FloatingPanelManager::is_open()
}

/// Check if the floating panel is currently open (Tauri-based platforms)
#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn is_floating_window_open(app: AppHandle) -> bool {
    use crate::platform::FloatingPanelManager;
    FloatingPanelManager::is_open(&app)
}

/// Get URL from clipboard (cross-platform)
/// macOS: pbpaste, Windows: PowerShell, Linux: xclip
#[tauri::command]
pub async fn get_clipboard_url() -> Result<String, String> {
    use crate::platform::ClipboardManager;
    ClipboardManager::get_url().await
}

#[tauri::command]
pub fn handle_dropped_link(url: String) -> Result<String, String> {
    // Normalize Spotify URIs to URLs if needed
    let normalized_url = if url.starts_with("spotify:") {
        let parts: Vec<&str> = url.split(':').collect();
        if parts.len() >= 3 {
            format!("https://open.spotify.com/{}/{}", parts[1], parts[2])
        } else {
            url
        }
    } else {
        url
    };

    println!("[DragDrop] Normalized URL: {}", normalized_url);
    Ok(normalized_url)
}

// ============================================================================
// Settings Commands
// ============================================================================

#[tauri::command]
pub fn get_english_only_mode() -> bool {
    crate::utils::get_english_only_mode()
}

#[tauri::command]
pub fn set_english_only_mode(enabled: bool) -> Result<(), String> {
    crate::utils::set_english_only_mode(enabled)
}
