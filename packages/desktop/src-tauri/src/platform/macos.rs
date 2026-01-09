// macOS-specific platform code
// Floating panel implementation using NSPanel and WKWebView

use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use cocoa::base::{id, nil, YES, NO};
use cocoa::foundation::{NSRect, NSPoint, NSSize, NSString};
use objc::{class, msg_send, sel, sel_impl};
use objc::runtime::Object;
use objc::declare::ClassDecl;
use objc::runtime::{Class, Sel};

// ============================================================================
// Global State for Native Floating Panel
// ============================================================================

// Global storage for the native floating panel (must persist)
// Store as usize since cocoa::base::id is not Send
static FLOATING_PANEL: Mutex<Option<usize>> = Mutex::new(None);

// Global storage for the webview reference
pub static FLOATING_WEBVIEW: std::sync::LazyLock<Mutex<Option<usize>>> =
    std::sync::LazyLock::new(|| Mutex::new(None));

// Global storage for the app handle so the message handler can emit events
static FLOATING_APP_HANDLE: Mutex<Option<AppHandle>> = Mutex::new(None);

// ============================================================================
// Objective-C Message Handler Classes
// ============================================================================

/// Create WKScriptMessageHandler class for URL drops
fn create_url_handler_class() -> &'static Class {
    static mut MESSAGE_HANDLER_CLASS: Option<&'static Class> = None;
    static INIT: std::sync::Once = std::sync::Once::new();

    INIT.call_once(|| {
        let superclass = Class::get("NSObject").unwrap();
        let mut decl = ClassDecl::new("TauriURLDropHandler", superclass).unwrap();

        extern "C" fn did_receive_message(_this: &Object, _sel: Sel, _controller: id, message: id) {
            unsafe {
                use objc::{msg_send, sel, sel_impl};

                let body: id = msg_send![message, body];
                if body.is_null() { return; }

                let utf8: *const std::os::raw::c_char = msg_send![body, UTF8String];
                if utf8.is_null() { return; }

                let url = std::ffi::CStr::from_ptr(utf8).to_string_lossy().to_string();
                println!("[MessageHandler] Received URL: {}", url);

                if let Ok(guard) = FLOATING_APP_HANDLE.lock() {
                    if let Some(ref app) = *guard {
                        let _ = app.emit("floating-url-dropped", &url);
                        println!("[MessageHandler] Emitted floating-url-dropped event");
                    }
                }
            }
        }

        unsafe {
            decl.add_method(
                sel!(userContentController:didReceiveScriptMessage:),
                did_receive_message as extern "C" fn(&Object, Sel, id, id),
            );
            MESSAGE_HANDLER_CLASS = Some(decl.register());
        }
    });

    unsafe { MESSAGE_HANDLER_CLASS.unwrap() }
}

/// Create WKScriptMessageHandler class for window dragging
fn create_drag_handler_class() -> &'static Class {
    static mut DRAG_HANDLER_CLASS: Option<&'static Class> = None;
    static INIT: std::sync::Once = std::sync::Once::new();

    INIT.call_once(|| {
        let superclass = Class::get("NSObject").unwrap();
        let mut decl = ClassDecl::new("TauriDragHandler", superclass).unwrap();

        extern "C" fn did_receive_message(_this: &Object, _sel: Sel, _controller: id, message: id) {
            unsafe {
                use cocoa::foundation::{NSPoint, NSDictionary};
                use objc::{class, msg_send, sel, sel_impl};

                let body: id = msg_send![message, body];
                if body.is_null() { return; }

                // Get dx and dy from the message body dictionary
                let dx_key = NSString::alloc(nil).init_str("dx");
                let dy_key = NSString::alloc(nil).init_str("dy");

                let dx_value: id = msg_send![body, objectForKey: dx_key];
                let dy_value: id = msg_send![body, objectForKey: dy_key];

                if dx_value == nil || dy_value == nil { return; }

                let dx: f64 = msg_send![dx_value, doubleValue];
                let dy: f64 = msg_send![dy_value, doubleValue];

                // Get the panel and move it
                if let Ok(panel_guard) = FLOATING_PANEL.lock() {
                    if let Some(panel_ptr) = *panel_guard {
                        let panel = panel_ptr as id;
                        let frame: NSRect = msg_send![panel, frame];
                        let new_origin = NSPoint::new(frame.origin.x + dx, frame.origin.y - dy);
                        let _: () = msg_send![panel, setFrameOrigin: new_origin];
                    }
                }
            }
        }

        unsafe {
            decl.add_method(
                sel!(userContentController:didReceiveScriptMessage:),
                did_receive_message as extern "C" fn(&Object, Sel, id, id),
            );
            DRAG_HANDLER_CLASS = Some(decl.register());
        }
    });

    unsafe { DRAG_HANDLER_CLASS.unwrap() }
}

