// Hardware identification and device UUID management

use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

/// Get the directory for storing Hasod Downloads configuration
pub fn get_config_dir() -> PathBuf {
    dirs::home_dir()
        .expect("Cannot find home directory")
        .join(".hasod_downloads")
}

/// Get a stable hardware ID for this device
/// Uses machine-uid library with fallback to stored UUID
pub fn get_hardware_id() -> String {
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

/// Get or create a persistent device UUID stored in ~/.hasod_downloads/device_uuid.json
pub fn get_or_create_device_uuid() -> String {
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
