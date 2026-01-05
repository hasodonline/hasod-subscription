// Hasod Downloads - Desktop Application
// License validation and download management with Tauri
// OAuth 2.0 + PKCE authentication with device binding

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
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};
use tiny_http::{Response, Server};
use url::Url;
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
const FIREBASE_API_KEY: &str = env!("HASOD_FIREBASE_API_KEY");
const GOOGLE_OAUTH_CLIENT_ID: &str = env!("HASOD_GOOGLE_OAUTH_CLIENT_ID");
const GOOGLE_OAUTH_CLIENT_SECRET: &str = env!("HASOD_GOOGLE_OAUTH_CLIENT_SECRET");
const OAUTH_CALLBACK_PORT: u16 = 8420;
const KEYCHAIN_SERVICE: &str = "hasod-downloads";

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
                let line_str = String::from_utf8_lossy(&line).to_string();
                println!("[yt-dlp] {}", line_str);
                output.push_str(&line_str);
                output.push('\n');

                // Emit progress event to frontend
                app.emit("download-progress", line_str.clone()).ok();
            }
            tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                let line_str = String::from_utf8_lossy(&line).to_string();
                eprintln!("[yt-dlp stderr] {}", line_str);
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
    _app: AppHandle,
    url: String,
    _output_dir: String,
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

    // Exchange code for tokens with Google (desktop apps require client_secret)
    let client = reqwest::Client::new();
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

    if !token_response.status().is_success() {
        let error_text = token_response.text().await.unwrap_or_default();
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

            // Create frame
            let frame = NSRect::new(NSPoint::new(100.0, 100.0), NSSize::new(90.0, 90.0));

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

            // Create inline HTML for the drop zone button with drag support
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
        }
        .drop-zone {
            width: 90px; height: 90px;
            border-radius: 50%;
            background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 11px;
            font-weight: 600;
            text-align: center;
            cursor: grab;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
        }
        .drop-zone:active { cursor: grabbing; }
        .drop-zone.drag-over {
            background: linear-gradient(180deg, #2ecc71 0%, #27ae60 100%);
            transform: scale(1.1);
        }
    </style>
</head>
<body>
    <div class="drop-zone" id="dropZone">Drop<br>URL<br>Here</div>
    <script>
        const dropZone = document.getElementById('dropZone');
        let isDragging = false;
        let lastX = 0, lastY = 0;

        // Window dragging via mouse events
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
            if (!isDragging) dropZone.classList.add('drag-over');
        });

        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        document.addEventListener('dragleave', (e) => {
            if (e.relatedTarget === null) dropZone.classList.remove('drag-over');
        });

        document.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');

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

            if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
                dropZone.textContent = '✓';
                setTimeout(() => { dropZone.innerHTML = 'Drop<br>URL<br>Here'; }, 1000);
                if (window.webkit?.messageHandlers?.urlDropped) {
                    window.webkit.messageHandlers.urlDropped.postMessage(url);
                }
            }
        });
    </script>
</body>
</html>
"#;

            // Load HTML string
            let html_nsstring = NSString::alloc(nil).init_str(html_content);
            let base_url: id = nil;
            let _: () = msg_send![webview, loadHTMLString:html_nsstring baseURL:base_url];

            // Position panel in top-right corner
            let screen: id = msg_send![class!(NSScreen), mainScreen];
            let screen_frame: NSRect = msg_send![screen, frame];
            let x = screen_frame.size.width - 110.0;
            let y = screen_frame.size.height - 150.0;
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

            // Store panel reference as usize
            *FLOATING_PANEL.lock().map_err(|e| format!("Lock error: {}", e))? = Some(panel as usize);

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
            // Download commands
            download_youtube,
            download_spotify,
            get_download_dir,
            create_download_dir,
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