// ============================================================================
// Floating Panel Manager
// ============================================================================

pub struct FloatingPanelManager;

impl FloatingPanelManager {
    /// Toggle the floating window (create or close)
    pub fn toggle(app: AppHandle) -> Result<(), String> {
        // Store app handle for the message handler to use
        *FLOATING_APP_HANDLE.lock().map_err(|e| format!("Lock error: {}", e))? = Some(app.clone());

        // Check if panel already exists
        {
            let panel_guard = FLOATING_PANEL.lock().map_err(|e| format!("Lock error: {}", e))?;
            if let Some(panel_ptr) = *panel_guard {
                // Panel exists - close it
                let panel = panel_ptr as id;
                unsafe {
                    let _: () = msg_send![panel, close];
                }
                drop(panel_guard);
                *FLOATING_PANEL.lock().map_err(|e| format!("Lock error: {}", e))? = None;
                *FLOATING_WEBVIEW.lock().map_err(|e| format!("Lock error: {}", e))? = None;
                *FLOATING_APP_HANDLE.lock().map_err(|e| format!("Lock error: {}", e))? = None;
                println!("[FloatingPanel] Closed existing panel");
                return Ok(());
            }
        }

        // Create new panel
        Self::create_panel(app)
    }

    /// Check if the floating window is currently open
    pub fn is_open() -> bool {
        if let Ok(guard) = FLOATING_PANEL.lock() {
            return guard.is_some();
        }
        false
    }

    /// Update the floating panel status (call JavaScript in webview)
    pub fn update_status(state: &str, progress: f32, title: &str, queue_count: usize) {
        use cocoa::base::{id, nil};
        use cocoa::foundation::NSString;
        #[allow(unused_imports)]
        use objc::{msg_send, sel, sel_impl};

        // Get the webview from stored reference
        if let Ok(webview_guard) = FLOATING_WEBVIEW.lock() {
            if let Some(webview_ptr) = *webview_guard {
                let webview = webview_ptr as id;
                unsafe {
                    // Create JavaScript to call window.updateStatus
                    let js = format!(
                        r#"window.updateStatus({{state:'{}',progress:{},title:'{}',queueCount:{}}})"#,
                        state,
                        progress,
                        title.replace("'", "\\'"),
                        queue_count
                    );
                    let js_string = NSString::alloc(nil).init_str(&js);
                    let _: () = msg_send![webview, evaluateJavaScript:js_string completionHandler:nil];
                }
            }
        }
    }

