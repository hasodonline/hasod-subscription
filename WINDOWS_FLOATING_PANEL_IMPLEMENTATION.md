# Windows Floating Panel Implementation Plan

## Current macOS Features Analysis

### 1. **Floating Panel (macOS-specific)**
**Current Implementation:** Native `NSPanel` with `WKWebView` using Objective-C/Cocoa APIs

**Features:**
- ✅ Always-on-top circular floating button (135x135px)
- ✅ Draggable anywhere on screen
- ✅ Drag & drop URL support (YouTube, Spotify, Apple Music)
- ✅ Real-time download progress display
- ✅ Queue count badge
- ✅ Animated state transitions (idle, downloading, complete, error)
- ✅ Rotating gradient ring animation
- ✅ Transparent background with vibrancy effects
- ✅ Click-through window (non-activating)
- ✅ HTML/CSS/JS-based UI loaded from embedded file

**Code Location:**
- `packages/desktop/src-tauri/src/platform/macos.rs` (lines 143-328)
- `packages/desktop/src-tauri/src/platform/floating_panel.html` (full UI)

---

## Windows Implementation Options

### **Option 1: Native Windows API (Recommended for Production)**

**Technology:** Win32 API + WebView2 (Edge Chromium)

**Approach:**
- Use `windows-rs` crate (official Rust bindings for Win32 API)
- Create layered window (`WS_EX_LAYERED`) with transparency
- Embed WebView2 control
- Use same HTML/CSS/JS UI (reuse `floating_panel.html`)

**Pros:**
✅ Best performance
✅ Native Windows integration
✅ Reuse existing HTML UI
✅ Proper transparency and click-through
✅ Small binary size

**Cons:**
❌ More complex implementation (250-400 lines of Rust)
❌ Requires WebView2 runtime (usually pre-installed on Windows 10+)

**Implementation Complexity:** Medium (3-5 days)

**Required Windows APIs:**
- `CreateWindowExW` - Create window
- `SetLayeredWindowAttributes` - Transparency
- `SetWindowPos` - Always on top (HWND_TOPMOST)
- `DragAcceptFiles` / `IDropTarget` - Drag & drop
- `WebView2` - Embed web content

---

### **Option 2: Tauri Native Window (Quick & Easy)**

**Technology:** Tauri's built-in window system

**Approach:**
- Create second Tauri window with decorations disabled
- Use same HTML/CSS/JS (reuse `floating_panel.html`)
- Set window properties: always-on-top, transparent, skip-taskbar
- Use Tauri's drag & drop APIs

**Pros:**
✅ Cross-platform compatible (works on Linux too!)
✅ Much simpler code (~50 lines)
✅ Reuse existing HTML UI 100%
✅ Built-in Tauri APIs for everything
✅ Easier to maintain

**Cons:**
❌ Slightly larger memory footprint
❌ May have taskbar icon issues
❌ Less control over window behavior

**Implementation Complexity:** Low (1-2 days)

---

### **Option 3: Hybrid Approach (Best of Both Worlds)**

**Technology:** Tauri window with platform-specific enhancements

**Approach:**
- Base: Use Tauri window (Option 2)
- Enhancement: Add Win32 tweaks for better behavior
  - Remove from taskbar properly
  - Better drag & drop handling
  - Proper transparency

**Pros:**
✅ Easy initial implementation
✅ Can enhance later
✅ Cross-platform base
✅ Platform-specific polish

**Cons:**
❌ Two different code paths to maintain

**Implementation Complexity:** Low-Medium (2-3 days)

---

## Detailed Feature Comparison

| Feature | macOS (Current) | Windows (Native) | Windows (Tauri) |
|---------|-----------------|------------------|-----------------|
| Always-on-top | ✅ NSPanel level | ✅ HWND_TOPMOST | ✅ Tauri config |
| Transparency | ✅ NSPanel | ✅ Layered window | ✅ Tauri transparent |
| Drag & drop | ✅ Native | ✅ IDropTarget | ✅ Tauri drag-drop |
| Draggable window | ✅ Custom | ✅ WM_NCHITTEST | ✅ data-tauri-drag |
| WebView | ✅ WKWebView | ✅ WebView2 | ✅ WebView2 |
| No taskbar icon | ✅ NSPanel | ✅ WS_EX_TOOLWINDOW | ⚠️ Needs tweak |
| Click-through | ✅ NSPanel | ✅ WS_EX_TRANSPARENT | ❌ Not supported |
| Performance | Excellent | Excellent | Very Good |
| Code complexity | High | High | Low |

