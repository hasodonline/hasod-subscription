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
mod commands;

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
    QueueManager::update_job_status(job_id, status, progress, message);
}

// ============================================================================
// All Download Logic Moved to Modules
// ============================================================================
// - Download orchestration: download/processor.rs (JobProcessor)
// - Queue processing: download/queue.rs (QueueManager::start_processing)
// - Service-specific downloads: download/services/{spotify,youtube,apple_music,deezer}.rs
// - All Tauri commands: commands.rs
// ============================================================================
// Commands include: License management, OAuth, Download queue, Platform-specific
// See commands.rs for all #[tauri::command] implementations

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
                        let _ = commands::toggle_floating_window(app.clone());
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
            commands::get_device_uuid,
            commands::get_hardware_device_id,
            commands::get_registration_url,
            commands::set_auth_token,
            commands::check_license,
            // OAuth 2.0
            commands::start_google_login,
            commands::wait_for_oauth_callback,
            commands::exchange_oauth_code,
            commands::get_stored_auth,
            commands::refresh_auth_token,
            commands::logout,
            // Download queue
            commands::add_to_queue,
            commands::add_multiple_to_queue,
            commands::add_spotify_album_to_queue,
            commands::add_spotify_playlist_to_queue,
            commands::add_youtube_playlist_to_queue,
            commands::get_queue_status,
            commands::clear_completed_jobs,
            commands::remove_from_queue,
            commands::start_queue_processing,
            // Legacy download commands
            commands::download_youtube,
            commands::download_spotify,
            commands::get_download_dir,
            commands::create_download_dir,
            // Platform-specific
            commands::toggle_floating_window,
            commands::is_floating_window_open,
            commands::get_clipboard_url,
            commands::handle_dropped_link,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