    /// Create the native NSPanel with WKWebView
    fn create_panel(app: AppHandle) -> Result<(), String> {
        unsafe {
            // NSPanel style masks
            let style_mask: u64 = 0 | (1 << 7); // Borderless + NonactivatingPanel

            // Create frame (1.5x size: 135x135)
            let frame = NSRect::new(NSPoint::new(100.0, 100.0), NSSize::new(135.0, 135.0));

            // Create NSPanel
            let panel_class = class!(NSPanel);
            let panel: id = msg_send![panel_class, alloc];
            let panel: id = msg_send![panel,
                initWithContentRect:frame
                styleMask:style_mask
                backing:2u64  // NSBackingStoreBuffered
                defer:NO
            ];

            if panel == nil {
                return Err("Failed to create NSPanel".to_string());
            }

            // Configure panel to float above fullscreen apps
            let _: () = msg_send![panel, setLevel: 1025i64]; // NSPopUpMenuWindowLevel (1025)
            let _: () = msg_send![panel, setFloatingPanel: YES];
            let _: () = msg_send![panel, setBecomesKeyOnlyIfNeeded: YES];
            let _: () = msg_send![panel, setWorksWhenModal: YES];

            // NSWindowCollectionBehaviorCanJoinAllSpaces = 1 << 0
            // NSWindowCollectionBehaviorStationary = 1 << 4  
            // NSWindowCollectionBehaviorFullScreenAuxiliary = 1 << 8
            let collection_behavior: u64 = (1 << 0) | (1 << 4) | (1 << 8);
            let _: () = msg_send![panel, setCollectionBehavior: collection_behavior];

            let _: () = msg_send![panel, setBackgroundColor: nil];
            let _: () = msg_send![panel, setOpaque: NO];
            let _: () = msg_send![panel, setHasShadow: YES];
            let _: () = msg_send![panel, setAlphaValue: 1.0f64];
            let _: () = msg_send![panel, setMovableByWindowBackground: NO];
            let _: () = msg_send![panel, setHidesOnDeactivate: NO];

            // Create WKWebView
            let webview_config_class = class!(WKWebViewConfiguration);
            let webview_config: id = msg_send![webview_config_class, new];

            // Get user content controller
            let user_content_controller: id = msg_send![webview_config, userContentController];

            // Register message handlers for JS communication
            let url_handler_class = create_url_handler_class();
            let url_handler: id = msg_send![url_handler_class, new];
            let url_drop_name = NSString::alloc(nil).init_str("urlDrop");
            let _: () = msg_send![user_content_controller, addScriptMessageHandler:url_handler name:url_drop_name];

            let drag_handler_class = create_drag_handler_class();
            let drag_handler: id = msg_send![drag_handler_class, new];
            let drag_name = NSString::alloc(nil).init_str("dragWindow");
            let _: () = msg_send![user_content_controller, addScriptMessageHandler:drag_handler name:drag_name];

            // Create WKWebView
            let webview_class = class!(WKWebView);
            let webview: id = msg_send![webview_class, alloc];
            let webview: id = msg_send![webview, initWithFrame:frame configuration:webview_config];

            if webview == nil {
                let _: () = msg_send![panel, close];
                return Err("Failed to create WKWebView".to_string());
            }

            // Configure webview for transparency - use NSNumber to wrap boolean
            let no_value: id = msg_send![class!(NSNumber), numberWithBool:NO];
            let draws_bg_key = NSString::alloc(nil).init_str("drawsBackground");
            let _: () = msg_send![webview, setValue:no_value forKey:draws_bg_key];

            // Load HTML content (inline to avoid file path issues)
            let html_content = Self::get_html_content();
            let html_ns_string = NSString::alloc(nil).init_str(&html_content);
            let base_url: id = nil;
            let _: () = msg_send![webview, loadHTMLString:html_ns_string baseURL:base_url];

            // Set webview as panel content
            let _: () = msg_send![panel, setContentView: webview];

            // Show the panel
            let _: () = msg_send![panel, orderFront: nil];
            let _: () = msg_send![panel, makeKeyAndOrderFront: nil];

            // Store panel and webview references
            *FLOATING_PANEL.lock().map_err(|e| format!("Lock error: {}", e))? = Some(panel as usize);
            *FLOATING_WEBVIEW.lock().map_err(|e| format!("Lock error: {}", e))? = Some(webview as usize);

            println!("[FloatingPanel] Native NSPanel created successfully!");
        }

        Ok(())
    }

