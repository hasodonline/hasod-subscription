// Keychain storage for authentication data

use keyring::Entry;
use serde::{Deserialize, Serialize};

const KEYCHAIN_SERVICE: &str = "hasod-downloads";

/// Stored authentication data
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StoredAuth {
    pub email: String,
    pub id_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
    pub device_id: String,
}

/// Get a value from the system keychain
fn get_keychain_entry(key: &str) -> Option<String> {
    let entry = Entry::new(KEYCHAIN_SERVICE, key).ok()?;
    entry.get_password().ok()
}

/// Set a value in the system keychain
fn set_keychain_entry(key: &str, value: &str) -> Result<(), String> {
    let entry =
        Entry::new(KEYCHAIN_SERVICE, key).map_err(|e| format!("Keychain entry error: {}", e))?;
    entry
        .set_password(value)
        .map_err(|e| format!("Keychain set error: {}", e))
}

/// Delete a value from the system keychain
fn delete_keychain_entry(key: &str) -> Result<(), String> {
    let entry =
        Entry::new(KEYCHAIN_SERVICE, key).map_err(|e| format!("Keychain entry error: {}", e))?;
    // Ignore error if entry doesn't exist
    let _ = entry.delete_password();
    Ok(())
}

/// Save authentication data to the system keychain
pub fn save_auth_to_keychain(auth: &StoredAuth) -> Result<(), String> {
    let json = serde_json::to_string(auth).map_err(|e| format!("JSON serialize error: {}", e))?;
    set_keychain_entry("auth_data", &json)
}

/// Retrieve authentication data from the system keychain
pub fn get_auth_from_keychain() -> Option<StoredAuth> {
    let json = get_keychain_entry("auth_data")?;
    serde_json::from_str(&json).ok()
}

/// Clear authentication data from the system keychain
pub fn clear_auth_from_keychain() -> Result<(), String> {
    delete_keychain_entry("auth_data")
}
