// Hasod Downloads - Desktop Application
// License validation and download management with Tauri
// OAuth 2.0 + PKCE authentication with device binding
// Multi-service download queue with organized file structure

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use keyring::Entry;
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::Arc;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};
use tiny_http::{Response, Server};
use url::Url;
use uuid::Uuid;

// Import API types (manually maintained to match OpenAPI spec)
mod api_types;
use api_types::{HasodApiClient, SpotifyTrackMetadata, DeezerQuality};

// Blowfish decryption imports
use blowfish::Blowfish;
use cipher::{BlockDecryptMut, KeyIvInit};
use cbc::Decryptor;
use md5::{Digest as Md5Digest, Md5};

type BlowfishCbc = Decryptor<Blowfish>;


// ============================================================================
// Data Structures
// API types are defined in packages/api-spec/openapi.yaml
// Keep these types in sync with the OpenAPI spec
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
struct LicenseStatus {
    is_valid: bool,
    status: String, // "registered", "not_registered", "expired", "suspended", "error"
    uuid: String,
    email: Option<String>,
    registration_url: Option<String>,
    expires_at: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct UserSubscriptionResponse {
    email: String,
    services: std::collections::HashMap<String, ServiceSubscription>,
}

#[derive(Debug, Serialize, Deserialize)]
struct FirestoreTimestamp {
    #[serde(rename = "_seconds")]
    seconds: i64,
    #[serde(rename = "_nanoseconds")]
    nanoseconds: i64,
}

#[derive(Debug, Serialize, Deserialize)]
struct ServiceSubscription {
    status: String,
    #[serde(rename = "paymentMethod")]
    payment_method: Option<String>,
    #[serde(rename = "startDate")]
    start_date: Option<FirestoreTimestamp>,
    #[serde(rename = "nextBillingDate")]
    next_billing_date: Option<FirestoreTimestamp>,
    #[serde(rename = "manualEndDate")]
    manual_end_date: Option<FirestoreTimestamp>,
    #[serde(rename = "expiresAt")]
    expires_at: Option<FirestoreTimestamp>,
}

// ============================================================================
// Music Service Detection
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum MusicService {
    YouTube,
    Spotify,
    SoundCloud,
    Deezer,
    Tidal,
    AppleMusic,
    Bandcamp,
    Unknown,
}

impl MusicService {
    fn from_url(url: &str) -> Self {
        let url_lower = url.to_lowercase();
        if url_lower.contains("youtube.com") || url_lower.contains("youtu.be") || url_lower.contains("music.youtube.com") {
            MusicService::YouTube
        } else if url_lower.contains("spotify.com") || url_lower.starts_with("spotify:") {
            MusicService::Spotify
        } else if url_lower.contains("soundcloud.com") {
            MusicService::SoundCloud
        } else if url_lower.contains("deezer.com") {
            MusicService::Deezer
        } else if url_lower.contains("tidal.com") {
            MusicService::Tidal
        } else if url_lower.contains("music.apple.com") {
            MusicService::AppleMusic
        } else if url_lower.contains("bandcamp.com") {
            MusicService::Bandcamp
        } else {
            MusicService::Unknown
        }
    }

    fn display_name(&self) -> &str {
        match self {
            MusicService::YouTube => "YouTube",
            MusicService::Spotify => "Spotify",
            MusicService::SoundCloud => "SoundCloud",
            MusicService::Deezer => "Deezer",
            MusicService::Tidal => "Tidal",
            MusicService::AppleMusic => "Apple Music",
            MusicService::Bandcamp => "Bandcamp",
            MusicService::Unknown => "Unknown",
        }
    }

    fn icon(&self) -> &str {
        match self {
            MusicService::YouTube => "🎬",
            MusicService::Spotify => "🟢",
            MusicService::SoundCloud => "🟠",
            MusicService::Deezer => "🟣",
            MusicService::Tidal => "🔵",
            MusicService::AppleMusic => "🍎",
            MusicService::Bandcamp => "🎵",
            MusicService::Unknown => "❓",
        }
    }
}

// ============================================================================
// Download Queue Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DownloadStatus {
    Queued,
    Downloading,
    Converting,
    Complete,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackMetadata {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: Option<u32>,  // seconds
    pub thumbnail: Option<String>,
}

impl Default for TrackMetadata {
    fn default() -> Self {
        TrackMetadata {
            title: "Unknown".to_string(),
            artist: "Unknown Artist".to_string(),
            album: "Unknown Album".to_string(),
            duration: None,
            thumbnail: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadJob {
    pub id: String,
    pub url: String,
    pub service: MusicService,
    pub status: DownloadStatus,
    pub progress: f32,  // 0.0 to 100.0
    pub message: String,
    pub metadata: TrackMetadata,
    pub output_path: Option<String>,
    pub created_at: i64,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub error: Option<String>,
    #[serde(skip)]  // Don't serialize to frontend
    pub download_context: Option<DownloadContext>,
}

impl DownloadJob {
    fn new(url: String) -> Self {
        let service = MusicService::from_url(&url);
        // Create initial title from URL for better UX while fetching metadata
        let initial_title = Self::extract_title_from_url(&url, &service);
        DownloadJob {
            id: Uuid::new_v4().to_string(),
            url,
            service,
            status: DownloadStatus::Queued,
            progress: 0.0,
            message: "Waiting in queue...".to_string(),
            metadata: TrackMetadata {
                title: initial_title,
                artist: String::new(), // Empty instead of "Unknown Artist"
                album: String::new(),  // Empty instead of "Unknown Album"
                duration: None,
                thumbnail: None,
            },
            output_path: None,
            created_at: chrono::Utc::now().timestamp(),
            started_at: None,
            completed_at: None,
            error: None,
            download_context: Some(DownloadContext::Single), // Default to single track
        }
    }

    /// Extract a readable title from URL for initial display
    fn extract_title_from_url(url: &str, service: &MusicService) -> String {
        // Try to extract meaningful info from the URL
        match service {
            MusicService::YouTube => {
                // YouTube: try to get video title from URL path
                if let Some(v_param) = url.find("v=") {
                    let video_id = &url[v_param + 2..].split('&').next().unwrap_or("");
                    if !video_id.is_empty() {
                        return format!("YouTube: {}", &video_id[..video_id.len().min(11)]);
                    }
                }
                "YouTube video".to_string()
            }
            MusicService::Spotify => {
                // Spotify: extract track name from URL if possible
                if let Some(track_pos) = url.find("/track/") {
                    let after_track = &url[track_pos + 7..];
                    let track_id = after_track.split('?').next().unwrap_or(after_track);
                    return format!("Spotify: {}", &track_id[..track_id.len().min(22)]);
                }
                "Spotify track".to_string()
            }
            MusicService::AppleMusic => {
                // Apple Music: try to extract song name from URL path
                if let Some(album_pos) = url.find("/album/") {
                    let after_album = &url[album_pos + 7..];
                    // URL format: /album/song-name/id?i=trackid
                    let song_slug = after_album.split('/').next().unwrap_or("");
                    if !song_slug.is_empty() && song_slug != "album" {
                        // Convert URL slug to readable: "song-name" -> "Song Name"
                        let readable: String = song_slug
                            .split('-')
                            .map(|word| {
                                let mut chars = word.chars();
                                match chars.next() {
                                    None => String::new(),
                                    Some(first) => first.to_uppercase().chain(chars).collect(),
                                }
                            })
                            .collect::<Vec<_>>()
                            .join(" ");
                        return format!("🍎 {}", readable);
                    }
                }
                "Apple Music track".to_string()
            }
            MusicService::SoundCloud => "SoundCloud track".to_string(),
            MusicService::Deezer => "Deezer track".to_string(),
            MusicService::Tidal => "Tidal track".to_string(),
            MusicService::Bandcamp => "Bandcamp track".to_string(),
            MusicService::Unknown => {
                // Show truncated URL for unknown services
                let clean_url = url.trim_start_matches("https://").trim_start_matches("http://");
                if clean_url.len() > 40 {
                    format!("{}...", &clean_url[..40])
                } else {
                    clean_url.to_string()
                }
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueStatus {
    pub jobs: Vec<DownloadJob>,
    pub active_count: usize,
    pub queued_count: usize,
    pub completed_count: usize,
    pub error_count: usize,
    pub is_processing: bool,
}

// Global download queue
static DOWNLOAD_QUEUE: std::sync::LazyLock<Arc<Mutex<Vec<DownloadJob>>>> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(Vec::new())));

// Flag to track if queue processor is running
static QUEUE_PROCESSING: std::sync::LazyLock<Arc<Mutex<bool>>> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(false)));

#[derive(Debug, Serialize, Deserialize)]
struct DownloadProgress {
    job_id: String,
    status: String, // "downloading", "converting", "complete", "error"
    progress: f32,
    message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StoredAuth {
    pub email: String,
    pub id_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
    pub device_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct FirebaseTokenResponse {
    #[serde(rename = "idToken")]
    id_token: String,
    #[serde(rename = "refreshToken")]
    refresh_token: String,
    #[serde(rename = "expiresIn")]
    expires_in: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct FirebaseUserInfo {
    email: String,
    #[serde(rename = "emailVerified")]
    email_verified: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct OAuthState {
    code_verifier: String,
    state: String,
}

// Global state for OAuth flow
static OAUTH_STATE: std::sync::LazyLock<Mutex<Option<OAuthState>>> =
    std::sync::LazyLock::new(|| Mutex::new(None));

// ============================================================================
// License Manager
// ============================================================================

const API_BASE_URL: &str = "https://us-central1-hasod-41a23.cloudfunctions.net/api";
const REQUIRED_SERVICE_ID: &str = "hasod-downloader";

// ============================================================================
// OAuth 2.0 + PKCE Configuration
// ============================================================================

// OAuth credentials loaded from environment variables at compile time
// Set these in .cargo/config.toml or as environment variables before building
//
// For desktop apps with PKCE:
// - Create a "Desktop" OAuth client in Google Cloud Console
// - GOOGLE_OAUTH_CLIENT_ID is required
// - GOOGLE_OAUTH_CLIENT_SECRET is still needed even for Desktop app type in Google Cloud
// - FIREBASE_API_KEY is public (same as in webapp)
const FIREBASE_API_KEY: &str = env!("HASOD_FIREBASE_API_KEY");
const GOOGLE_OAUTH_CLIENT_ID: &str = env!("HASOD_GOOGLE_OAUTH_CLIENT_ID");
const GOOGLE_OAUTH_CLIENT_SECRET: &str = env!("HASOD_GOOGLE_OAUTH_CLIENT_SECRET");
const OAUTH_CALLBACK_PORT: u16 = 8420;
const KEYCHAIN_SERVICE: &str = "hasod-downloads";

// Spotify API credentials
// Public credentials for spotDL
const SPOTIFY_CLIENT_ID_DEFAULT: &str = "c6b23f1e91f84b6a9361de16aba0ae17";
const SPOTIFY_CLIENT_SECRET_DEFAULT: &str = "237e355acaa24636abc79f1a089e6204";
const SPOTIFY_CLIENT_ID: Option<&str> = option_env!("HASOD_SPOTIFY_CLIENT_ID");
const SPOTIFY_CLIENT_SECRET: Option<&str> = option_env!("HASOD_SPOTIFY_CLIENT_SECRET");

// Cached Spotify token
static SPOTIFY_TOKEN_CACHE: std::sync::LazyLock<Arc<Mutex<Option<(String, i64)>>>> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(None)));

// ============================================================================
// PKCE Helper Functions
// ============================================================================

fn generate_code_verifier() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..64).map(|_| rng.gen()).collect();
    URL_SAFE_NO_PAD.encode(&bytes)
}

fn generate_code_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let hash = hasher.finalize();
    URL_SAFE_NO_PAD.encode(&hash)
}

fn generate_state() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..16).map(|_| rng.gen()).collect();
    URL_SAFE_NO_PAD.encode(&bytes)
}

// ============================================================================
// Device ID Helper Functions
// ============================================================================

fn get_hardware_id() -> String {
    // Try to get machine-uid first
    match machine_uid::get() {
        Ok(id) => {
            // Hash the machine ID with app identifier for uniqueness
            let mut hasher = Sha256::new();
            hasher.update(id.as_bytes());
            hasher.update(b"hasod-downloads");
            let hash = hasher.finalize();
            format!("hw-{}", hex::encode(&hash[..16]))
        }
        Err(_) => {
            // Fallback to stored UUID
            get_or_create_device_uuid()
        }
    }
}

// ============================================================================
// Keychain Helper Functions
// ============================================================================

fn get_keychain_entry(key: &str) -> Option<String> {
    let entry = Entry::new(KEYCHAIN_SERVICE, key).ok()?;
    entry.get_password().ok()
}

fn set_keychain_entry(key: &str, value: &str) -> Result<(), String> {
    let entry =
        Entry::new(KEYCHAIN_SERVICE, key).map_err(|e| format!("Keychain entry error: {}", e))?;
    entry
        .set_password(value)
        .map_err(|e| format!("Keychain set error: {}", e))
}

fn delete_keychain_entry(key: &str) -> Result<(), String> {
    let entry =
        Entry::new(KEYCHAIN_SERVICE, key).map_err(|e| format!("Keychain entry error: {}", e))?;
    // Ignore error if entry doesn't exist
    let _ = entry.delete_password();
    Ok(())
}

fn save_auth_to_keychain(auth: &StoredAuth) -> Result<(), String> {
    let json = serde_json::to_string(auth).map_err(|e| format!("JSON serialize error: {}", e))?;
    set_keychain_entry("auth_data", &json)
}

fn get_auth_from_keychain() -> Option<StoredAuth> {
    let json = get_keychain_entry("auth_data")?;
    serde_json::from_str(&json).ok()
}

fn clear_auth_from_keychain() -> Result<(), String> {
    delete_keychain_entry("auth_data")
}

fn get_config_dir() -> PathBuf {
    dirs::home_dir()
        .expect("Cannot find home directory")
        .join(".hasod_downloads")
}

fn get_or_create_device_uuid() -> String {
    let config_dir = get_config_dir();
    fs::create_dir_all(&config_dir).ok();

    let uuid_file = config_dir.join("device_uuid.json");

    if uuid_file.exists() {
        if let Ok(content) = fs::read_to_string(&uuid_file) {
            if let Ok(data) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(uuid) = data.get("uuid").and_then(|v| v.as_str()) {
                    return uuid.to_string();
                }
            }
        }
    }