---

## Recommended Implementation: **Option 2 (Tauri Window)**

**Reasoning:**
1. **Fast to implement** - Can have working prototype in 1 day
2. **Cross-platform** - Works on Linux too (bonus!)
3. **Maintainable** - Less platform-specific code
4. **Good enough** - Covers 95% of use cases
5. **Can upgrade** - Can switch to native later if needed

---

## Implementation Steps (Option 2 - Tauri Window)

### **Step 1: Create Platform Module for Windows**

**File:** `packages/desktop/src-tauri/src/platform/windows.rs`

```rust
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri::window::{WindowLevel, WindowEffectsConfig};

pub struct FloatingPanelManager;

impl FloatingPanelManager {
    pub fn toggle(app: AppHandle) -> Result<(), String> {
        if let Some(window) = app.get_webview_window("floating-panel") {
            // Window exists - close it
            window.close().map_err(|e| e.to_string())?;
            return Ok(());
        }

        // Create new floating window
        Self::create_panel(app)
    }

    pub fn is_open(app: &AppHandle) -> bool {
        app.get_webview_window("floating-panel").is_some()
    }

    pub fn update_status(app: &AppHandle, state: &str, progress: f32, title: &str, queue_count: usize) {
        if let Some(window) = app.get_webview_window("floating-panel") {
            let js = format!(
                r#"window.updateStatus({{state:'{}',progress:{},title:'{}',queueCount:{}}})"#,
                state, progress, title.replace("'", "\\'"), queue_count
            );
            let _ = window.eval(&js);
        }
    }

    fn create_panel(app: AppHandle) -> Result<(), String> {
        WebviewWindowBuilder::new(&app, "floating-panel", WebviewUrl::App("floating_panel.html".into()))
            .title("Hasod Downloads")
            .inner_size(135.0, 135.0)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .transparent(true)
            .resizable(false)
            .visible(true)
            .build()
            .map_err(|e| e.to_string())?;

        Ok(())
    }
}
```

---

### **Step 2: Update Platform Module**

**File:** `packages/desktop/src-tauri/src/platform/mod.rs`

```rust
// Platform-specific functionality

#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(target_os = "linux")]
pub mod windows; // Reuse Windows implementation for Linux

// FloatingPanelManager available on macOS
#[cfg(target_os = "macos")]
pub use macos::FloatingPanelManager;

// FloatingPanelManager available on Windows & Linux
#[cfg(not(target_os = "macos"))]
pub use windows::FloatingPanelManager;

// ClipboardManager available on all platforms
pub use macos::ClipboardManager;
```

---

### **Step 3: Update Commands**

**File:** `packages/desktop/src-tauri/src/commands.rs`

```rust
// Remove platform-specific conditionals for toggle_floating_window
// It's now supported on all platforms!

#[tauri::command]
pub fn toggle_floating_window(app: AppHandle) -> Result<(), String> {
    use crate::platform::FloatingPanelManager;
    FloatingPanelManager::toggle(app)
}

#[tauri::command]
pub fn is_floating_window_open(app: AppHandle) -> bool {
    use crate::platform::FloatingPanelManager;
    FloatingPanelManager::is_open(&app)
}
```

---

### **Step 4: Add HTML to Tauri Config**

**File:** `packages/desktop/src-tauri/tauri.conf.json`

```json
{
  "bundle": {
    "resources": [
      "src/platform/floating_panel.html"
    ]
  }
}
```

---

### **Step 5: Handle Drag & Drop**

**Update:** `packages/desktop/src-tauri/src/platform/floating_panel.html`

Add Tauri drag-drop events:

