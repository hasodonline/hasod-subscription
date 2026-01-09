// License validation and subscription checking

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;

use crate::utils::get_config_dir;

const API_BASE_URL: &str = "https://us-central1-hasod-41a23.cloudfunctions.net/api";
const REQUIRED_SERVICE_ID: &str = "hasod-downloader";

// ============================================================================
// Types
// ============================================================================

/// License status returned to the frontend
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LicenseStatus {
    pub is_valid: bool,
    pub status: String, // "registered", "not_registered", "expired", "suspended", "error"
    pub uuid: String,
    pub email: Option<String>,
    pub registration_url: Option<String>,
    pub expires_at: Option<String>,
    pub error: Option<String>,
}

/// User subscription response from API
#[derive(Debug, Serialize, Deserialize)]
struct UserSubscriptionResponse {
    email: String,
    services: HashMap<String, ServiceSubscription>,
}

/// Firestore timestamp format
#[derive(Debug, Serialize, Deserialize)]
struct FirestoreTimestamp {
    #[serde(rename = "_seconds")]
    seconds: i64,
    #[serde(rename = "_nanoseconds")]
    nanoseconds: i64,
}

/// Service subscription details
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
// Helper Functions (Legacy auth token - deprecated)
// ============================================================================

/// Get legacy auth token from file storage
/// NOTE: This is deprecated in favor of keychain storage (auth::keychain)
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

/// Save legacy auth token to file storage
/// NOTE: This is deprecated in favor of keychain storage (auth::keychain)
pub fn save_auth_token(token: &str, device_uuid: &str) {
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
// Public Functions
// ============================================================================

/// Get the registration URL for the device
pub fn get_registration_url(device_uuid: &str) -> String {
    format!("https://hasod-41a23.web.app/subscriptions?device_uuid={}", device_uuid)
}

/// Check if the user has a valid license for the hasod-downloader service
/// Returns LicenseStatus with detailed information
pub async fn check_license(user_email: Option<String>, device_uuid: String) -> Result<LicenseStatus, String> {
    let auth_token = get_auth_token();

    // If no auth token and no email, return not registered
    if auth_token.is_none() && user_email.is_none() {
        return Ok(LicenseStatus {
            is_valid: false,
            status: "not_registered".to_string(),
            uuid: device_uuid.clone(),
            email: None,
            registration_url: Some(get_registration_url(&device_uuid)),
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
                    registration_url: Some(get_registration_url(&device_uuid)),
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
                    registration_url: Some(get_registration_url(&device_uuid)),
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
                                registration_url: Some(get_registration_url(&device_uuid)),
                                expires_at: None,
                                error: Some("Subscription expired".to_string()),
                            }),
                            "cancelled" => Ok(LicenseStatus {
                                is_valid: false,
                                status: "suspended".to_string(),
                                uuid: device_uuid.clone(),
                                email: Some(data.email),
                                registration_url: Some(get_registration_url(&device_uuid)),
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
                            registration_url: Some(get_registration_url(&device_uuid)),
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