    // Generate new UUID
    let new_uuid = Uuid::new_v4().to_string();

    let data = serde_json::json!({
        "uuid": new_uuid,
        "created_at": chrono::Utc::now().to_rfc3339()
    });

    fs::write(&uuid_file, serde_json::to_string_pretty(&data).unwrap()).ok();

    new_uuid
}

fn get_auth_token() -> Option<String> {
    let config_dir = get_config_dir();
    let auth_file = config_dir.join("auth_token.json");

    if auth_file.exists() {
        if let Ok(content) = fs::read_to_string(&auth_file) {
            if let Ok(data) = serde_json::from_str::<serde_json::Value>(&content) {
                return data.get("token").and_then(|v| v.as_str()).map(|s| s.to_string());
            }
        }
    }

    None
}

fn save_auth_token(token: &str, device_uuid: &str) {
    let config_dir = get_config_dir();
    fs::create_dir_all(&config_dir).ok();

    let auth_file = config_dir.join("auth_token.json");
    let data = serde_json::json!({
        "token": token,
        "device_uuid": device_uuid
    });

    fs::write(&auth_file, serde_json::to_string_pretty(&data).unwrap()).ok();
}

// ============================================================================
// Tauri Commands
// ============================================================================

#[tauri::command]
fn get_device_uuid() -> String {
    get_or_create_device_uuid()
}

#[tauri::command]
fn get_registration_url() -> String {
    let uuid = get_or_create_device_uuid();
    format!("https://hasod-41a23.web.app/subscriptions?device_uuid={}", uuid)
}

#[tauri::command]
fn set_auth_token(token: String) {
    let uuid = get_or_create_device_uuid();
    save_auth_token(&token, &uuid);
}

#[tauri::command]
async fn check_license(user_email: Option<String>) -> Result<LicenseStatus, String> {
    let device_uuid = get_or_create_device_uuid();
    let auth_token = get_auth_token();

    // If no auth token and no email, return not registered
    if auth_token.is_none() && user_email.is_none() {
        return Ok(LicenseStatus {
            is_valid: false,
            status: "not_registered".to_string(),
            uuid: device_uuid.clone(),
            email: None,
            registration_url: Some(format!(
                "https://hasod-41a23.web.app/subscriptions?device_uuid={}",
                device_uuid
            )),
            expires_at: None,
            error: None,
        });
    }

    // Build request
    let client = reqwest::Client::new();
    let url = format!("{}/user/subscription-status", API_BASE_URL);
    println!("Making request to: {}", url);

    let mut request = client.get(&url);

    // Add auth header if available
    if let Some(token) = &auth_token {
        println!("Using auth token: {}...", &token[..token.len().min(10)]);
        request = request.header("Authorization", format!("Bearer {}", token));
    }

    // Add email param if provided and no token
    if let Some(email) = &user_email {
        if auth_token.is_none() {
            println!("Using email query param: {}", email);
            request = request.query(&[("email", email)]);
        }
    }

    // Make request
    println!("Sending request...");
    match request.send().await {
        Ok(response) => {
            println!("Received response status: {}", response.status());

            if response.status() == 401 {
                return Ok(LicenseStatus {
                    is_valid: false,
                    status: "not_registered".to_string(),
                    uuid: device_uuid.clone(),
                    email: user_email,
                    registration_url: Some(format!(
                        "https://hasod-41a23.web.app/subscriptions?device_uuid={}",
                        device_uuid
                    )),
                    expires_at: None,
                    error: Some("Authentication required".to_string()),
                });
            }

            if response.status() == 404 {
                return Ok(LicenseStatus {
                    is_valid: false,
                    status: "not_registered".to_string(),
                    uuid: device_uuid.clone(),
                    email: user_email.clone(),
                    registration_url: Some(format!(
                        "https://hasod-41a23.web.app/subscriptions?device_uuid={}",
                        device_uuid
                    )),
                    expires_at: None,
                    error: Some(format!("User {} not found. Please register on the webapp first.", user_email.unwrap_or_default())),
                });
            }

            if !response.status().is_success() {
                return Ok(LicenseStatus {
                    is_valid: false,
                    status: "error".to_string(),
                    uuid: device_uuid,
                    email: user_email,
                    registration_url: None,
                    expires_at: None,
                    error: Some(format!("API returned status: {}", response.status())),
                });
            }

            // Parse response
            match response.json::<UserSubscriptionResponse>().await {
                Ok(data) => {
                    // Check if hasod-downloader service exists
                    if let Some(service) = data.services.get(REQUIRED_SERVICE_ID) {
                        match service.status.as_str() {
                            "active" => {
                                // Convert Firestore timestamp to readable date
                                let expires = service
                                    .expires_at
                                    .as_ref()
                                    .or(service.manual_end_date.as_ref())
                                    .or(service.next_billing_date.as_ref())
                                    .map(|ts| {
                                        chrono::DateTime::from_timestamp(ts.seconds, 0)
                                            .map(|dt| dt.format("%Y-%m-%d").to_string())
                                            .unwrap_or_else(|| "Active subscription".to_string())
                                    })
                                    .unwrap_or_else(|| "Active subscription".to_string());

                                Ok(LicenseStatus {
                                    is_valid: true,
                                    status: "registered".to_string(),
                                    uuid: device_uuid,
                                    email: Some(data.email),
                                    registration_url: None,
                                    expires_at: Some(expires),
                                    error: None,
                                })
                            }
                            "expired" => Ok(LicenseStatus {
                                is_valid: false,
                                status: "expired".to_string(),
                                uuid: device_uuid.clone(),
                                email: Some(data.email),
                                registration_url: Some(format!(
                                    "https://hasod-41a23.web.app/subscriptions?device_uuid={}",
                                    device_uuid
                                )),
                                expires_at: None,
                                error: Some("Subscription expired".to_string()),
                            }),
                            "cancelled" => Ok(LicenseStatus {
                                is_valid: false,
                                status: "suspended".to_string(),
                                uuid: device_uuid.clone(),
                                email: Some(data.email),
                                registration_url: Some(format!(
                                    "https://hasod-41a23.web.app/subscriptions?device_uuid={}",
                                    device_uuid
                                )),
                                expires_at: None,
                                error: Some("Subscription cancelled".to_string()),
                            }),
                            _ => Ok(LicenseStatus {
                                is_valid: false,
                                status: "error".to_string(),
                                uuid: device_uuid,
                                email: Some(data.email),
                                registration_url: None,
                                expires_at: None,
                                error: Some(format!("Unknown status: {}", service.status)),
                            }),
                        }
                    } else {
                        // No hasod-downloader service found
                        Ok(LicenseStatus {
                            is_valid: false,
                            status: "not_registered".to_string(),
                            uuid: device_uuid.clone(),
                            email: Some(data.email),
                            registration_url: Some(format!(
                                "https://hasod-41a23.web.app/subscriptions?device_uuid={}",
                                device_uuid
                            )),
                            expires_at: None,
                            error: Some("No מוריד הסוד subscription found".to_string()),
                        })
                    }
                }
                Err(e) => Ok(LicenseStatus {
                    is_valid: false,
                    status: "error".to_string(),
                    uuid: device_uuid,
                    email: user_email,
                    registration_url: None,
                    expires_at: None,
                    error: Some(format!("Failed to parse response: {}", e)),
                }),
            }
        }
        Err(e) => Ok(LicenseStatus {
            is_valid: false,
            status: "error".to_string(),
            uuid: device_uuid,
            email: user_email,
            registration_url: None,
            expires_at: None,
            error: Some(format!("Network error: {}", e)),
        }),
    }
}

// ============================================================================
// Download Queue Management Commands
// ============================================================================

/// Add a URL to the download queue
#[tauri::command]
fn add_to_queue(url: String) -> Result<DownloadJob, String> {
    let job = DownloadJob::new(url);
    let job_clone = job.clone();

    let mut queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;
    let queue_count = queue.len();
    queue.push(job);

    println!("[Queue] Added job {} ({}) to queue", job_clone.id, job_clone.service.display_name());

    // Immediately update floating panel to show processing status
    #[cfg(target_os = "macos")]
    {
        let service_name = job_clone.service.display_name();
        update_floating_panel_status("processing", 0.0, &format!("Processing {}...", service_name), queue_count + 1);
    }

    Ok(job_clone)
}

/// Add multiple URLs to the queue
#[tauri::command]
fn add_multiple_to_queue(urls: Vec<String>) -> Result<Vec<DownloadJob>, String> {
    let mut jobs = Vec::new();
    let mut queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;

    for url in urls {
        let job = DownloadJob::new(url);
        jobs.push(job.clone());
        queue.push(job);
    }

    println!("[Queue] Added {} jobs to queue", jobs.len());
    Ok(jobs)
}

/// Add Spotify album to queue (fetches all tracks and queues them individually)
#[tauri::command]
async fn add_spotify_album_to_queue(album_url: String) -> Result<Vec<DownloadJob>, String> {
    println!("[Album] Processing Spotify album: {}", album_url);

    // Get album metadata from backend API
    let api_client = api_types::HasodApiClient::production();

    let album_metadata = api_client.get_spotify_album_metadata(&album_url).await?;

    println!("[Album] Album: '{}' by '{}' ({} tracks)",
             album_metadata.album.name,
             album_metadata.album.artist,
             album_metadata.tracks.len());

    // Create jobs for each track
    let mut jobs = Vec::new();
    let mut queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;

    // Create download context for album
    let album_context = DownloadContext::Album(album_metadata.album.name.clone());

    for track in album_metadata.tracks {
        // Create Spotify track URL from track ID
        let track_url = format!("https://open.spotify.com/track/{}", track.track_id);

        let mut job = DownloadJob::new(track_url);

        // Pre-populate metadata so we don't need to fetch it again
        job.metadata = TrackMetadata {
            title: track.name,
            artist: track.artists,
            album: track.album,
            duration: Some((track.duration_ms / 1000) as u32),
            thumbnail: Some(track.image_url),
        };

        // Set album context for proper file organization
        job.download_context = Some(album_context.clone());

        jobs.push(job.clone());
        queue.push(job);
    }

    println!("[Album] ✅ Queued {} tracks from album", jobs.len());

    Ok(jobs)
}

/// Add Spotify playlist to queue (fetches all tracks and queues them individually)
#[tauri::command]
async fn add_spotify_playlist_to_queue(playlist_url: String) -> Result<Vec<DownloadJob>, String> {
    println!("[Playlist] Processing Spotify playlist: {}", playlist_url);

    // Get playlist metadata from backend API
    let api_client = api_types::HasodApiClient::production();

    let playlist_metadata = api_client.get_spotify_playlist_metadata(&playlist_url).await?;

    println!("[Playlist] Playlist: '{}' by '{}' ({} tracks)",
             playlist_metadata.playlist.name,
             playlist_metadata.playlist.owner,
             playlist_metadata.tracks.len());

    // Create jobs for each track
    let mut jobs = Vec::new();
    let mut queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;

    // Create download context for playlist
    let playlist_context = DownloadContext::Playlist(playlist_metadata.playlist.name.clone());

    for track in playlist_metadata.tracks {
        // Create Spotify track URL from track ID
        let track_url = format!("https://open.spotify.com/track/{}", track.track_id);

        let mut job = DownloadJob::new(track_url);

        // Pre-populate metadata so we don't need to fetch it again
        job.metadata = TrackMetadata {
            title: track.name,
            artist: track.artists,
            album: track.album,
            duration: Some((track.duration_ms / 1000) as u32),
            thumbnail: Some(track.image_url),
        };

        // Set playlist context for proper file organization
        job.download_context = Some(playlist_context.clone());

        jobs.push(job.clone());
        queue.push(job);
    }

    println!("[Playlist] ✅ Queued {} tracks from playlist", jobs.len());

    Ok(jobs)
}