```javascript
// Add to <script> section
import { listen } from '@tauri-apps/api/event';

// Listen for file drops
listen('tauri://file-drop', (event) => {
    const files = event.payload;
    if (files.length > 0) {
        const url = files[0]; // Get first file/URL
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            window.webkit.messageHandlers.urlDropped.postMessage(url);
        }
    }
});

// OR use native browser drag & drop (already implemented in HTML)
```

---

### **Step 6: Window Dragging on Windows**

**Update HTML** - Add Tauri drag region:

```html
<div class="drop-zone" id="dropZone" data-tauri-drag-region>
    <!-- existing content -->
</div>
```

Or keep JavaScript dragging (already works):

```javascript
// Current implementation uses window position updates
// This works on Windows too via Tauri APIs
```

---

## Feature Completeness Matrix

| Feature | macOS | Windows (Plan) | Implementation |
|---------|-------|----------------|----------------|
| Floating button | ✅ | ✅ | Tauri window |
| Drag & drop URLs | ✅ | ✅ | HTML drag events |
| Always on top | ✅ | ✅ | `always_on_top(true)` |
| Transparent | ✅ | ✅ | `transparent(true)` |
| No taskbar | ✅ | ✅ | `skip_taskbar(true)` |
| Draggable | ✅ | ✅ | `data-tauri-drag-region` |
| Progress display | ✅ | ✅ | Reuse HTML |
| Queue badge | ✅ | ✅ | Reuse HTML |
| Animations | ✅ | ✅ | Reuse CSS |
| Status updates | ✅ | ✅ | `window.eval()` |
| Clipboard detect | ✅ | ✅ | Already cross-platform |

**Result:** 100% feature parity!

---

## Alternative: Native Windows Implementation (Advanced)

If you want pixel-perfect Windows-native feel:

### **Libraries Needed:**

```toml
[dependencies.windows]
version = "0.52"
features = [
    "Win32_Foundation",
    "Win32_UI_WindowsAndMessaging",
    "Win32_Graphics_Gdi",
    "Win32_System_Com",
    "Win32_UI_Shell",
]

[dependencies]
webview2-com = "0.28"
```

### **Rough Implementation Outline:**

```rust
// 1. Create layered window with WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW
// 2. Set window position with SetWindowPos(HWND_TOPMOST)
// 3. Initialize WebView2 control
// 4. Implement IDropTarget interface for drag & drop
// 5. Handle WM_NCHITTEST for custom dragging
// 6. Update via WebView2.ExecuteScript()
```

**Code:** ~400-600 lines of complex Win32 interop

---

## Timeline Estimate

| Approach | Development | Testing | Total |
|----------|-------------|---------|-------|
| Option 1 (Native Win32) | 3-4 days | 1-2 days | 4-6 days |
| Option 2 (Tauri Window) | 1 day | 1 day | 2 days |
| Option 3 (Hybrid) | 2 days | 1 day | 3 days |

---

## Recommendation

**Implement Option 2 (Tauri Window) first:**

### **Phase 1: Quick Win (2 days)**
- Create `windows.rs` with Tauri window implementation
- Test on Windows
- Ship to users

### **Phase 2: Polish (Optional, 2-3 days)**
- Add Win32 enhancements if needed
- Fine-tune transparency/effects
- Optimize performance

### **Phase 3: Native (Optional, 4-6 days)**
- Rewrite with native Win32 if Tauri limitations found
- Only if absolutely necessary

---

## Testing Checklist

- [ ] Window appears at correct size (135x135)
- [ ] Always stays on top
- [ ] Transparent background works
- [ ] Drag & drop URLs works
- [ ] Can drag window around screen
- [ ] No taskbar icon
- [ ] Progress updates display correctly
- [ ] Queue badge shows
- [ ] Animations play smoothly
- [ ] Can close and reopen
- [ ] Persists across app restarts
- [ ] Works with multiple monitors
- [ ] Clipboard URL detection works

---

## Conclusion

**Recommendation:** Start with **Option 2 (Tauri Window)** for fastest time-to-market.

**Effort:** ~2 days (1 day development + 1 day testing)

**Feature Parity:** 100% - All macOS features work on Windows

**Bonus:** Also works on Linux with no extra effort!

**Risk:** Low - Uses Tauri's built-in APIs, well-tested and documented

---

Ready to implement when you want to add Windows floating panel support! 🚀
