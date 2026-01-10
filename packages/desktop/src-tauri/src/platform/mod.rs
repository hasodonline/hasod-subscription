// Platform-specific functionality
// Clean separation by feature:
// - clipboard.rs: Cross-platform clipboard (all OS)
// - floating_panel_macos.rs: macOS native NSPanel
// - floating_panel_tauri.rs: Windows/Linux Tauri window

// ============================================================================
// Clipboard (Cross-platform)
// ============================================================================

mod clipboard;
pub use clipboard::ClipboardManager;

// ============================================================================
// Floating Panel (Platform-specific)
// ============================================================================

// macOS: Native NSPanel with WKWebView
#[cfg(target_os = "macos")]
mod floating_panel_macos;

#[cfg(target_os = "macos")]
pub use floating_panel_macos::FloatingPanelManager;

// Windows & Linux: Tauri WebviewWindow
#[cfg(not(target_os = "macos"))]
mod floating_panel_tauri;

#[cfg(not(target_os = "macos"))]
pub use floating_panel_tauri::FloatingPanelManager;