/// Get current queue status
#[tauri::command]
fn get_queue_status() -> Result<QueueStatus, String> {
    let queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;
    let is_processing = *QUEUE_PROCESSING.lock().map_err(|e| format!("Lock error: {}", e))?;

    let active_count = queue.iter().filter(|j| j.status == DownloadStatus::Downloading || j.status == DownloadStatus::Converting).count();
    let queued_count = queue.iter().filter(|j| j.status == DownloadStatus::Queued).count();
    let completed_count = queue.iter().filter(|j| j.status == DownloadStatus::Complete).count();
    let error_count = queue.iter().filter(|j| j.status == DownloadStatus::Error).count();

    Ok(QueueStatus {
        jobs: queue.clone(),
        active_count,
        queued_count,
        completed_count,
        error_count,
        is_processing,
    })
}

/// Clear completed and error jobs from queue
#[tauri::command]
fn clear_completed_jobs() -> Result<usize, String> {
    let mut queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;
    let initial_len = queue.len();
    queue.retain(|j| j.status != DownloadStatus::Complete && j.status != DownloadStatus::Error);
    let removed = initial_len - queue.len();
    println!("[Queue] Cleared {} completed/error jobs", removed);
    Ok(removed)
}

/// Remove a specific job from queue
#[tauri::command]
fn remove_from_queue(job_id: String) -> Result<bool, String> {
    let mut queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;
    let initial_len = queue.len();
    queue.retain(|j| j.id != job_id);
    let removed = initial_len != queue.len();
    if removed {
        println!("[Queue] Removed job {}", job_id);
    }
    Ok(removed)
}

/// Helper function to sanitize filename (remove invalid characters)
fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

/// Context for determining file organization
#[derive(Debug, Clone, PartialEq)]
enum DownloadContext {
    Single,              // Single track download
    Album(String),       // Album download with album name
    Playlist(String),    // Playlist download with playlist name
}

