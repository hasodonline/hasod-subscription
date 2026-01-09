// Platform-specific functionality

// macos module contains cross-platform ClipboardManager, so always compile it
pub mod macos;

#[cfg(target_os = "macos")]
pub use macos::FloatingPanelManager;

// ClipboardManager is available on all platforms (implementation in macos.rs)
pub use macos::ClipboardManager;
