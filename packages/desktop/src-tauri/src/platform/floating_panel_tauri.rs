// Windows/Linux-specific platform code using Tauri windows
// Cross-platform floating panel implementation
// Reuses the same HTML/CSS/JS from floating_panel.html

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

// ============================================================================
// Floating Panel Manager (Tauri-based, cross-platform)
// ============================================================================

pub struct FloatingPanelManager;

impl FloatingPanelManager {
    /// Toggle the floating window (create or close)
    pub fn toggle(app: AppHandle) -> Result<(), String> {
        // Check if window already exists
        if let Some(window) = app.get_webview_window("floating-panel") {
            // Window exists - close it
            window.close().map_err(|e| format!("Failed to close window: {}", e))?;
            println!("[FloatingPanel] Closed existing panel");
            return Ok(());
        }

        // Create new floating panel
        Self::create_panel(app)
    }

    /// Check if the floating window is currently open
    pub fn is_open(app: &AppHandle) -> bool {
        app.get_webview_window("floating-panel").is_some()
    }

    /// Update the floating panel status (call JavaScript in webview)
    pub fn update_status(app: &AppHandle, state: &str, progress: f32, title: &str, queue_count: usize) {
        if let Some(window) = app.get_webview_window("floating-panel") {
            // Create JavaScript to call window.updateStatus
            let js = format!(
                r#"window.updateStatus({{state:'{}',progress:{},title:'{}',queueCount:{}}})"#,
                state,
                progress,
                title.replace("'", "\\'"), // Escape single quotes
                queue_count
            );

            // Execute JavaScript in webview
            if let Err(e) = window.eval(&js) {
                eprintln!("[FloatingPanel] Failed to update status: {}", e);
            }
        }
    }

    /// Create the floating panel window using Tauri's WebviewWindow
    fn create_panel(app: AppHandle) -> Result<(), String> {
        // Load the HTML file from the platform directory
        // The file is embedded at compile time by Tauri
        let url = WebviewUrl::App("floating_panel.html".into());

        // Build the floating panel window
        let window = WebviewWindowBuilder::new(&app, "floating-panel", url)
            .title("Hasod Downloads")
            .inner_size(135.0, 135.0)      // Same size as macOS version
            .decorations(false)             // No title bar or borders
            .always_on_top(true)           // Stay on top of all windows
            .skip_taskbar(true)            // Don't show in taskbar
            .transparent(true)              // Transparent background
            .resizable(false)               // Fixed size
            .visible(true)                  // Show immediately
            .position(100.0, 100.0)        // Initial position
            .build()
            .map_err(|e| format!("Failed to create floating panel: {}", e))?;

        // Enable drag region on the entire window
        // This allows dragging from anywhere on the panel
        #[cfg(target_os = "windows")]
        {
            if let Err(e) = window.set_ignore_cursor_events(false) {
                eprintln!("[FloatingPanel] Warning: Could not set cursor events: {}", e);
            }
        }

        println!("[FloatingPanel] Created Tauri-based floating panel");
        Ok(())
    }

    /// Get the HTML content for the floating panel
    /// This loads from the same file used on macOS
    pub fn get_html_path() -> &'static str {
        "floating_panel.html"
    }
}

// ============================================================================
// Clipboard Manager (Cross-platform, already implemented in macos.rs)
// ============================================================================

// ClipboardManager is already implemented in macos.rs and works on all platforms
// It uses shell commands (pbpaste/PowerShell/xclip) based on the OS
// No need to duplicate the code here - we export it from macos.rs