/// Helper function to create organized folder structure
/// - Single track: /unsorted/artist - song.mp3
/// - Album: /artist/album name/artist - song.mp3
/// - Playlist: /playlist_name/artist - song.mp3
/// - Filename format MUST be: artist - song.mp3 (not just song.mp3)
fn get_organized_output_path(base_dir: &str, metadata: &TrackMetadata, context: &DownloadContext) -> PathBuf {
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
                .join(if artist.is_empty() || artist == "Unknown Artist" { "Unknown Artist" } else { &artist })
                .join(if album.is_empty() { "Unknown Album" } else { &album })
        }
        DownloadContext::Playlist(playlist_name) => {
            // Playlist: /playlist_name/
            let playlist = sanitize_filename(playlist_name);
            PathBuf::from(base_dir)
                .join(if playlist.is_empty() { "Unknown Playlist" } else { &playlist })
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

/// Spotify track metadata from Web API
#[derive(Debug, Clone)]
struct SpotifyTrackInfo {
    title: String,
    artist: String,
    album: String,
    thumbnail: Option<String>,
    duration_ms: Option<u64>,  // Track duration in milliseconds for verification
}

/// Get Spotify access token using Client Credentials flow
async fn get_spotify_access_token() -> Result<String, String> {
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

    #[derive(serde::Deserialize)]
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
fn extract_spotify_track_id(url: &str) -> Option<String> {
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
async fn get_spotify_metadata_from_api(url: &str) -> Result<SpotifyTrackMetadata, String> {
    println!("[Spotify API] Fetching metadata from backend...");

    // Use the centralized API client
    let api_client = HasodApiClient::production();

    let metadata = api_client.get_spotify_metadata(url).await?;

    println!("[Spotify API] ✅ Got: '{}' by '{}' from album '{}'", metadata.name, metadata.artist, metadata.album);
    println!("[Spotify API] ISRC: {}, Duration: {}ms", metadata.isrc, metadata.duration_ms);

    Ok(metadata)
}

// ============================================================================
// Deezer Download & Decryption Functions
// ============================================================================

/// Decrypt Deezer encrypted MP3/FLAC file using Blowfish CBC
/// Deezer uses a custom encryption scheme where only certain chunks are encrypted
fn decrypt_deezer_file(encrypted_data: &[u8], decryption_key_hex: &str) -> Result<Vec<u8>, String> {
    // Parse hex key to bytes
    let key_bytes = hex::decode(decryption_key_hex)
        .map_err(|e| format!("Invalid decryption key hex: {}", e))?;

    if key_bytes.len() != 16 {
        return Err(format!("Invalid key length: {} bytes (expected 16)", key_bytes.len()));
    }

    let mut decrypted_data = encrypted_data.to_vec();

    // Deezer encryption scheme: only every third 2048-byte chunk is encrypted
    const CHUNK_SIZE: usize = 2048;
    let chunks_count = encrypted_data.len() / CHUNK_SIZE;

    // IV for Deezer CBC mode (constant: 0, 1, 2, 3, 4, 5, 6, 7)
    let iv: [u8; 8] = [0, 1, 2, 3, 4, 5, 6, 7];

    for chunk_idx in 0..chunks_count {
        // Only decrypt every third chunk (chunks 0, 3, 6, 9, ...)
        if chunk_idx % 3 == 0 {
            let chunk_start = chunk_idx * CHUNK_SIZE;
            let chunk_end = (chunk_start + CHUNK_SIZE).min(decrypted_data.len());
            let chunk_len = chunk_end - chunk_start;

            // Only decrypt if we have a full or nearly-full chunk
            if chunk_len >= 8 {
                // Initialize CBC decryptor for this chunk
                let cipher = BlowfishCbc::new_from_slices(&key_bytes, &iv)
                    .map_err(|e| format!("Failed to initialize Blowfish CBC: {}", e))?;

                // Get mutable slice for this chunk (must be aligned to 8-byte blocks)
                let blocks_len = (chunk_len / 8) * 8; // Round down to block boundary
                let chunk_data = &mut decrypted_data[chunk_start..(chunk_start + blocks_len)];

                // Decrypt the chunk in-place
                cipher.decrypt_padded_mut::<cipher::block_padding::NoPadding>(chunk_data)
                    .map_err(|e| format!("Decryption failed: {}", e))?;
            }
        }
    }

    Ok(decrypted_data)
}

/// Download and decrypt track from Deezer using ISRC
/// Returns the path to the decrypted MP3 file
async fn download_and_decrypt_from_deezer(
    isrc: &str,
    auth_token: &str,
    output_path: &str,
) -> Result<String, String> {
    println!("[Deezer] Attempting download for ISRC: {}", isrc);

    // Step 1: Get download URL and decryption key from backend
    let api_client = HasodApiClient::production();

    let deezer_response = api_client
        .get_deezer_download_url(isrc, auth_token, Some(DeezerQuality::Mp3320))
        .await?;

    println!("[Deezer] ✅ Got download URL (quality: {:?})", deezer_response.quality);
    println!("[Deezer] Decryption key: {}", deezer_response.decryption_key);

    // Step 2: Download encrypted file
    println!("[Deezer] Downloading encrypted file...");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300)) // 5 minute timeout
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(&deezer_response.download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download from Deezer: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Deezer download failed with status: {}", response.status()));
    }

    let encrypted_bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read download bytes: {}", e))?;

    println!("[Deezer] Downloaded {} bytes", encrypted_bytes.len());

    // Step 3: Decrypt the file
    println!("[Deezer] Decrypting file...");

    let decrypted_bytes = decrypt_deezer_file(&encrypted_bytes, &deezer_response.decryption_key)?;

    println!("[Deezer] ✅ Decrypted successfully");

    // Step 4: Write decrypted file
    std::fs::write(output_path, decrypted_bytes)
        .map_err(|e| format!("Failed to write decrypted file: {}", e))?;

    println!("[Deezer] ✅ Saved to: {}", output_path);

    Ok(output_path.to_string())
}

/// Get full track metadata from Spotify Web API
async fn get_spotify_track_from_api(track_id: &str) -> Result<SpotifyTrackInfo, String> {
    let token = get_spotify_access_token().await?;

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
        .unwrap_or("")
        .to_string();

    let uploader = json.get("uploader")
        .or_else(|| json.get("channel"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

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
        uploader,
        tier,
        audio_bitrate,
        duration_secs,
    })
}

/// Search YouTube with multiple strategies to find the best quality source
async fn find_best_youtube_source(
    app: &tauri::AppHandle,
    artist: &str,
    title: &str,
    job_id: &str,
) -> Result<String, String> {
    use tauri_plugin_shell::ShellExt;

    // Search queries in priority order
    // We search for multiple results and pick the best one
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
        update_job_status(job_id, DownloadStatus::Downloading, progress,
            &format!("Searching: {} ({}/{})", query, idx + 1, search_queries.len()));
        app.emit("queue-update", get_queue_status().ok()).ok();

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

// ============================================================================
// Apple Music Support (via iTunes Lookup API - no auth needed)
// ============================================================================

/// Apple Music track metadata
#[derive(Debug, Clone)]
struct AppleMusicTrackInfo {
    title: String,
    artist: String,
    album: String,
    artwork_url: Option<String>,
}

/// Extract track ID from Apple Music URL
/// Formats:
/// - https://music.apple.com/us/album/song-name/1234567890?i=1234567891
/// - https://music.apple.com/us/song/song-name/1234567891
fn extract_apple_music_track_id(url: &str) -> Option<String> {
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
async fn get_apple_music_track_info(url: &str) -> Result<(String, String, Option<AppleMusicTrackInfo>), String> {
    // Validate URL type
    let url_lower = url.to_lowercase();
    if url_lower.contains("/artist/") && !url_lower.contains("?i=") {
        return Err("Artist pages cannot be downloaded. Please use a specific song URL.".to_string());
    }
    if url_lower.contains("/playlist/") {
        return Err("Playlist pages are not yet supported. Please use individual song URLs.".to_string());
    }

    // Extract track ID
    let track_id = extract_apple_music_track_id(url)
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

/// Extract Spotify track info - uses Web API if credentials available, falls back to oEmbed
async fn get_spotify_track_info(url: &str) -> Result<(String, String, Option<SpotifyTrackInfo>), String> {
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
        if let Some(track_id) = extract_spotify_track_id(url) {
            match get_spotify_track_from_api(&track_id).await {
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

    // Fallback: Scrape the embed page which contains full metadata (artist, duration, etc.)
    println!("[Spotify] Scraping embed page for metadata (no API credentials configured)");

    let track_id = extract_spotify_track_id(url)
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

    // Extract the JSON data from the page - look for the __NEXT_DATA__ script tag or entity data
    // The page contains JSON with artists, title, duration etc.

    // Try to find artists array: "artists":[{"name":"Artist Name",...}]
    let artist = if let Some(artists_start) = html.find("\"artists\":[") {
        let after_artists = &html[artists_start..];
        // Find the first artist name
        if let Some(name_start) = after_artists.find("\"name\":\"") {
            let name_start_idx = name_start + 8;
            let after_name = &after_artists[name_start_idx..];
            if let Some(name_end) = after_name.find("\"") {
                let artist_name = &after_name[..name_end];
                // Unescape unicode if needed
                artist_name.to_string()
            } else {
                String::new()
            }
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    // Extract title from "name":"Track Title" (appears after type:"track")
    let title = if let Some(name_pattern) = html.find("\"type\":\"track\"") {
        let after_type = &html[name_pattern..];
        if let Some(name_start) = after_type.find("\"name\":\"") {
            let name_start_idx = name_start + 8;
            let after_name = &after_type[name_start_idx..];
            if let Some(name_end) = after_name.find("\"") {
                after_name[..name_end].to_string()
            } else {
                String::new()
            }
        } else {
            String::new()
        }
    } else {
        // Fallback: try to get from title tag or other location
        String::new()
    };

    // Extract duration: "duration":218100 (in milliseconds)
    let duration_ms = if let Some(dur_start) = html.find("\"duration\":") {
        let after_dur = &html[dur_start + 11..];
        // Find where the number ends
        let num_str: String = after_dur.chars().take_while(|c| c.is_ascii_digit()).collect();
        num_str.parse::<u64>().ok()
    } else {
        None
    };

    // Extract album name
    let album = if let Some(album_start) = html.find("\"album\":{") {
        let after_album = &html[album_start..];
        if let Some(name_start) = after_album.find("\"name\":\"") {
            let name_start_idx = name_start + 8;
            let after_name = &after_album[name_start_idx..];
            if let Some(name_end) = after_name.find("\"") {
                after_name[..name_end].to_string()
            } else {
                "Unknown Album".to_string()
            }
        } else {
            "Unknown Album".to_string()
        }
    } else {
        "Unknown Album".to_string()
    };

    // Validate we got the essential data
    if artist.is_empty() || title.is_empty() {
        return Err("Could not extract artist/title from Spotify embed page. The page format may have changed.".to_string());
    }

    println!("[Spotify Embed] Track: '{}' by '{}' from album '{}' ({}ms)",
        title, artist, album, duration_ms.unwrap_or(0));

    let search_query = format!("{} - {}", artist, title);
    let info = SpotifyTrackInfo {
        title,
        artist: artist.clone(),
        album,
        thumbnail: None,
        duration_ms,
    };

    Ok((search_query, artist, Some(info)))
}

/// Spotify track metadata from spotDL save command with --preload
#[derive(Debug, Clone, serde::Deserialize)]
struct SpotDLSongInfo {
    name: String,
    artist: String,
    #[allow(dead_code)]
    artists: Vec<String>,
    album_name: String,
    duration: u64,  // in seconds
    #[serde(default)]
    cover_url: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
    isrc: Option<String>,
    #[serde(default)]
    download_url: Option<String>,  // YouTube URL from --preload
}

/// Download Spotify track using spotDL for metadata + YouTube URL, then our yt-dlp for download
/// Uses single `spotdl save --preload` command for efficiency:
/// - Gets Spotify metadata instantly
/// - Finds YouTube URL via ISRC matching
/// - Returns both in one JSON output
async fn download_with_spotdl(
    app: &AppHandle,
    url: &str,
    output_dir: &str,
    job_id: &str,
    get_queued_count: impl Fn() -> usize,
) -> Result<(String, TrackMetadata), String> {
    use tauri_plugin_shell::ShellExt;
    use std::fs;

    // Use single spotDL command with --preload to get metadata + YouTube URL
    update_job_status(job_id, DownloadStatus::Downloading, 2.0, "Looking up Spotify track...");
    app.emit("queue-update", get_queue_status().ok()).ok();
    #[cfg(target_os = "macos")]
    update_floating_panel_status("fetching", 2.0, "Spotify lookup...", get_queued_count());

    let spotdl_sidecar = app.shell().sidecar("spotdl")
        .map_err(|e| format!("Failed to get spotdl sidecar: {}", e))?;

    // Build args with Spotify credentials
    let mut args = vec!["save".to_string(), url.to_string(), "--save-file".to_string(), "-".to_string(), "--preload".to_string()];

    // Always use public Spotify credentials to avoid rate limiting
    // These are public spotDL credentials - safe to hardcode
    let client_id = SPOTIFY_CLIENT_ID_DEFAULT;
    let client_secret = SPOTIFY_CLIENT_SECRET_DEFAULT;

    println!("[spotdl] Using public Spotify credentials (client_id: {}...)", &client_id[..16]);

    args.push("--client-id".to_string());
    args.push(client_id.to_string());
    args.push("--client-secret".to_string());
    args.push(client_secret.to_string());

    // Use --save-file - to output to stdout, --preload to find YouTube URL
    let (mut rx, _child) = spotdl_sidecar
        .args(args.iter().map(|s| s.as_str()).collect::<Vec<_>>())
        .spawn()
        .map_err(|e| format!("Failed to spawn spotdl: {}", e))?;

    // Collect stdout for JSON parsing, update UI with progress lines
    let mut json_output = String::new();
    let mut found_song_name = String::new();
    let mut in_json = false;

    while let Some(event) = rx.recv().await {
        match event {
            tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                let line_str = String::from_utf8_lossy(&line).to_string();
                println!("[spotdl] {}", line_str);

                // Detect start of JSON array
                if line_str.trim().starts_with('[') {
                    in_json = true;
                }

                if in_json {
                    json_output.push_str(&line_str);
                } else {
                    // Parse progress output for UI updates
                    #[cfg(target_os = "macos")]
                    {
                        if line_str.contains("Processing query") {
                            update_floating_panel_status("fetching", 3.0, "Getting track info...", get_queued_count());
                        } else if line_str.contains("Found url for") {
                            // Extract song name from "Found url for Artist - Title:"
                            if let Some(start) = line_str.find("Found url for ") {
                                let rest = &line_str[start + 14..];
                                if let Some(end) = rest.find(':') {
                                    found_song_name = rest[..end].trim().to_string();
                                    update_floating_panel_status("searching", 8.0, &found_song_name, get_queued_count());
                                }
                            }
                        } else if line_str.starts_with("https://") {
                            update_floating_panel_status("searching", 10.0, "Found match!", get_queued_count());
                        }
                    }
                }
            }
            tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                let line_str = String::from_utf8_lossy(&line).to_string();
                eprintln!("[spotdl stderr] {}", line_str);

                // Check for rate limit errors
                if line_str.contains("rate/request limit") || line_str.contains("Retry will occur after") {
                    return Err("Spotify API rate limited. Please try again later.".to_string());
                }

                #[cfg(target_os = "macos")]
                {
                    if line_str.contains("Processing") || line_str.contains("Fetching") {
                        update_floating_panel_status("fetching", 4.0, "Processing...", get_queued_count());
                    }
                }
            }
            tauri_plugin_shell::process::CommandEvent::Terminated(payload) => {
                if payload.code != Some(0) {
                    return Err(format!("spotdl failed with code: {:?}", payload.code));
                }
                break;
            }
            _ => {}
        }
    }

    // Parse JSON output
    let songs: Vec<SpotDLSongInfo> = serde_json::from_str(&json_output)
        .map_err(|e| format!("Failed to parse spotdl JSON: {} - output was: {}", e, &json_output[..json_output.len().min(200)]))?;

    let song = songs.into_iter().next()
        .ok_or("No song found in spotdl output")?;

    println!("[Spotify] Found: '{}' by '{}' from album '{}' ({}s), YouTube: {:?}",
        song.name, song.artist, song.album_name, song.duration, song.download_url);

    // Update metadata in queue
    let metadata = TrackMetadata {
        title: song.name.clone(),
        artist: song.artist.clone(),
        album: song.album_name.clone(),
        duration: Some(song.duration as u32),
        thumbnail: song.cover_url.clone(),
    };

    {
        let mut queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;
        if let Some(job) = queue.iter_mut().find(|j| j.id == job_id) {
            job.metadata = metadata.clone();
        }
    }
    app.emit("queue-update", get_queue_status().ok()).ok();

    #[cfg(target_os = "macos")]
    update_floating_panel_status("fetching", 12.0, &format!("{} - {}", song.artist, song.name), get_queued_count());

    // Get YouTube URL from spotDL result or fallback to search
    let youtube_url = if let Some(url) = song.download_url.filter(|u| !u.is_empty()) {
        println!("[Spotify] Using spotDL ISRC-matched URL: {}", url);
        url
    } else {
        println!("[Spotify] No URL from spotDL, using YouTube search fallback");
        #[cfg(target_os = "macos")]
        update_floating_panel_status("searching", 5.0, &format!("Searching: {}", song.name), get_queued_count());

        match find_best_youtube_source(app, &song.artist, &song.name, job_id).await {
            Ok(url) => url,
            Err(_) => format!("ytsearch1:{} - {}", song.artist, song.name)
        }
    };

    // Step 3: Download using our yt-dlp
    update_job_status(job_id, DownloadStatus::Downloading, 15.0,
        &format!("Downloading: {} - {}", song.artist, song.name));
    app.emit("queue-update", get_queue_status().ok()).ok();
    #[cfg(target_os = "macos")]
    update_floating_panel_status("downloading", 15.0, &format!("{} - {}", song.artist, song.name), get_queued_count());

    let ytdlp_sidecar = app.shell().sidecar("yt-dlp")
        .map_err(|e| format!("Failed to get yt-dlp sidecar: {}", e))?;

    // Create output directory: Artist/Album/
    let output_path = format!("{}/{}/{}", output_dir, song.artist, song.album_name);
    fs::create_dir_all(&output_path).map_err(|e| format!("Failed to create directory: {}", e))?;

    let output_template = format!("{}/{}.%(ext)s", output_path, song.name);

    let (mut rx, _child) = ytdlp_sidecar
        .args([
            &youtube_url,
            "-f", "bestaudio",
            "--extract-audio",
            "--audio-format", "mp3",
            "--audio-quality", "0",
            "--embed-thumbnail",
            "--add-metadata",
            "--output", &output_template,
            "--progress",
            "--newline",
            "--no-warnings",
        ])
        .spawn()
        .map_err(|e| format!("Failed to spawn yt-dlp: {}", e))?;

    let mut last_progress: f32 = 15.0;
    let mut output_file = String::new();

    while let Some(event) = rx.recv().await {
        match event {
            tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                let line_str = String::from_utf8_lossy(&line).to_string();
                println!("[yt-dlp] {}", line_str);

                // Parse progress
                if line_str.contains("[download]") && line_str.contains("%") {
                    if let Some(pct_str) = line_str.split_whitespace()
                        .find(|s| s.ends_with('%'))
                        .map(|s| s.trim_end_matches('%'))
                    {
                        if let Ok(pct) = pct_str.parse::<f32>() {
                            // Scale progress: 15-90%
                            last_progress = 15.0 + (pct * 0.75);
                            update_job_status(job_id, DownloadStatus::Downloading, last_progress,
                                &format!("Downloading: {} - {} ({}%)", song.artist, song.name, pct as u32));
                            app.emit("queue-update", get_queue_status().ok()).ok();

                            #[cfg(target_os = "macos")]
                            update_floating_panel_status("downloading", last_progress,
                                &format!("{} - {}", song.artist, song.name), get_queued_count());
                        }
                    }
                }

                // Check for conversion phase
                if line_str.contains("[ExtractAudio]") || line_str.contains("[Merger]") {
                    update_job_status(job_id, DownloadStatus::Converting, 92.0, "Converting to MP3...");
                    app.emit("queue-update", get_queue_status().ok()).ok();

                    #[cfg(target_os = "macos")]
                    update_floating_panel_status("converting", 95.0, &song.name, get_queued_count());
                }

                // Try to get output file path
                if line_str.contains("Destination:") {
                    if let Some(path) = line_str.split("Destination:").nth(1) {
                        output_file = path.trim().to_string();
                    }
                }

                app.emit("download-progress", &line_str).ok();
            }
            tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                let line_str = String::from_utf8_lossy(&line).to_string();
                eprintln!("[yt-dlp stderr] {}", line_str);
            }
            tauri_plugin_shell::process::CommandEvent::Terminated(payload) => {
                if payload.code != Some(0) {
                    return Err(format!("yt-dlp exited with code: {:?}", payload.code));
                }
                break;
            }
            _ => {}
        }
    }

    println!("[Spotify] Download complete: {} - {}", song.artist, song.name);
    Ok((output_file, metadata))
}

/// Process a single download job
async fn process_download_job(app: &AppHandle, job_id: String, base_output_dir: String) -> Result<String, String> {
    use tauri_plugin_shell::ShellExt;

    // Get job details
    let (url, service, initial_title, download_context) = {
        let queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;
        let job = queue.iter().find(|j| j.id == job_id).ok_or("Job not found")?;
        (job.url.clone(), job.service.clone(), job.metadata.title.clone(), job.download_context.clone())
    };

    // Helper to get queued count for floating panel
    let get_queued_count = || -> usize {
        DOWNLOAD_QUEUE.lock().map(|q| q.iter().filter(|j| j.status == DownloadStatus::Queued).count()).unwrap_or(0)
    };

    // Update job to downloading
    update_job_status(&job_id, DownloadStatus::Downloading, 0.0, "Starting download...");
    if let Ok(mut queue) = DOWNLOAD_QUEUE.lock() {
        if let Some(job) = queue.iter_mut().find(|j| j.id == job_id) {
            job.started_at = Some(chrono::Utc::now().timestamp());
        }
    }

    // Emit status update
    app.emit("queue-update", get_queue_status().ok()).ok();

    // Update floating panel with initial status
    #[cfg(target_os = "macos")]
    update_floating_panel_status("fetching", 1.0, &initial_title, get_queued_count());

    println!("[Download] Starting {} download for job {}", service.display_name(), job_id);

    // ========================================================================
    // SERVICE-SPECIFIC URL RESOLUTION
    // ========================================================================

    // Store metadata if available for folder structure
    let mut apple_music_metadata: Option<AppleMusicTrackInfo> = None;

    let download_url = if service == MusicService::Spotify {
        // SPOTIFY: Use backend API for complete metadata (ISRC, album, duration)
        println!("[Spotify] Using backend API for metadata extraction");

        // Step 1: Get complete metadata from backend API
        update_job_status(&job_id, DownloadStatus::Downloading, 5.0, "Getting track info...");
        #[cfg(target_os = "macos")]
        update_floating_panel_status("fetching", 5.0, "Fetching metadata...", get_queued_count());

        let spotify_metadata = match get_spotify_metadata_from_api(&url).await {
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
                update_floating_panel_status("error", 0.0, "Error", get_queued_count());
                return Err(error_msg);
            }
        };

        // Update metadata in queue with complete info
        {
            let mut queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;
            if let Some(job) = queue.iter_mut().find(|j| j.id == job_id) {
                job.metadata.title = spotify_metadata.name.clone();
                job.metadata.artist = spotify_metadata.artist.clone();
                job.metadata.album = spotify_metadata.album.clone();
            }
        }

        // Step 2: Try Deezer download first using ISRC
        println!("[Spotify] Attempting Deezer download using ISRC: {}", spotify_metadata.isrc);
        update_job_status(&job_id, DownloadStatus::Downloading, 10.0, "Trying Deezer...");
        #[cfg(target_os = "macos")]
        update_floating_panel_status("downloading", 10.0, "Trying Deezer...", get_queued_count());

        // Get auth token for API - try to get from keychain even if close to expiring
        // The API will validate it anyway, and we'll refresh if needed
        let auth_token: String = get_auth_from_keychain()
            .map(|auth| auth.id_token)
            .unwrap_or_default();

        if !auth_token.is_empty() {
            println!("[Spotify] Using auth token for Deezer API call");
            // Prepare output path for decrypted file using TrackMetadata
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

            // Try Deezer download + decrypt
            match download_and_decrypt_from_deezer(&spotify_metadata.isrc, &auth_token, &temp_deezer_path).await {
                Ok(deezer_file_path) => {
                    println!("[Spotify] ✅ Deezer download successful!");
                    println!("[Spotify] File ready at: {}", deezer_file_path);

                    // Mark as complete
                    update_job_status(&job_id, DownloadStatus::Complete, 100.0, "Download complete");
                    if let Ok(mut queue) = DOWNLOAD_QUEUE.lock() {
                        if let Some(job) = queue.iter_mut().find(|j| j.id == job_id) {
                            job.output_path = Some(deezer_file_path.clone());
                            job.completed_at = Some(chrono::Utc::now().timestamp());
                        }
                    }
                    app.emit("queue-update", get_queue_status().ok()).ok();
                    #[cfg(target_os = "macos")]
                    update_floating_panel_status("complete", 100.0, "Complete", get_queued_count());

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

        // Step 3: Fallback to YouTube if Deezer failed or not available
        println!("[Spotify] Searching YouTube for: {} - {} (Album: {})",
                 spotify_metadata.artist, spotify_metadata.name, spotify_metadata.album);

        // Step 2: Search YouTube with artist + title + album for accurate matching
        update_job_status(&job_id, DownloadStatus::Downloading, 15.0, &format!("Searching: {}", spotify_metadata.name));
        #[cfg(target_os = "macos")]
        update_floating_panel_status("searching", 15.0,
            &format!("{} - {}", spotify_metadata.artist, spotify_metadata.name), get_queued_count());

        // Try to find best YouTube source using artist + title
        // TODO: Enhance search to include album name for even better matching
        match find_best_youtube_source(app, &spotify_metadata.artist, &spotify_metadata.name, &job_id).await {
            Ok(youtube_url) => {
                println!("[Spotify] Found YouTube match: {}", youtube_url);
                println!("[Spotify] Will verify duration: expected {}ms", spotify_metadata.duration_ms);
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
                update_floating_panel_status("error", 0.0, "Error", get_queued_count());
                return Err(error_msg);
            }
        }
    } else if service == MusicService::AppleMusic {
        // Apple Music: Use iTunes Lookup API to get metadata, then search YouTube
        update_job_status(&job_id, DownloadStatus::Downloading, 2.0, "Fetching Apple Music track info...");
        app.emit("queue-update", get_queue_status().ok()).ok();
        #[cfg(target_os = "macos")]
        update_floating_panel_status("fetching", 2.0, "Getting Apple Music info...", get_queued_count());

        match get_apple_music_track_info(&url).await {
            Ok((_search_query_base, _artist, apple_info)) => {
                // Store Apple Music metadata for later use
                apple_music_metadata = apple_info.clone();

                // Use multi-tier search to find the best quality YouTube source
                let (artist, title) = if let Some(ref info) = apple_info {
                    (info.artist.clone(), info.title.clone())
                } else {
                    // Parse from search query base (format: "Artist - Title")
                    let parts: Vec<&str> = _search_query_base.splitn(2, " - ").collect();
                    if parts.len() == 2 {
                        (parts[0].to_string(), parts[1].to_string())
                    } else {
                        ("".to_string(), _search_query_base.clone())
                    }
                };

                println!("[AppleMusic] Finding best YouTube source for: {} - {}", artist, title);
                update_job_status(&job_id, DownloadStatus::Downloading, 3.0,
                    &format!("Finding best quality: {} - {}", artist, title));
                app.emit("queue-update", get_queue_status().ok()).ok();
                #[cfg(target_os = "macos")]
                update_floating_panel_status("searching", 3.0, &format!("{} - {}", artist, title), get_queued_count());

                // Use the multi-tier search strategy
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

    // Get metadata - use Spotify/Apple Music API data if available, otherwise use yt-dlp
    let metadata = {
        update_job_status(&job_id, DownloadStatus::Downloading, 8.0, "Fetching metadata...");
        app.emit("queue-update", get_queue_status().ok()).ok();

        // Use service-specific metadata if available (from API lookups)
        // Note: Spotify is handled separately by spotDL, so this branch is for other services
        let meta = if let Some(ref apple_info) = apple_music_metadata {
            // Use Apple Music metadata from iTunes API
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
            let sidecar = app.shell().sidecar("yt-dlp")
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

            // For Spotify without API credentials, try to extract artist from video title (format: "Artist - Song")
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
            let mut queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;
            if let Some(job) = queue.iter_mut().find(|j| j.id == job_id) {
                job.metadata = meta.clone();
            }
        }

        // Emit queue update so UI shows the resolved song name
        app.emit("queue-update", get_queue_status().ok()).ok();

        // Update floating panel with resolved title
        #[cfg(target_os = "macos")]
        {
            let display_title = if meta.artist.is_empty() {
                meta.title.clone()
            } else {
                format!("{} - {}", meta.artist, meta.title)
            };
            update_floating_panel_status("downloading", 10.0, &display_title, get_queued_count());
        }

        println!("[Metadata] Title: '{}', Artist: '{}', Album: '{}'", meta.title, meta.artist, meta.album);
        meta
    };

    // Calculate output path based on metadata and context
    let context = download_context.as_ref().unwrap_or(&DownloadContext::Single);
    let output_path = get_organized_output_path(&base_output_dir, &metadata, context);
    let output_dir = output_path.parent().unwrap().to_string_lossy().to_string();

    // Ensure output directory exists
    fs::create_dir_all(&output_dir).map_err(|e| format!("Failed to create directory: {}", e))?;

    // Build yt-dlp command with BEST QUALITY settings
    let sidecar = app.shell().sidecar("yt-dlp")
        .map_err(|e| format!("Failed to get yt-dlp sidecar: {}", e))?;

    let output_template = format!("{}/%(title)s.%(ext)s", output_dir);

    // Best quality audio flags:
    // -f bestaudio: Select the highest quality audio stream
    // --audio-quality 0: Best VBR quality when converting to MP3
    // --prefer-free-formats: Prefer opus/vorbis (often better quality)
    let args: Vec<&str> = match service {
        MusicService::YouTube | MusicService::SoundCloud | MusicService::Bandcamp => {
            vec![
                &download_url,
                "-f", "bestaudio",           // Select best audio stream
                "--extract-audio",
                "--audio-format", "mp3",
                "--audio-quality", "0",      // Best VBR quality (320kbps equivalent)
                "--prefer-free-formats",     // Prefer opus/vorbis source
                "--embed-thumbnail",
                "--add-metadata",
                "--output", &output_template,
                "--progress",
                "--newline",
                "--no-warnings",
            ]
        }
        MusicService::AppleMusic => {
            // For Apple Music: download_url is the best YouTube URL found via search
            vec![
                &download_url,
                "-f", "bestaudio",           // Select best audio stream
                "--extract-audio",
                "--audio-format", "mp3",
                "--audio-quality", "0",      // Best VBR quality (320kbps equivalent)
                "--prefer-free-formats",     // Prefer opus/vorbis source
                "--embed-thumbnail",
                "--add-metadata",
                "--output", &output_template,
                "--progress",
                "--newline",
                "--no-warnings",
            ]
        }
        _ => {
            // Default: try direct download with yt-dlp (supports many sites)
            vec![
                &download_url,
                "-f", "bestaudio",           // Select best audio stream
                "--extract-audio",
                "--audio-format", "mp3",
                "--audio-quality", "0",      // Best VBR quality (320kbps equivalent)
                "--prefer-free-formats",     // Prefer opus/vorbis source
                "--embed-thumbnail",
                "--add-metadata",
                "--output", &output_template,
                "--progress",
                "--newline",
                "--no-warnings",
            ]
        }
    };

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

                // Parse progress
                if let Some(pct) = parse_ytdlp_progress(&line_str) {
                    last_progress = pct * 0.9; // Scale to 90% (leave 10% for conversion)
                    update_job_status(&job_id, DownloadStatus::Downloading, last_progress, &format!("Downloading... {:.1}%", pct));

                    // Update floating panel
                    #[cfg(target_os = "macos")]
                    update_floating_panel_status("downloading", pct, &track_title, get_queued_count());
                }

                // Check for conversion phase
                if line_str.contains("[ExtractAudio]") || line_str.contains("[Merger]") {
                    update_job_status(&job_id, DownloadStatus::Converting, 92.0, "Converting to MP3...");

                    // Update floating panel
                    #[cfg(target_os = "macos")]
                    update_floating_panel_status("converting", 95.0, &track_title, get_queued_count());
                }

                // Emit progress event to frontend
                app.emit("download-progress", &line_str).ok();
                app.emit("queue-update", get_queue_status().ok()).ok();
            }
            tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                let line_str = String::from_utf8_lossy(&line).to_string();
                eprintln!("[yt-dlp stderr] {}", line_str);

                // Some "errors" are actually warnings, emit them
                if !line_str.contains("WARNING") {
                    app.emit("download-progress", &format!("⚠️ {}", line_str)).ok();
                }
            }
            tauri_plugin_shell::process::CommandEvent::Error(error) => {
                update_job_status(&job_id, DownloadStatus::Error, last_progress, &format!("Error: {}", error));
                if let Ok(mut queue) = DOWNLOAD_QUEUE.lock() {
                    if let Some(job) = queue.iter_mut().find(|j| j.id == job_id) {
                        job.error = Some(error.clone());
                    }
                }
                app.emit("queue-update", get_queue_status().ok()).ok();

                // Update floating panel with error
                #[cfg(target_os = "macos")]
                update_floating_panel_status("error", 0.0, "Error", get_queued_count());

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

                    // Update floating panel with error
                    #[cfg(target_os = "macos")]
                    update_floating_panel_status("error", 0.0, "Error", get_queued_count());

                    return Err(error_msg);
                }
                break;
            }
            _ => {}
        }
    }

    // Mark as complete
    update_job_status(&job_id, DownloadStatus::Complete, 100.0, "Download complete!");
    {
        let mut queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;
        if let Some(job) = queue.iter_mut().find(|j| j.id == job_id) {
            job.completed_at = Some(chrono::Utc::now().timestamp());
            job.output_path = Some(output_path.to_string_lossy().to_string());
        }
    }

    app.emit("queue-update", get_queue_status().ok()).ok();

    // Update floating panel with complete status
    #[cfg(target_os = "macos")]
    update_floating_panel_status("complete", 100.0, "Done!", get_queued_count());

    Ok("Download complete".to_string())
}

/// Start processing the download queue
#[tauri::command]
async fn start_queue_processing(app: AppHandle) -> Result<(), String> {
    // Check if already processing
    {
        let mut processing = QUEUE_PROCESSING.lock().map_err(|e| format!("Lock error: {}", e))?;
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
        // Find next queued job
        let next_job_id = {
            let queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;
            queue.iter()
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
                // No more jobs
                println!("[Queue] No more jobs to process");
                break;
            }
        }
    }

    // Mark processing as complete
    {
        let mut processing = QUEUE_PROCESSING.lock().map_err(|e| format!("Lock error: {}", e))?;
        *processing = false;
    }

    app.emit("queue-update", get_queue_status().ok()).ok();
    println!("[Queue] Queue processing complete");

    Ok(())
}

/// Legacy download_youtube command - now uses queue
#[tauri::command]
async fn download_youtube(
    app: AppHandle,
    url: String,
    output_dir: String,
) -> Result<String, String> {
    // Add to queue and start processing
    let job = add_to_queue(url)?;
    start_queue_processing(app).await?;
    Ok(format!("Added to queue: {}", job.id))
}

/// Legacy download_spotify command - now uses queue
#[tauri::command]
async fn download_spotify(
    app: AppHandle,
    url: String,
    _output_dir: String,
) -> Result<String, String> {
    // Add to queue and start processing (Spotify is now supported via yt-dlp)
    let job = add_to_queue(url)?;
    start_queue_processing(app).await?;
    Ok(format!("Added to queue: {}", job.id))
}

#[tauri::command]
fn get_download_dir() -> String {
    dirs::download_dir()
        .unwrap_or_else(|| dirs::home_dir().expect("No home dir").join("Downloads"))
        .join("Hasod Downloads")
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
fn create_download_dir() -> Result<String, String> {
    let download_dir = get_download_dir();
    fs::create_dir_all(&download_dir)
        .map_err(|e| format!("Failed to create download directory: {}", e))?;
    Ok(download_dir)
}

// ============================================================================
// OAuth 2.0 Tauri Commands
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct OAuthStartResult {
    pub auth_url: String,
    pub state: String,
}

#[tauri::command]
fn get_hardware_device_id() -> String {
    get_hardware_id()
}

#[tauri::command]
fn start_google_login() -> Result<OAuthStartResult, String> {
    // Generate PKCE values
    let code_verifier = generate_code_verifier();
    let code_challenge = generate_code_challenge(&code_verifier);
    let state = generate_state();

    // Store OAuth state for later verification
    {
        let mut oauth_state = OAUTH_STATE.lock().unwrap();
        *oauth_state = Some(OAuthState {
            code_verifier: code_verifier.clone(),
            state: state.clone(),
        });
    }

    // Build Google OAuth URL - use localhost (not 127.0.0.1) for Google Desktop OAuth
    let redirect_uri = format!("http://localhost:{}/callback", OAUTH_CALLBACK_PORT);
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?\
         client_id={}&\
         redirect_uri={}&\
         response_type=code&\
         scope=email%20profile%20openid&\
         code_challenge={}&\
         code_challenge_method=S256&\
         state={}&\
         access_type=offline&\
         prompt=consent",
        GOOGLE_OAUTH_CLIENT_ID,
        urlencoding::encode(&redirect_uri),
        code_challenge,
        state
    );

    println!("[OAuth] Generated auth URL: {}", auth_url);
    println!("[OAuth] State: {}", state);

    Ok(OAuthStartResult {
        auth_url,
        state,
    })
}

#[tauri::command]
async fn wait_for_oauth_callback(app: AppHandle) -> Result<String, String> {
    println!("[OAuth] Starting callback server on port {}", OAUTH_CALLBACK_PORT);

    // Start local HTTP server to receive callback - bind to both localhost and 127.0.0.1
    let server = Server::http(format!("0.0.0.0:{}", OAUTH_CALLBACK_PORT))
        .map_err(|e| format!("Failed to start callback server: {}", e))?;

    println!("[OAuth] Server started, waiting for callback...");

    // Set a timeout for the server (5 minutes)
    let timeout_duration = std::time::Duration::from_secs(300);
    let start_time = std::time::Instant::now();

    loop {
        // Check timeout
        if start_time.elapsed() > timeout_duration {
            return Err("OAuth callback timed out after 5 minutes".to_string());
        }

        // Non-blocking receive with short timeout
        if let Ok(Some(request)) = server.try_recv() {
            let url_str = format!("http://127.0.0.1{}", request.url());
            println!("[OAuth] Received request: {}", url_str);

            // Parse the callback URL
            if let Ok(url) = Url::parse(&url_str) {
                let params: HashMap<String, String> = url
                    .query_pairs()
                    .map(|(k, v)| (k.to_string(), v.to_string()))
                    .collect();

                // Check for error
                if let Some(error) = params.get("error") {
                    let error_desc = params
                        .get("error_description")
                        .cloned()
                        .unwrap_or_else(|| error.clone());

                    // Send error response to browser
                    let response = Response::from_string(format!(
                        "<html><body><h1>Login Failed</h1><p>{}</p><script>window.close();</script></body></html>",
                        error_desc
                    ));
                    request.respond(response).ok();

                    return Err(format!("OAuth error: {}", error_desc));
                }

                // Get authorization code
                if let Some(code) = params.get("code") {
                    let received_state = params.get("state").cloned().unwrap_or_default();

                    // Verify state
                    let expected_state = {
                        let oauth_state = OAUTH_STATE.lock().unwrap();
                        oauth_state.as_ref().map(|s| s.state.clone())
                    };

                    if Some(received_state.clone()) != expected_state {
                        let response = Response::from_string(
                            "<html><body><h1>Login Failed</h1><p>Invalid state parameter</p></body></html>",
                        );
                        request.respond(response).ok();
                        return Err("OAuth state mismatch - possible CSRF attack".to_string());
                    }

                    // Send success response to browser with proper Content-Type
                    let response = Response::from_string(
                        "<html><head><style>
                            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                                   display: flex; justify-content: center; align-items: center; height: 100vh;
                                   background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; }
                            .container { text-align: center; }
                            h1 { color: #4CAF50; }
                        </style></head>
                        <body><div class='container'>
                            <h1>Login Successful!</h1>
                            <p>You can close this window and return to the app.</p>
                            <script>setTimeout(() => window.close(), 2000);</script>
                        </div></body></html>",
                    ).with_header(
                        tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap()
                    );
                    request.respond(response).ok();

                    // Emit event to frontend
                    app.emit("oauth-callback-received", code.clone()).ok();

                    println!("[OAuth] Authorization code received");
                    return Ok(code.clone());
                }
            }

            // Not a valid callback, send 404
            let response = Response::from_string("Not Found").with_status_code(404);
            request.respond(response).ok();
        }

        // Small sleep to prevent busy loop
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    }
}

#[tauri::command]
async fn exchange_oauth_code(code: String) -> Result<StoredAuth, String> {
    println!("[OAuth] Exchanging authorization code for tokens");

    // Get code verifier from stored state
    let code_verifier = {
        let oauth_state = OAUTH_STATE.lock().unwrap();
        oauth_state
            .as_ref()
            .map(|s| s.code_verifier.clone())
            .ok_or("No OAuth state found - login flow not started")?
    };

    let redirect_uri = format!("http://localhost:{}/callback", OAUTH_CALLBACK_PORT);

    // Exchange code for tokens with Google using PKCE (no client_secret needed)
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    println!("[OAuth] Sending token exchange request to Google...");
    let token_response = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code.as_str()),
            ("client_id", GOOGLE_OAUTH_CLIENT_ID),
            ("client_secret", GOOGLE_OAUTH_CLIENT_SECRET),
            ("redirect_uri", redirect_uri.as_str()),
            ("grant_type", "authorization_code"),
            ("code_verifier", code_verifier.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("Token exchange request failed: {}", e))?;

    println!("[OAuth] Got response with status: {}", token_response.status());

    if !token_response.status().is_success() {
        let error_text = token_response.text().await.unwrap_or_default();
        println!("[OAuth] Token exchange error: {}", error_text);
        return Err(format!("Token exchange failed: {}", error_text));
    }

    #[derive(Deserialize)]
    struct GoogleTokenResponse {
        access_token: String,
        id_token: String,
        refresh_token: Option<String>,
        expires_in: i64,
    }

    let google_tokens: GoogleTokenResponse = token_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    println!("[OAuth] Got Google tokens, now signing in to Firebase");

    // Sign in to Firebase with Google ID token
    let firebase_response = client
        .post(format!(
            "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key={}",
            FIREBASE_API_KEY
        ))
        .json(&serde_json::json!({
            "postBody": format!("id_token={}&providerId=google.com", google_tokens.id_token),
            "requestUri": redirect_uri,
            "returnIdpCredential": true,
            "returnSecureToken": true
        }))
        .send()
        .await
        .map_err(|e| format!("Firebase sign-in failed: {}", e))?;

    let firebase_status = firebase_response.status();
    println!("[OAuth] Firebase response status: {}", firebase_status);

    if !firebase_status.is_success() {
        let error_text = firebase_response.text().await.unwrap_or_default();
        println!("[OAuth] Firebase error: {}", error_text);
        return Err(format!("Firebase sign-in failed: {}", error_text));
    }

    // Get response text first for debugging
    let response_text = firebase_response.text().await.unwrap_or_default();
    println!("[OAuth] Firebase response: {}", &response_text[..response_text.len().min(500)]);

    #[derive(Deserialize)]
    struct FirebaseSignInResponse {
        #[serde(rename = "idToken")]
        id_token: String,
        #[serde(rename = "refreshToken")]
        refresh_token: String,
        #[serde(rename = "expiresIn")]
        expires_in: String,
        email: Option<String>,
        #[serde(rename = "emailVerified")]
        email_verified: Option<bool>,
    }

    let firebase_auth: FirebaseSignInResponse = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse Firebase response: {}", e))?;

    let user_email = firebase_auth.email.unwrap_or_else(|| "unknown@email.com".to_string());
    println!("[OAuth] Firebase sign-in successful for: {}", user_email);

    // Calculate expiration time
    let expires_in_secs: i64 = firebase_auth.expires_in.parse().unwrap_or(3600);
    let expires_at = chrono::Utc::now().timestamp() + expires_in_secs;

    // Create stored auth
    let device_id = get_hardware_id();
    let stored_auth = StoredAuth {
        email: user_email,
        id_token: firebase_auth.id_token,
        refresh_token: firebase_auth.refresh_token,
        expires_at,
        device_id,
    };

    // Save to keychain
    save_auth_to_keychain(&stored_auth)?;

    // Clear OAuth state
    {
        let mut oauth_state = OAUTH_STATE.lock().unwrap();
        *oauth_state = None;
    }

    println!("[OAuth] Auth saved to keychain");

    Ok(stored_auth)
}

#[tauri::command]
fn get_stored_auth() -> Option<StoredAuth> {
    let auth = get_auth_from_keychain()?;

    // Check if token is expired (with 5 minute buffer)
    let now = chrono::Utc::now().timestamp();
    if auth.expires_at < now + 300 {
        println!("[OAuth] Stored auth is expired or about to expire");
        // Token expired or about to expire - could refresh here
        // For now, return None to trigger re-login
        return None;
    }

    Some(auth)
}

#[tauri::command]
async fn refresh_auth_token() -> Result<StoredAuth, String> {
    let current_auth = get_auth_from_keychain().ok_or("No stored auth found")?;

    println!("[OAuth] Refreshing auth token for: {}", current_auth.email);

    let client = reqwest::Client::new();
    let response = client
        .post(format!(
            "https://securetoken.googleapis.com/v1/token?key={}",
            FIREBASE_API_KEY
        ))
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", current_auth.refresh_token.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("Token refresh request failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        // Clear invalid auth
        clear_auth_from_keychain().ok();
        return Err(format!("Token refresh failed: {}", error_text));
    }

    #[derive(Deserialize)]
    struct RefreshResponse {
        id_token: String,
        refresh_token: String,
        expires_in: String,
    }

    let refresh_data: RefreshResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

    let expires_in_secs: i64 = refresh_data.expires_in.parse().unwrap_or(3600);
    let expires_at = chrono::Utc::now().timestamp() + expires_in_secs;

    let new_auth = StoredAuth {
        email: current_auth.email,
        id_token: refresh_data.id_token,
        refresh_token: refresh_data.refresh_token,
        expires_at,
        device_id: current_auth.device_id,
    };

    save_auth_to_keychain(&new_auth)?;

    println!("[OAuth] Auth token refreshed successfully");

    Ok(new_auth)
}

#[tauri::command]
fn logout() -> Result<(), String> {
    println!("[OAuth] Logging out - clearing keychain");
    clear_auth_from_keychain()?;

    // Clear OAuth state
    {
        let mut oauth_state = OAUTH_STATE.lock().unwrap();
        *oauth_state = None;
    }

    Ok(())
}

// ============================================================================
// Floating Window Commands
// ============================================================================

/// Handle dropped link from frontend (HTML5 drag/drop)
#[tauri::command]
fn handle_dropped_link(url: String) -> Result<String, String> {
    println!("[DragDrop] Received dropped link: {}", url);

    // Normalize Spotify URIs to URLs if needed
    let normalized_url = if url.starts_with("spotify:") {
        // Convert spotify:track:xxx to https://open.spotify.com/track/xxx
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

// Global storage for the native floating panel (must persist)
// Store as usize since cocoa::base::id is not Send
#[cfg(target_os = "macos")]
static FLOATING_PANEL: std::sync::Mutex<Option<usize>> = std::sync::Mutex::new(None);

// Global storage for the app handle so the message handler can emit events
#[cfg(target_os = "macos")]
static FLOATING_APP_HANDLE: std::sync::Mutex<Option<AppHandle>> = std::sync::Mutex::new(None);

// Create WKScriptMessageHandler class for URL drops
#[cfg(target_os = "macos")]
fn create_url_handler_class() -> &'static objc::runtime::Class {
    use objc::declare::ClassDecl;
    use objc::runtime::{Class, Object, Sel};
    use objc::sel;
    use objc::sel_impl;
    use cocoa::base::id;

    static mut MESSAGE_HANDLER_CLASS: Option<&'static Class> = None;
    static INIT: std::sync::Once = std::sync::Once::new();

    INIT.call_once(|| {
        let superclass = Class::get("NSObject").unwrap();
        let mut decl = ClassDecl::new("TauriURLDropHandler", superclass).unwrap();

        extern "C" fn did_receive_message(_this: &Object, _sel: Sel, _controller: id, message: id) {
            unsafe {
                use objc::{msg_send, sel, sel_impl};

                let body: id = msg_send![message, body];
                if body.is_null() { return; }

                let utf8: *const std::os::raw::c_char = msg_send![body, UTF8String];
                if utf8.is_null() { return; }

                let url = std::ffi::CStr::from_ptr(utf8).to_string_lossy().to_string();
                println!("[MessageHandler] Received URL: {}", url);

                if let Ok(guard) = FLOATING_APP_HANDLE.lock() {
                    if let Some(ref app) = *guard {
                        use tauri::Emitter;
                        let _ = app.emit("floating-url-dropped", &url);
                        println!("[MessageHandler] Emitted floating-url-dropped event");
                    }
                }
            }
        }

        unsafe {
            decl.add_method(
                sel!(userContentController:didReceiveScriptMessage:),
                did_receive_message as extern "C" fn(&Object, Sel, id, id),
            );
            MESSAGE_HANDLER_CLASS = Some(decl.register());
        }
    });

    unsafe { MESSAGE_HANDLER_CLASS.unwrap() }
}

// Create WKScriptMessageHandler class for window dragging
#[cfg(target_os = "macos")]
fn create_drag_handler_class() -> &'static objc::runtime::Class {
    use objc::declare::ClassDecl;
    use objc::runtime::{Class, Object, Sel};
    use objc::sel;
    use objc::sel_impl;
    use cocoa::base::id;

    static mut DRAG_HANDLER_CLASS: Option<&'static Class> = None;
    static INIT: std::sync::Once = std::sync::Once::new();

    INIT.call_once(|| {
        let superclass = Class::get("NSObject").unwrap();
        let mut decl = ClassDecl::new("TauriDragHandler", superclass).unwrap();

        extern "C" fn did_receive_message(_this: &Object, _sel: Sel, _controller: id, message: id) {
            unsafe {
                use cocoa::foundation::{NSPoint, NSDictionary};
                use objc::{class, msg_send, sel, sel_impl};

                let body: id = msg_send![message, body];
                if body.is_null() { return; }

                // Body should be a dictionary with dx and dy
                let dx_key: id = msg_send![class!(NSString), stringWithUTF8String: "dx\0".as_ptr()];
                let dy_key: id = msg_send![class!(NSString), stringWithUTF8String: "dy\0".as_ptr()];

                let dx_num: id = msg_send![body, objectForKey: dx_key];
                let dy_num: id = msg_send![body, objectForKey: dy_key];

                if dx_num.is_null() || dy_num.is_null() { return; }

                let dx: f64 = msg_send![dx_num, doubleValue];
                let dy: f64 = msg_send![dy_num, doubleValue];

                // Move the panel
                if let Ok(guard) = FLOATING_PANEL.lock() {
                    if let Some(panel_ptr) = *guard {
                        let panel = panel_ptr as id;
                        let frame: cocoa::foundation::NSRect = msg_send![panel, frame];
                        let new_origin = NSPoint::new(frame.origin.x + dx, frame.origin.y - dy);
                        let _: () = msg_send![panel, setFrameOrigin: new_origin];
                    }
                }
            }
        }

        unsafe {
            decl.add_method(
                sel!(userContentController:didReceiveScriptMessage:),
                did_receive_message as extern "C" fn(&Object, Sel, id, id),
            );
            DRAG_HANDLER_CLASS = Some(decl.register());
        }
    });

    unsafe { DRAG_HANDLER_CLASS.unwrap() }
}

#[tauri::command]
fn toggle_floating_window(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use cocoa::base::{id, nil, YES, NO};
        use cocoa::foundation::{NSRect, NSPoint, NSSize, NSString};
        use objc::{class, msg_send, sel, sel_impl};
        use objc::runtime::Object;

        // Store app handle for the message handler to use
        *FLOATING_APP_HANDLE.lock().map_err(|e| format!("Lock error: {}", e))? = Some(app.clone());

        // Check if panel already exists
        {
            let panel_guard = FLOATING_PANEL.lock().map_err(|e| format!("Lock error: {}", e))?;
            if let Some(panel_ptr) = *panel_guard {
                // Panel exists - close it
                let panel = panel_ptr as id;
                unsafe {
                    let _: () = msg_send![panel, close];
                }
                drop(panel_guard);
                *FLOATING_PANEL.lock().map_err(|e| format!("Lock error: {}", e))? = None;
                *FLOATING_WEBVIEW.lock().map_err(|e| format!("Lock error: {}", e))? = None;
                *FLOATING_APP_HANDLE.lock().map_err(|e| format!("Lock error: {}", e))? = None;
                println!("[FloatingPanel] Closed existing panel");
                return Ok(());
            }
        }

        unsafe {
            // NSPanel style masks
            // NSWindowStyleMaskBorderless = 0
            // NSWindowStyleMaskNonactivatingPanel = 1 << 7 = 128
            let style_mask: u64 = 0 | (1 << 7); // Borderless + NonactivatingPanel

            // Create frame (1.5x size: 135x135)
            let frame = NSRect::new(NSPoint::new(100.0, 100.0), NSSize::new(135.0, 135.0));

            // Create NSPanel (not NSWindow!)
            let panel_class = class!(NSPanel);
            let panel: id = msg_send![panel_class, alloc];
            let panel: id = msg_send![panel,
                initWithContentRect:frame
                styleMask:style_mask
                backing:2u64  // NSBackingStoreBuffered
                defer:NO
            ];

            if panel == nil {
                return Err("Failed to create NSPanel".to_string());
            }

            println!("[FloatingPanel] Created NSPanel");

            // Set collection behavior: CanJoinAllSpaces | FullScreenAuxiliary
            // Bit 0 = CanJoinAllSpaces = 1
            // Bit 8 = FullScreenAuxiliary = 256
            let collection_behavior: u64 = (1 << 0) | (1 << 8); // 257
            let _: () = msg_send![panel, setCollectionBehavior: collection_behavior];

            // Panel-specific settings
            // NOTE: setFloatingPanel:YES sets level to NSFloatingWindowLevel(3), so don't call it
            // Instead we set the level manually after showing
            let _: () = msg_send![panel, setHidesOnDeactivate: NO];
            let _: () = msg_send![panel, setWorksWhenModal: YES];

            // Enable dragging by clicking anywhere on the panel
            let _: () = msg_send![panel, setMovableByWindowBackground: YES];

            // Make transparent background
            let _: () = msg_send![panel, setOpaque: NO];
            let clear_color: id = msg_send![class!(NSColor), clearColor];
            let _: () = msg_send![panel, setBackgroundColor: clear_color];

            // Get content view bounds for WKWebView
            let content_view: id = msg_send![panel, contentView];
            let bounds: NSRect = msg_send![content_view, bounds];

            // Create WKWebViewConfiguration with message handler
            let config_class = class!(WKWebViewConfiguration);
            let config: id = msg_send![config_class, new];

            // Get userContentController and add message handlers
            let user_content_controller: id = msg_send![config, userContentController];

            // Add URL drop handler
            let url_handler_class = create_url_handler_class();
            let url_handler: id = msg_send![url_handler_class, new];
            let url_handler_name = NSString::alloc(nil).init_str("urlDropped");
            let _: () = msg_send![user_content_controller, addScriptMessageHandler:url_handler name:url_handler_name];

            // Add drag handler
            let drag_handler_class = create_drag_handler_class();
            let drag_handler: id = msg_send![drag_handler_class, new];
            let drag_handler_name = NSString::alloc(nil).init_str("moveWindow");
            let _: () = msg_send![user_content_controller, addScriptMessageHandler:drag_handler name:drag_handler_name];

            println!("[FloatingPanel] Added message handlers for URL drop and window drag");

            // Create WKWebView
            let webview_class = class!(WKWebView);
            let webview: id = msg_send![webview_class, alloc];
            let webview: id = msg_send![webview, initWithFrame:bounds configuration:config];

            if webview == nil {
                let _: () = msg_send![panel, close];
                return Err("Failed to create WKWebView".to_string());
            }

            // Make webview background transparent
            // Use NSNumber for KVC boolean value (can't use NO directly as it becomes nil)
            let false_value: id = msg_send![class!(NSNumber), numberWithBool:NO];
            let _: () = msg_send![webview, setValue:false_value forKey:NSString::alloc(nil).init_str("drawsBackground")];

            // Set autoresizing mask (NSViewWidthSizable | NSViewHeightSizable = 18)
            let _: () = msg_send![webview, setAutoresizingMask: 18u64];

            // Add webview to panel
            let _: () = msg_send![content_view, addSubview: webview];

            // Register webview for drag types (URLs)
            // Note: We don't actually need native drag registration for HTML5 drag-drop
            // The WKWebView handles it via JavaScript

            // Create inline HTML for the drop zone with cool animations and status
            let html_content = r#"
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            width: 100%; height: 100%;
            background: transparent;
            overflow: hidden;
            -webkit-user-select: none;
            user-select: none;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .container {
            position: relative;
            width: 135px;
            height: 135px;
        }

        /* Rotating gradient ring */
        .ring {
            position: absolute;
            width: 135px;
            height: 135px;
            border-radius: 50%;
            background: conic-gradient(
                from 0deg,
                #667eea, #764ba2, #f093fb, #f5576c,
                #4facfe, #00f2fe, #43e97b, #667eea
            );
            animation: rotate 8s linear infinite;
            opacity: 0.9;
        }

        .ring::before {
            content: '';
            position: absolute;
            inset: 6px;
            border-radius: 50%;
            background: rgba(20, 20, 35, 0.95);
        }

        @keyframes rotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        /* Inner content circle */
        .drop-zone {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 115px;
            height: 115px;
            border-radius: 50%;
            background: radial-gradient(circle at 30% 30%, rgba(60,60,80,0.9), rgba(20,20,35,0.95));
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            cursor: grab;
            transition: all 0.3s ease;
            z-index: 10;
        }

        .drop-zone:active { cursor: grabbing; }

        .status-icon {
            font-size: 28px;
            margin-bottom: 4px;
            transition: transform 0.3s ease;
        }

        .status-text {
            font-size: 11px;
            font-weight: 600;
            text-align: center;
            line-height: 1.3;
            opacity: 0.9;
        }

        .queue-badge {
            position: absolute;
            top: -2px;
            right: -2px;
            min-width: 24px;
            height: 24px;
            background: linear-gradient(135deg, #f5576c, #f093fb);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 700;
            color: white;
            box-shadow: 0 2px 8px rgba(245,87,108,0.5);
            opacity: 0;
            transform: scale(0);
            transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
            z-index: 20;
        }

        .queue-badge.visible {
            opacity: 1;
            transform: scale(1);
        }

        /* State: Idle */
        .container.idle .ring {
            animation-duration: 8s;
            opacity: 0.7;
        }

        /* State: Drag Over */
        .container.drag-over .ring {
            animation-duration: 1s;
            opacity: 1;
            background: conic-gradient(
                from 0deg,
                #43e97b, #38f9d7, #43e97b, #38f9d7,
                #43e97b, #38f9d7, #43e97b, #38f9d7
            );
        }
        .container.drag-over .drop-zone {
            transform: translate(-50%, -50%) scale(1.05);
            background: radial-gradient(circle at 30% 30%, rgba(67,233,123,0.3), rgba(20,20,35,0.95));
        }

        /* State: Downloading */
        .container.downloading .ring {
            animation-duration: 2s;
            opacity: 1;
            background: conic-gradient(
                from 0deg,
                #4facfe, #00f2fe, #4facfe, #00f2fe,
                #4facfe, #00f2fe, #4facfe, #00f2fe
            );
        }
        .container.downloading .status-icon {
            animation: pulse 1s ease-in-out infinite;
        }

        /* State: Complete */
        .container.complete .ring {
            animation-duration: 4s;
            background: conic-gradient(
                from 0deg,
                #43e97b, #38f9d7, #43e97b, #38f9d7,
                #43e97b, #38f9d7, #43e97b, #38f9d7
            );
        }

        /* State: Error */
        .container.error .ring {
            animation-duration: 0.5s;
            background: conic-gradient(
                from 0deg,
                #f5576c, #f093fb, #f5576c, #f093fb,
                #f5576c, #f093fb, #f5576c, #f093fb
            );
        }

        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.2); }
        }

        /* Progress ring */
        .progress-ring {
            position: absolute;
            width: 135px;
            height: 135px;
            transform: rotate(-90deg);
            z-index: 5;
        }

        .progress-ring circle {
            fill: none;
            stroke-width: 4;
            stroke-linecap: round;
        }

        .progress-ring .bg {
            stroke: rgba(255,255,255,0.1);
        }

        .progress-ring .progress {
            stroke: url(#progressGradient);
            stroke-dasharray: 408;
            stroke-dashoffset: 408;
            transition: stroke-dashoffset 0.3s ease;
        }
    </style>
</head>
<body>
    <div class="container idle" id="container">
        <div class="ring"></div>
        <svg class="progress-ring" viewBox="0 0 135 135">
            <defs>
                <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style="stop-color:#4facfe"/>
                    <stop offset="100%" style="stop-color:#00f2fe"/>
                </linearGradient>
            </defs>
            <circle class="bg" cx="67.5" cy="67.5" r="65"/>
            <circle class="progress" id="progressCircle" cx="67.5" cy="67.5" r="65"/>
        </svg>
        <div class="drop-zone" id="dropZone">
            <div class="status-icon" id="statusIcon">🎵</div>
            <div class="status-text" id="statusText">Drop URL<br>Here</div>
        </div>
        <div class="queue-badge" id="queueBadge">0</div>
    </div>

    <script>
        const container = document.getElementById('container');
        const dropZone = document.getElementById('dropZone');
        const statusIcon = document.getElementById('statusIcon');
        const statusText = document.getElementById('statusText');
        const queueBadge = document.getElementById('queueBadge');
        const progressCircle = document.getElementById('progressCircle');

        let isDragging = false;
        let lastX = 0, lastY = 0;
        let currentState = 'idle';
        let queueCount = 0;
        let currentProgress = 0;

        // State management
        function setState(state, data = {}) {
            container.className = 'container ' + state;
            currentState = state;

            switch(state) {
                case 'idle':
                    statusIcon.textContent = '🎵';
                    statusText.innerHTML = 'Drop URL<br>Here';
                    setProgress(0);
                    break;
                case 'drag-over':
                    statusIcon.textContent = '📥';
                    statusText.innerHTML = 'Drop to<br>Download';
                    break;
                case 'processing':
                    statusIcon.textContent = '⏳';
                    const procTitle = data.title || 'Processing...';
                    statusText.innerHTML = truncate(procTitle, 14) + '<br>Please wait...';
                    setProgress(0);
                    break;
                case 'fetching':
                    statusIcon.textContent = '🔍';
                    const fetchTitle = data.title || 'Fetching...';
                    statusText.innerHTML = truncate(fetchTitle, 12) + '<br>Loading...';
                    setProgress(data.progress || 2);
                    break;
                case 'searching':
                    statusIcon.textContent = '🎯';
                    const searchTitle = data.title || 'Searching...';
                    statusText.innerHTML = truncate(searchTitle, 12) + '<br>Finding...';
                    setProgress(data.progress || 5);
                    break;
                case 'downloading':
                    statusIcon.textContent = '⬇️';
                    const progress = data.progress || 0;
                    const title = data.title || 'Downloading...';
                    statusText.innerHTML = truncate(title, 12) + '<br>' + Math.round(progress) + '%';
                    setProgress(progress);
                    break;
                case 'converting':
                    statusIcon.textContent = '🔄';
                    statusText.innerHTML = 'Converting<br>to MP3...';
                    setProgress(95);
                    break;
                case 'complete':
                    statusIcon.textContent = '✅';
                    statusText.innerHTML = 'Done!';
                    setProgress(100);
                    setTimeout(() => {
                        if (queueCount === 0) setState('idle');
                    }, 2000);
                    break;
                case 'error':
                    statusIcon.textContent = '❌';
                    statusText.innerHTML = 'Error';
                    setTimeout(() => setState('idle'), 3000);
                    break;
                case 'queued':
                    statusIcon.textContent = '📋';
                    statusText.innerHTML = queueCount + ' in<br>Queue';
                    break;
            }
        }

        function setProgress(percent) {
            const circumference = 2 * Math.PI * 65;
            const offset = circumference - (percent / 100) * circumference;
            progressCircle.style.strokeDashoffset = offset;
            currentProgress = percent;
        }

        function updateQueueBadge(count) {
            queueCount = count;
            queueBadge.textContent = count;
            queueBadge.classList.toggle('visible', count > 0);
        }

        function truncate(str, len) {
            if (str.length <= len) return str;
            return str.substring(0, len) + '...';
        }

        // Window dragging
        dropZone.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                isDragging = true;
                lastX = e.screenX;
                lastY = e.screenY;
                e.preventDefault();
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const dx = e.screenX - lastX;
                const dy = e.screenY - lastY;
                lastX = e.screenX;
                lastY = e.screenY;
                if (window.webkit?.messageHandlers?.moveWindow) {
                    window.webkit.messageHandlers.moveWindow.postMessage({dx, dy});
                }
            }
        });

        document.addEventListener('mouseup', () => { isDragging = false; });

        // URL drop handling
        document.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isDragging) setState('drag-over');
        });

        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        document.addEventListener('dragleave', (e) => {
            if (e.relatedTarget === null && currentState === 'drag-over') {
                setState(queueCount > 0 ? 'queued' : 'idle');
            }
        });

        document.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();

            let url = '';
            if (e.dataTransfer.types.includes('text/uri-list')) {
                url = e.dataTransfer.getData('text/uri-list');
            } else if (e.dataTransfer.types.includes('text/plain')) {
                url = e.dataTransfer.getData('text/plain');
            }

            if (url) {
                url = url.split('\n').filter(line => !line.startsWith('#'))[0] || url;
                url = url.trim();
            }

            if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('spotify:'))) {
                statusIcon.textContent = '✨';
                statusText.innerHTML = 'Added!';
                // Don't reset - let the Rust backend control the status from here
                if (window.webkit?.messageHandlers?.urlDropped) {
                    window.webkit.messageHandlers.urlDropped.postMessage(url);
                }
            } else {
                setState('error');
            }
        });

        // Expose update function for native code
        window.updateStatus = function(data) {
            if (data.queueCount !== undefined) {
                updateQueueBadge(data.queueCount);
            }
            if (data.state) {
                setState(data.state, data);
            }
        };
    </script>