    /// Get the HTML content for the floating panel
    fn get_html_content() -> String {
        r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; overflow: hidden; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
            background: transparent;
            -webkit-user-select: none;
            cursor: default;
        }
        .container {
            width: 135px;
            height: 135px;
            background: linear-gradient(135deg, rgba(26, 26, 46, 0.95) 0%, rgba(22, 33, 62, 0.95) 100%);
            backdrop-filter: blur(20px);
            border-radius: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset;
            position: relative;
            padding: 15px;
        }
        .ring {
            position: absolute;
            width: 100px;
            height: 100px;
            border-radius: 50%;
            border: 3px solid transparent;
            border-top-color: #4CAF50;
            border-right-color: #2196F3;
            animation: rotate 2s linear infinite;
        }
        @keyframes rotate {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .icon {
            font-size: 48px;
            z-index: 2;
            filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
        }
        .text {
            color: white;
            font-size: 11px;
            margin-top: 10px;
            text-align: center;
            z-index: 2;
            max-width: 110px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .queue-count {
            position: absolute;
            top: 8px;
            right: 8px;
            background: rgba(76, 175, 80, 0.9);
            color: white;
            font-size: 10px;
            font-weight: 600;
            padding: 3px 7px;
            border-radius: 10px;
            min-width: 20px;
            text-align: center;
            display: none;
        }
        .queue-count.visible { display: block; }
    </style>
</head>
<body>
    <div class="container" id="container">
        <div class="ring" id="ring"></div>
        <div class="icon" id="icon">📥</div>
        <div class="text" id="text">Drop music link</div>
        <div class="queue-count" id="queueCount">0</div>
    </div>
    <script>
        let isDragging = false;
        let startX = 0, startY = 0;

        // Make window draggable
        document.getElementById('container').addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            window.webkit.messageHandlers.dragWindow.postMessage({dx, dy});
            startX = e.clientX;
            startY = e.clientY;
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });

        // Handle drag & drop
        const container = document.getElementById('container');
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            container.style.transform = 'scale(1.05)';
        });

        container.addEventListener('dragleave', () => {
            container.style.transform = 'scale(1)';
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            container.style.transform = 'scale(1)';
            
            const url = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('URL');
            if (url) {
                window.webkit.messageHandlers.urlDrop.postMessage(url);
            }
        });

        // Update status from Rust
        window.updateStatus = (status) => {
            const icon = document.getElementById('icon');
            const text = document.getElementById('text');
            const ring = document.getElementById('ring');
            const queueCount = document.getElementById('queueCount');

            if (status.queueCount > 0) {
                queueCount.textContent = status.queueCount;
                queueCount.classList.add('visible');
            } else {
                queueCount.classList.remove('visible');
            }

            switch(status.state) {
                case 'idle':
                    icon.textContent = '📥';
                    text.textContent = 'Drop music link';
                    ring.style.display = 'none';
                    break;
                case 'processing':
                case 'fetching':
                    icon.textContent = '🔍';
                    text.textContent = status.title || 'Getting info...';
                    ring.style.display = 'block';
                    break;
                case 'searching':
                    icon.textContent = '🔎';
                    text.textContent = status.title || 'Searching...';
                    ring.style.display = 'block';
                    break;
                case 'downloading':
                    icon.textContent = '⬇️';
                    text.textContent = Math.round(status.progress) + '%';
                    ring.style.display = 'block';
                    break;
                case 'converting':
                    icon.textContent = '🔄';
                    text.textContent = 'Converting...';
                    ring.style.display = 'block';
                    break;
                case 'complete':
                    icon.textContent = '✅';
                    text.textContent = 'Complete!';
                    ring.style.display = 'none';
                    setTimeout(() => {
                        icon.textContent = '📥';
                        text.textContent = 'Drop music link';
                    }, 2000);
                    break;
                case 'error':
                    icon.textContent = '❌';
                    text.textContent = 'Error';
                    ring.style.display = 'none';
                    setTimeout(() => {
                        icon.textContent = '📥';
                        text.textContent = 'Drop music link';
                    }, 3000);
                    break;
            }
        };
    </script>
</body>
</html>"#.to_string()
    }
}

// ============================================================================
// Clipboard Utilities
// ============================================================================

pub struct ClipboardManager;

impl ClipboardManager {
    /// Get URL from clipboard (cross-platform)
    pub async fn get_url() -> Result<String, String> {
        use std::process::Command;

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
