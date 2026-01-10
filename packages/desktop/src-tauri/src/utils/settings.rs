// App settings storage

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub english_only_mode: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            english_only_mode: false,
        }
    }
}

/// Get the path to the settings file
fn get_settings_path() -> PathBuf {
    let home = dirs::home_dir().expect("Failed to get home directory");
    let config_dir = home.join(".hasod_downloads");
    std::fs::create_dir_all(&config_dir).ok();
    config_dir.join("settings.json")
}

/// Load app settings from file
fn load_settings() -> AppSettings {
    let path = get_settings_path();

    if !path.exists() {
        return AppSettings::default();
    }

    let json = fs::read_to_string(&path).ok();
    json.and_then(|j| serde_json::from_str(&j).ok())
        .unwrap_or_default()
}

/// Save app settings to file
fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let path = get_settings_path();
    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("JSON serialize error: {}", e))?;

    fs::write(&path, json)
        .map_err(|e| format!("Failed to write settings file: {}", e))?;

    Ok(())
}

/// Get English Only mode setting
pub fn get_english_only_mode() -> bool {
    load_settings().english_only_mode
}

/// Set English Only mode setting
pub fn set_english_only_mode(enabled: bool) -> Result<(), String> {
    let mut settings = load_settings();
    settings.english_only_mode = enabled;
    save_settings(&settings)?;
    println!("[Settings] English Only mode set to: {}", enabled);
    Ok(())
}