</body>
</html>
"#;

            // Load HTML string
            let html_nsstring = NSString::alloc(nil).init_str(html_content);
            let base_url: id = nil;
            let _: () = msg_send![webview, loadHTMLString:html_nsstring baseURL:base_url];

            // Position panel in top-right corner (adjusted for 135x135 size)
            let screen: id = msg_send![class!(NSScreen), mainScreen];
            let screen_frame: NSRect = msg_send![screen, frame];
            let x = screen_frame.size.width - 155.0;
            let y = screen_frame.size.height - 175.0;
            let origin = NSPoint::new(x, y);
            let _: () = msg_send![panel, setFrameOrigin: origin];

            // Show panel first
            let _: () = msg_send![panel, orderFrontRegardless];

            // Set level AFTER showing (sometimes needed for it to stick)
            // NSStatusWindowLevel = 25, NSPopUpMenuWindowLevel = 101
            let _: () = msg_send![panel, setLevel: 25i64];

            // Debug output
            let level: i64 = msg_send![panel, level];
            let cb: u64 = msg_send![panel, collectionBehavior];
            let is_floating: bool = msg_send![panel, isFloatingPanel];
            println!("[FloatingPanel] Level: {}, CollectionBehavior: {}, isFloatingPanel: {}", level, cb, is_floating);

            // If level didn't stick, try again with orderFront
            if level != 25 {
                println!("[FloatingPanel] Level didn't stick, trying again...");
                let _: () = msg_send![panel, setLevel: 25i64];
                let _: () = msg_send![panel, orderFront: nil];
                let level2: i64 = msg_send![panel, level];
                println!("[FloatingPanel] Level after retry: {}", level2);
            }

            // Store panel and webview references (as usize for thread safety)
            *FLOATING_PANEL.lock().map_err(|e| format!("Lock error: {}", e))? = Some(panel as usize);
            *FLOATING_WEBVIEW.lock().map_err(|e| format!("Lock error: {}", e))? = Some(webview as usize);

            println!("[FloatingPanel] Native NSPanel created with WKWebView - should appear above fullscreen apps!");
        }

        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        // Fallback for non-macOS - use regular Tauri window
        use tauri::Manager;
        use tauri::WebviewWindowBuilder;
        use tauri::WebviewUrl;

        let window_label = "floating";
        if let Some(window) = app.get_webview_window(window_label) {
            window.close().map_err(|e| format!("Failed to close window: {}", e))?;
            return Ok(());
        }

        let url = WebviewUrl::App("index.html?window=floating".into());
        WebviewWindowBuilder::new(&app, window_label, url)
            .title("Drop Zone")
            .inner_size(90.0, 90.0)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .build()
            .map_err(|e| format!("Failed to create window: {}", e))?;

        Ok(())
    }
}

