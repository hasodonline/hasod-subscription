---
name: desktop-app
description: Develop Tauri desktop application (packages/desktop/) with Rust backend and React frontend. Features native macOS floating drop zone panel, Google OAuth with PKCE, keychain auth storage, and yt-dlp downloads. Use when working on desktop app, floating panel, OAuth flow, or download functionality.
---

# Desktop Application Development Skill

## Quick Reference

```bash
# Development
cd packages/desktop && npm run dev

# Build (creates .app and .dmg)
cd packages/desktop && npm run build

# Run built app directly
./packages/desktop/src-tauri/target/release/bundle/macos/Hasod\ Downloads.app/Contents/MacOS/hasod-downloads
```

## When to Use This Skill

Use for:
- Tauri desktop app development (Rust backend + React frontend)
- Floating drop zone panel (NSPanel + WKWebView)
- Google OAuth authentication with PKCE
- Download functionality (yt-dlp sidecar)
- License validation against Hasod API
- macOS/Windows builds and distribution

Do NOT use for:
- Webapp (`packages/webapp/`) → use webapp-backend skill
- Backend functions (`packages/functions/`) → use webapp-backend skill
- Modifying shared package (`packages/shared/`) → read-only for this skill

## Architecture Overview

```
packages/desktop/
├── src/                          # React frontend (TypeScript)
│   ├── App.tsx                   # Main UI, event listeners
│   ├── App.css                   # Dark theme styling
│   └── main.tsx                  # Entry point
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   └── lib.rs                # Core logic (1300+ lines)
│   ├── .cargo/config.toml        # OAuth secrets (gitignored)
│   ├── cargo-config.toml.example # Template for secrets
│   ├── Cargo.toml                # Rust dependencies
│   ├── tauri.conf.json           # Tauri configuration
│   └── binaries/                 # yt-dlp, ffmpeg sidecars
└── package.json
```

## Floating Drop Zone Panel

### How It Works

The floating panel stays visible above ALL windows (including fullscreen apps) using native macOS NSPanel instead of Tauri's WebviewWindow.

**Architecture:**
1. **NSPanel** (not NSWindow) with `NSWindowStyleMaskNonactivatingPanel`
2. **WKWebView** inside panel for HTML/CSS/JS UI
3. **WKScriptMessageHandler** bridges JS → Rust
4. **Tauri events** bridge Rust → React frontend

### Communication Flow

```
[User drops URL on floating panel]
        ↓
[WKWebView JS: drop event]
        ↓
[JS calls: webkit.messageHandlers.urlDropped.postMessage(url)]
        ↓
[Rust: WKScriptMessageHandler receives message]
        ↓
[Rust: app.emit("floating-url-dropped", url)]
        ↓
[React: listen<string>("floating-url-dropped", callback)]
        ↓
[React: invoke("download_youtube", {url, outputDir})]
```

### Key Code Locations

**Rust (lib.rs):**
- `FLOATING_PANEL: Mutex<Option<usize>>` - Panel pointer storage (line ~120)
- `FLOATING_APP_HANDLE: Mutex<Option<AppHandle>>` - For event emission (line ~122)
- `create_url_handler_class()` - WKScriptMessageHandler for URL drops (line ~1000)
- `create_drag_handler_class()` - WKScriptMessageHandler for dragging (line ~1060)
- `toggle_floating_window()` - Creates/destroys NSPanel (line ~1120)

**React (App.tsx):**
- `handleFloatingDownload()` - Processes dropped URLs (line ~53)
- `listen("floating-url-dropped", ...)` - Event listener (line ~94)

### NSPanel Configuration

```rust
// Style mask: Borderless + NonactivatingPanel
let style_mask: u64 = 0 | (1 << 7);

// Collection behavior: CanJoinAllSpaces + FullScreenAuxiliary
let behavior: u64 = (1 << 0) | (1 << 8); // = 257

// Window level: NSStatusWindowLevel (above fullscreen)
let _: () = msg_send![panel, setLevel: 25i64];
```

### Dragging Implementation

WKWebView blocks `setMovableByWindowBackground`, so dragging is implemented via JS:
1. JS tracks mousedown/mousemove/mouseup events
2. JS sends dx/dy deltas to `webkit.messageHandlers.moveWindow`
3. Rust adjusts panel frame origin

## OAuth Authentication

### Flow (PKCE)

1. `start_google_login()` - Generate code_verifier, code_challenge, auth URL
2. Open browser to Google OAuth consent screen
3. `wait_for_oauth_callback()` - Local HTTP server on port 8420
4. `exchange_oauth_code()` - Exchange code for tokens with Google
5. Sign in to Firebase with Google ID token
6. Store auth in macOS Keychain via `security-framework`

### Environment Variables

OAuth secrets are compile-time env vars (not in source code):

