// File-based storage for authentication data (replaces keychain)

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Stored authentication data
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StoredAuth {
    pub email: String,
    pub id_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
    pub device_id: String,
}

/// Get the path to the auth storage file
fn get_auth_file_path() -> PathBuf {
    let home = dirs::home_dir().expect("Failed to get home directory");
    let config_dir = home.join(".hasod_downloads");
    std::fs::create_dir_all(&config_dir).ok();
    config_dir.join("auth.json")
}

/// Save authentication data to a file
pub fn save_auth_to_keychain(auth: &StoredAuth) -> Result<(), String> {
    let path = get_auth_file_path();
    let json = serde_json::to_string_pretty(auth)
        .map_err(|e| format!("JSON serialize error: {}", e))?;

    fs::write(&path, json)
        .map_err(|e| format!("Failed to write auth file: {}", e))?;

    println!("[Auth] Saved auth to file: {:?}", path);
    Ok(())
}

/// Retrieve authentication data from file
pub fn get_auth_from_keychain() -> Option<StoredAuth> {
    let path = get_auth_file_path();

    if !path.exists() {
        return None;
    }

    let json = fs::read_to_string(&path).ok()?;
    serde_json::from_str(&json).ok()
}

/// Clear authentication data from file
pub fn clear_auth_from_keychain() -> Result<(), String> {
    let path = get_auth_file_path();

    if path.exists() {
        fs::remove_file(&path)
            .map_err(|e| format!("Failed to delete auth file: {}", e))?;
    }

    println!("[Auth] Cleared auth file");
    Ok(())
}