// Store webview reference for status updates
#[cfg(target_os = "macos")]
static FLOATING_WEBVIEW: std::sync::LazyLock<Mutex<Option<usize>>> =
    std::sync::LazyLock::new(|| Mutex::new(None));

/// Update the floating panel status (call JavaScript in webview)
#[cfg(target_os = "macos")]
fn update_floating_panel_status(state: &str, progress: f32, title: &str, queue_count: usize) {
    use cocoa::base::{id, nil};
    use cocoa::foundation::NSString;
    #[allow(unused_imports)]
    use objc::{msg_send, sel, sel_impl};

    // Get the webview from stored reference
    if let Ok(webview_guard) = FLOATING_WEBVIEW.lock() {
        if let Some(webview_ptr) = *webview_guard {
            let webview = webview_ptr as id;
            unsafe {
                // Create JavaScript to call window.updateStatus
                let js = format!(
                    r#"window.updateStatus({{state:'{}',progress:{},title:'{}',queueCount:{}}})"#,
                    state,
                    progress,
                    title.replace("'", "\\'"),
                    queue_count
                );
                let js_string = NSString::alloc(nil).init_str(&js);
                let _: () = msg_send![webview, evaluateJavaScript:js_string completionHandler:nil];
            }
        }
    }
}

#[tauri::command]
fn is_floating_window_open(_app: AppHandle) -> bool {
    #[cfg(target_os = "macos")]
    {
        if let Ok(guard) = FLOATING_PANEL.lock() {
            return guard.is_some();
        }
        false
    }
    #[cfg(not(target_os = "macos"))]
    {
        use tauri::Manager;
        _app.get_webview_window("floating").is_some()
    }
}

