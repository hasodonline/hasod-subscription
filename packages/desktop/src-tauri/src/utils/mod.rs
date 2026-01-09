// Utility functions module

pub mod hardware;
pub mod filesystem;

// Re-export commonly used functions for convenience
pub use hardware::{get_config_dir, get_hardware_id, get_or_create_device_uuid};
pub use filesystem::{sanitize_filename, get_download_dir, create_download_dir};
