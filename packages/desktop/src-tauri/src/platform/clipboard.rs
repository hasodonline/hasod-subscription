// Cross-platform clipboard utilities
// Works on macOS, Windows, and Linux using shell commands

use std::process::Command;

/// Cross-platform clipboard manager
/// Uses native shell commands for clipboard access:
/// - macOS: pbpaste
/// - Windows: PowerShell Get-Clipboard
/// - Linux: xclip
pub struct ClipboardManager;

impl ClipboardManager {
    /// Get URL from clipboard (cross-platform)
    /// Returns Ok(url) if clipboard contains a valid HTTP/HTTPS URL
    /// Returns Err if clipboard is empty, not a URL, or clipboard access fails
    pub async fn get_url() -> Result<String, String> {
        // macOS: use pbpaste
        #[cfg(target_os = "macos")]
        {
            let output = Command::new("pbpaste")
                .output()
                .map_err(|e| format!("Failed to read clipboard: {}", e))?;

            let text = String::from_utf8_lossy(&output.stdout).trim().to_string();

            if text.starts_with("http://") || text.starts_with("https://") {
                return Ok(text);
            }
            return Err("Clipboard does not contain a valid URL".to_string());
        }

        // Windows: use PowerShell
        #[cfg(target_os = "windows")]
        {
            let output = Command::new("powershell")
                .args(["-Command", "Get-Clipboard"])
                .output()
                .map_err(|e| format!("Failed to read clipboard: {}", e))?;

            let text = String::from_utf8_lossy(&output.stdout).trim().to_string();

            if text.starts_with("http://") || text.starts_with("https://") {
                return Ok(text);
            }
            return Err("Clipboard does not contain a valid URL".to_string());
        }

        // Linux: use xclip
        #[cfg(target_os = "linux")]
        {
            let output = Command::new("xclip")
                .args(["-selection", "clipboard", "-o"])
                .output()
                .map_err(|e| format!("Failed to read clipboard: {}", e))?;

            let text = String::from_utf8_lossy(&output.stdout).trim().to_string();

            if text.starts_with("http://") || text.starts_with("https://") {
                return Ok(text);
            }
            return Err("Clipboard does not contain a valid URL".to_string());
        }

        #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
        {
            Err("Clipboard reading not supported on this platform".to_string())
        }
    }
}