#[tauri::command]
async fn get_clipboard_url() -> Result<String, String> {
    use std::process::Command;

    // Use pbpaste on macOS to get clipboard content
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("pbpaste")
            .output()
            .map_err(|e| format!("Failed to read clipboard: {}", e))?;

        let text = String::from_utf8_lossy(&output.stdout).trim().to_string();

        // Check if it looks like a URL
        if text.starts_with("http://") || text.starts_with("https://") {
            return Ok(text);
        }
        return Err("Clipboard does not contain a valid URL".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        // Windows clipboard reading via PowerShell
        let output = Command::new("powershell")
            .args(["-Command", "Get-Clipboard"])
            .output()
            .map_err(|e| format!("Failed to read clipboard: {}", e))?;

        let text = String::from_utf8_lossy(&output.stdout).trim().to_string();

        if text.starts_with("http://") || text.starts_with("https://") {
            return Ok(text);
        }
        return Err("Clipboard does not contain a valid URL".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        let output = Command::new("xclip")
            .args(["-selection", "clipboard", "-o"])
            .output()
            .map_err(|e| format!("Failed to read clipboard: {}", e))?;

        let text = String::from_utf8_lossy(&output.stdout).trim().to_string();

        if text.starts_with("http://") || text.starts_with("https://") {
            return Ok(text);
        }
        return Err("Clipboard does not contain a valid URL".to_string());
    }

    #[allow(unreachable_code)]
    Err("Unsupported platform".to_string())
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
            let toggle_floating_item = MenuItem::with_id(app, "toggle_floating", "Toggle Drop Zone", true, None::<&str>)?;
            let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&show_item, &toggle_floating_item, &separator, &quit_item])?;

            // Load tray icon from app resources
            let icon = Image::from_path("icons/32x32.png")
                .or_else(|_| Image::from_path("icons/icon.png"))
                .unwrap_or_else(|_| Image::from_bytes(include_bytes!("../icons/32x32.png")).expect("Failed to load embedded icon"));

            // Build the tray icon
            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("Hasod Downloads")
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            // Show/focus the main window
                            if let Some(window) = app.get_webview_window("main") {
                                window.show().ok();
                                window.set_focus().ok();
                            }
                        }
                        "toggle_floating" => {
                            // Toggle the floating window (must run on main thread)
                            let _ = toggle_floating_window(app.clone());
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    // Handle left-click to show main window
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
            // Legacy commands
            get_device_uuid,
            get_registration_url,
            set_auth_token,
            check_license,
            // Download commands (legacy - now use queue)
            download_youtube,
            download_spotify,
            get_download_dir,
            create_download_dir,
            // Queue management commands
            add_to_queue,
            add_multiple_to_queue,
            add_spotify_album_to_queue,
            add_spotify_playlist_to_queue,
            get_queue_status,
            clear_completed_jobs,
            remove_from_queue,
            start_queue_processing,
            // OAuth 2.0 commands
            get_hardware_device_id,
            start_google_login,
            wait_for_oauth_callback,
            exchange_oauth_code,
            get_stored_auth,
            refresh_auth_token,
            logout,
            // Floating window commands
            toggle_floating_window,
            is_floating_window_open,
            get_clipboard_url,
            handle_dropped_link
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
