// OAuth 2.0 + PKCE authentication flow for Google Sign-In

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tiny_http::{Response, Server};
use url::Url;

use super::keychain::{StoredAuth, save_auth_to_keychain, get_auth_from_keychain, clear_auth_from_keychain};
use crate::utils::get_hardware_id;

/// OAuth state stored during the authentication flow
#[derive(Debug, Serialize, Deserialize)]
struct OAuthState {
    code_verifier: String,
    state: String,
}

/// Global state for OAuth flow
static OAUTH_STATE: std::sync::LazyLock<Mutex<Option<OAuthState>>> =
    std::sync::LazyLock::new(|| Mutex::new(None));

// OAuth constants
const OAUTH_CALLBACK_PORT: u16 = 8420;

/// Result returned when starting the OAuth flow
#[derive(Debug, Serialize, Deserialize)]
pub struct OAuthStartResult {
    pub auth_url: String,
    pub state: String,
}

// ============================================================================
// PKCE Helper Functions
// ============================================================================

/// Generate a random code verifier for PKCE
fn generate_code_verifier() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..64).map(|_| rng.gen()).collect();
    URL_SAFE_NO_PAD.encode(&bytes)
}

/// Generate a code challenge from a verifier for PKCE
fn generate_code_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let hash = hasher.finalize();
    URL_SAFE_NO_PAD.encode(&hash)
}

/// Generate a random state parameter for CSRF protection
fn generate_state() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..16).map(|_| rng.gen()).collect();
    URL_SAFE_NO_PAD.encode(&bytes)
}

// ============================================================================
// Public OAuth Functions
// ============================================================================

/// Start the Google OAuth login flow
/// Returns the authorization URL and state for verification
pub fn start_google_login(
    google_client_id: &str,
) -> Result<OAuthStartResult, String> {
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
        google_client_id,
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

/// Wait for the OAuth callback from Google
/// Starts a local HTTP server and waits for the authorization code
pub async fn wait_for_oauth_callback(app: AppHandle) -> Result<String, String> {
    println!("[OAuth] Starting callback server on port {}", OAUTH_CALLBACK_PORT);

    // Start local HTTP server to receive callback
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

                    // Send success response to browser
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

/// Exchange the authorization code for tokens and sign in to Firebase
pub async fn exchange_oauth_code(
    code: String,
    google_client_id: &str,
    google_client_secret: &str,
    firebase_api_key: &str,
) -> Result<StoredAuth, String> {
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

    // Exchange code for tokens with Google using PKCE
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    println!("[OAuth] Sending token exchange request to Google...");
    let token_response = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code.as_str()),
            ("client_id", google_client_id),
            ("client_secret", google_client_secret),
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
        #[allow(dead_code)]
        access_token: String,
        id_token: String,
        #[allow(dead_code)]
        refresh_token: Option<String>,
        #[allow(dead_code)]
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
            firebase_api_key
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
        #[allow(dead_code)]
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

/// Get stored authentication data from keychain
/// Returns None if expired or not found
pub fn get_stored_auth() -> Option<StoredAuth> {
    let auth = get_auth_from_keychain()?;

    // Check if token is expired (with 5 minute buffer)
    let now = chrono::Utc::now().timestamp();
    if auth.expires_at < now + 300 {
        println!("[OAuth] Stored auth is expired or about to expire");
        return None;
    }

    Some(auth)
}

/// Refresh the authentication token using the refresh token
pub async fn refresh_auth_token(firebase_api_key: &str) -> Result<StoredAuth, String> {
    let current_auth = get_auth_from_keychain().ok_or("No stored auth found")?;

    println!("[OAuth] Refreshing auth token for: {}", current_auth.email);

    let client = reqwest::Client::new();
    let response = client
        .post(format!(
            "https://securetoken.googleapis.com/v1/token?key={}",
            firebase_api_key
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

/// Logout the user by clearing stored authentication data
pub fn logout() -> Result<(), String> {
    println!("[OAuth] Logging out - clearing keychain");
    clear_auth_from_keychain()?;

    // Clear OAuth state
    {
        let mut oauth_state = OAUTH_STATE.lock().unwrap();
        *oauth_state = None;
    }

    Ok(())
}
