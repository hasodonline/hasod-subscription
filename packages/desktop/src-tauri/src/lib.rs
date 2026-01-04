// Hasod Downloads - Desktop Application
// License validation and download management with Tauri

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

// ============================================================================
// Data Structures
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
struct ServiceSubscription {
    status: String,
    #[serde(rename = "paymentMethod")]
    payment_method: Option<String>,
    #[serde(rename = "startDate")]
    start_date: Option<String>,
    #[serde(rename = "nextBillingDate")]
    next_billing_date: Option<String>,
    #[serde(rename = "manualEndDate")]
    manual_end_date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct DownloadProgress {
    job_id: String,
    status: String, // "downloading", "converting", "complete", "error"
    progress: f32,
    message: String,
}

// ============================================================================
// License Manager
// ============================================================================

const API_BASE_URL: &str = "https://us-central1-hasod-41a23.cloudfunctions.net/api";
const REQUIRED_SERVICE_ID: &str = "hasod-downloader";

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
    let mut request = client.get(format!("{}/user/subscription-status", API_BASE_URL));

    // Add auth header if available
    if let Some(token) = &auth_token {
        request = request.header("Authorization", format!("Bearer {}", token));
    }

    // Add email param if provided and no token
    if let Some(email) = &user_email {
        if auth_token.is_none() {
            request = request.query(&[("email", email)]);
        }
    }

    // Make request
    match request.send().await {
        Ok(response) => {
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
                                let expires = service
                                    .manual_end_date
                                    .clone()
                                    .or(service.next_billing_date.clone())
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

#[tauri::command]
async fn download_youtube(
    app: AppHandle,
    url: String,
    output_dir: String,
) -> Result<String, String> {
    use tauri_plugin_shell::ShellExt;

    // Spawn yt-dlp process
    let sidecar = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| format!("Failed to get yt-dlp sidecar: {}", e))?;

    let (mut rx, _child) = sidecar
        .args([
            &url,
            "--extract-audio",
            "--audio-format",
            "mp3",
            "--audio-quality",
            "0",
            "--embed-thumbnail",
            "--add-metadata",
            "--output",
            &format!("{}/%(title)s.%(ext)s", output_dir),
            "--progress",
            "--newline",
        ])
        .spawn()
        .map_err(|e| format!("Failed to spawn yt-dlp: {}", e))?;

    // Listen to progress
    let mut output = String::new();
    while let Some(event) = rx.recv().await {
        match event {
            tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                println!("[yt-dlp] {}", line);
                output.push_str(&line);
                output.push('\n');

                // Emit progress event to frontend
                app.emit("download-progress", line.clone()).ok();
            }
            tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                eprintln!("[yt-dlp stderr] {}", line);
            }
            tauri_plugin_shell::process::CommandEvent::Error(error) => {
                return Err(format!("yt-dlp error: {}", error));
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

    Ok("Download complete".to_string())
}

#[tauri::command]
async fn download_spotify(
    app: AppHandle,
    url: String,
    output_dir: String,
) -> Result<String, String> {
    // For Spotify, we'll use yt-dlp with search
    // spotdl is Python-based, so we'll use yt-dlp with ytsearch prefix
    // In production, you might want to:
    // 1. Call Spotify API to get track info
    // 2. Search YouTube for "artist - title"
    // 3. Download from YouTube

    // For now, simple implementation:
    // Extract track name from Spotify URL via API, then search YouTube
    Ok(format!("Spotify download not yet implemented. URL: {}", url))
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
// Main Application
// ============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_device_uuid,
            get_registration_url,
            set_auth_token,
            check_license,
            download_youtube,
            download_spotify,
            get_download_dir,
            create_download_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