```bash
# Create .cargo/config.toml from template
cd packages/desktop/src-tauri
mkdir -p .cargo
cp cargo-config.toml.example .cargo/config.toml
# Edit .cargo/config.toml with actual values
```

**Required variables:**
- `HASOD_FIREBASE_API_KEY`
- `HASOD_GOOGLE_OAUTH_CLIENT_ID`
- `HASOD_GOOGLE_OAUTH_CLIENT_SECRET`

### Keychain Storage

Auth tokens stored securely in macOS Keychain:
- Service: `hasod-downloads`
- Account: `auth`
- Data: JSON with email, id_token, refresh_token, expires_at, device_id

## Tauri Commands

### License Management
```rust
get_device_uuid() -> String
get_registration_url() -> String
get_stored_auth() -> Option<StoredAuth>
check_license(user_email: String) -> LicenseStatus
start_google_login() -> OAuthStartResult
wait_for_oauth_callback() -> String
exchange_oauth_code(code: String) -> StoredAuth
refresh_auth_token() -> StoredAuth
logout()
```

### Download Management
```rust
download_youtube(url: String, output_dir: String) -> Result<String>
create_download_dir() -> Result<String>
```

### Floating Panel
```rust
toggle_floating_window(app: AppHandle) -> Result<()>
is_floating_window_open() -> bool
```

## Development Workflows

### Modifying Floating Panel UI

1. Edit HTML/CSS/JS in `toggle_floating_window()` function (lib.rs ~1230)
2. Rebuild: `npm run build`
3. Run and test

### Adding New Tauri Command

1. Add function in `lib.rs`:
```rust
#[tauri::command]
async fn my_command(arg: String) -> Result<String, String> {
    Ok(format!("Result: {}", arg))
}
```

2. Register in `run()`:
```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands
    my_command
])
```

3. Call from React:
```typescript
const result = await invoke<string>('my_command', { arg: 'value' });
```

### Debugging

Run app from terminal to see Rust println! output:
```bash
./packages/desktop/src-tauri/target/release/bundle/macos/Hasod\ Downloads.app/Contents/MacOS/hasod-downloads
```

Key log prefixes:
- `[OAuth]` - Authentication flow
- `[FloatingPanel]` - Panel creation/destruction
- `[MessageHandler]` - URL drops received
- `[DragHandler]` - Window dragging
- `[yt-dlp]` - Download progress

## Dependencies

### Rust (Cargo.toml)
- `tauri` - Desktop framework
- `objc` / `cocoa` - Native macOS APIs
- `security-framework` - Keychain access
- `reqwest` - HTTP client
- `serde` / `serde_json` - Serialization
- `tiny_http` - OAuth callback server
- `keyring` - Cross-platform keychain
- `base64` / `sha2` - PKCE crypto

### Sidecars (bundled executables)
- `yt-dlp` - YouTube downloads
- `ffmpeg` - Audio conversion

## Common Issues

### "env var not found: HASOD_*"
```bash
cd packages/desktop/src-tauri
cp cargo-config.toml.example .cargo/config.toml
# Edit with actual values
```

### Panel doesn't appear over fullscreen
- Verify `setLevel: 25i64` is called AFTER `orderFrontRegardless`
- Check collection behavior is 257

### Dragging doesn't work
- Verify `create_drag_handler_class()` is registered
- Check JS mousedown/mousemove handlers in panel HTML

### OAuth fails
- Verify port 8420 is available
- Check redirect_uri matches Google Console config
- Ensure PKCE code_verifier is stored before exchange

## API Integration

**Endpoint:** `https://us-central1-hasod-41a23.cloudfunctions.net/api/user/subscription-status`

**Required service:** `hasod-downloader`

```rust
// Check subscription status
let response = client
    .get(&format!("{}/user/subscription-status", API_BASE_URL))
    .query(&[("email", &email)])
    .send()
    .await?;
```

## Build & Distribution

### macOS
```bash
cd packages/desktop
npm run build
# Output: src-tauri/target/release/bundle/macos/Hasod Downloads.app
# Output: src-tauri/target/release/bundle/dmg/Hasod Downloads_0.1.0_aarch64.dmg
```

### Code Signing (when ready)
Add to `tauri.conf.json`:
```json
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: Your Name"
    }
  }
}
```

## File Responsibilities

| File | Purpose |
|------|---------|
| `lib.rs` | All Rust logic: OAuth, license, downloads, floating panel |
| `App.tsx` | React UI, event listeners, state management |
| `App.css` | Dark theme styling |
| `tauri.conf.json` | App config, permissions, bundling |
| `Cargo.toml` | Rust dependencies |
| `.cargo/config.toml` | OAuth secrets (gitignored) |

## Related Documentation

- [packages/desktop/CLAUDE.md](../../../packages/desktop/CLAUDE.md) - Package-level docs
- [Root CLAUDE.md](../../../CLAUDE.md) - Project overview
