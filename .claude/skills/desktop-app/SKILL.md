---
name: desktop-app
description: Develop Python desktop application (packages/desktop/) with Qt UI for downloading music from YouTube, Spotify, and SoundCloud. Includes license validation against Hasod subscription system, Google OAuth, and building macOS/Windows installers. Based on DJ Downloader architecture.
---

# Desktop Application Development Skill

## When to Use This Skill

Activate this skill for:
- Desktop app development (Python + PySide6)
- License validation integration with Hasod API
- Download functionality (YouTube, Spotify, SoundCloud)
- UI development (Qt components)
- Build & packaging (DMG, NSIS)
- Testing desktop app

**Do NOT use for:**
- Webapp (`packages/webapp/`)
- Backend functions (`packages/functions/`)
- Modifying shared package (`packages/shared/`) - read-only

## Quick Commands

```bash
# Setup
cd packages/desktop
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Development
python main.py             # Run app

# Building
./build.sh                 # macOS app
./build_dmg.sh            # macOS DMG installer
python build.bat          # Windows executable
./build_installer.sh      # Windows installer

# Testing
python -m pytest          # Run tests
python test_desktop_license.py  # Test license validation
```

## Architecture

### Tech Stack
- **Language:** Python 3.9+
- **UI:** PySide6 (Qt6)
- **Downloads:** yt-dlp, spotdl
- **Auth:** Google OAuth (google-auth)
- **HTTP:** requests library

### Project Structure
```
packages/desktop/
├── main.py                      # Entry point
├── requirements.txt
├── src/
│   ├── downloaders/             # Download logic
│   │   ├── download_manager.py
│   │   ├── youtube_downloader.py
│   │   └── spotify_downloader.py
│   ├── gui/                     # Qt UI
│   │   ├── main_window_qt.py
│   │   ├── license_tab.py       # License validation UI
│   │   └── ...
│   ├── search/                  # Search functionality
│   └── utils/
│       ├── license_manager.py   # Hasod API integration
│       ├── google_auth.py
│       └── ...
├── build.sh                     # macOS build
├── build_dmg.sh                # DMG creator
└── icon.png                    # App icon
```

## License Validation

### Integration with Hasod API

**API Endpoint:** `https://us-central1-hasod-41a23.cloudfunctions.net/api`

**License Manager:** `src/utils/license_manager.py`

**Required Service:** `hasod-downloader` (מוריד הסוד)

### License Flow

1. User launches app
2. Navigates to License tab
3. Clicks "Login with Google"
4. Authenticates with Hasod account
5. App calls `/user/subscription-status`
6. Checks if `hasod-downloader` service is "active"
7. If YES → Full download access
8. If NO → Registration prompt

### License States

- **registered**: Active subscription - full access
- **not_registered**: No subscription - show registration page
- **expired**: Subscription expired - renewal needed
- **suspended**: Subscription cancelled - contact support
- **error**: API/network error - retry

### Testing License

```python
from src.utils.license_manager import get_license_manager

lm = get_license_manager()
result = lm.check_license('user@example.com')
print(f"Valid: {result['is_valid']}")
print(f"Status: {result['status']}")
```

## Key Features

### Downloads
- **YouTube:** Videos, playlists (yt-dlp)
- **Spotify:** Tracks, albums, playlists (spotdl)
- **SoundCloud:** Tracks, playlists
- **Quality:** High-quality MP3 with metadata
- **Batch:** Album/playlist support

### UI
- Modern dark theme (Qt stylesheet)
- Hebrew/English bilingual
- Progress tracking
- Download queue management
- Search integration

## Development Workflows

### Modifying License Logic

1. Edit `src/utils/license_manager.py`
2. Update API endpoint or validation logic
3. Test: `python test_desktop_license.py`
4. Verify in UI: `python main.py`

### Adding Download Source

1. Create downloader in `src/downloaders/new_downloader.py`
2. Implement `DownloadTask` interface
3. Register in `download_manager.py`
4. Add UI controls in `main_window_qt.py`

### Updating UI

1. Edit Qt component in `src/gui/`
2. Use Qt Designer for complex layouts (optional)
3. Apply dark theme stylesheet
4. Test: `python main.py`

## API Integration

### Hasod Cloud Functions

**Check Subscription:**
```python
import requests

response = requests.get(
    'https://us-central1-hasod-41a23.cloudfunctions.net/api/user/subscription-status',
    headers={'Authorization': f'Bearer {token}'},
    params={'email': user_email}
)

data = response.json()
services = data.get('services', {})
downloader = services.get('hasod-downloader', {})
is_active = downloader.get('status') == 'active'
```

**Response Format:**
```json
{
  "email": "user@example.com",
  "services": {
    "hasod-downloader": {
      "status": "active",
      "paymentMethod": "paypal",
      "startDate": "2025-01-01",
      "nextBillingDate": "2025-02-01"
    }
  }
}
```

### Registration URL

Opens: `https://hasod-41a23.web.app/subscriptions?device_uuid={uuid}`

## Building & Distribution

### macOS

```bash
# Build app bundle
./build.sh
# Output: dist/Hasod Downloads.app

# Create DMG installer
./build_dmg.sh
# Output: dist/Hasod Downloads.dmg
```

**Requirements:**
- Xcode Command Line Tools
- PyInstaller
- create-dmg (for DMG)

### Windows

```bash
# Build executable
python build.bat
# Output: dist/Hasod Downloads.exe

# Create installer
./build_installer.sh
# Output: dist/Hasod Downloads Setup.exe
```

**Requirements:**
- Python 3.9+
- PyInstaller
- NSIS (for installer)

### PyInstaller Spec

`build_pyinstaller.spec` contains:
- Entry point: `main.py`
- Hidden imports
- Data files (icons, assets)
- Binary exclusions

## Dependencies

**Main Packages:**
- `PySide6` - Qt6 GUI framework
- `requests` - HTTP client
- `spotdl` - Spotify downloader
- `yt-dlp` - YouTube downloader
- `google-auth` - Google OAuth

**See:** `requirements.txt` for full list

## Configuration

**Storage:** `~/.hasod_downloads/`
- `device_uuid.json` - Unique device ID
- `auth_token.json` - Auth token from webapp
- `google_credentials.json` - OAuth credentials

**Environment Variables:**
- `HASOD_API_URL` - API base URL (default: production)
- `HASOD_DEV_MODE` - Enable dev mode (default: false)

## Common Issues

### "No subscription found"
- Verify logged in with correct Google account
- Check subscription at https://hasod-41a23.web.app
- Ensure `hasod-downloader` service is active
- Click "Refresh" in License tab

### "PyQt/PySide not found"
```bash
pip install --upgrade PySide6
```

### "ffmpeg not found"
- macOS: `brew install ffmpeg`
- Windows: Download from ffmpeg.org

### "Build fails on macOS"
```bash
xcode-select --install
pip install --upgrade pyinstaller
```

## Testing

```bash
# Run app
python main.py

# Test license validation
python test_desktop_license.py

# Test downloads (if licensed)
# 1. Launch app
# 2. Go to License tab, login
# 3. Paste YouTube/Spotify URL
# 4. Click Download
```

## Comparison with DJ Downloader

| Aspect | DJ Downloader | Hasod Downloads |
|--------|--------------|-----------------|
| License API | Cloud Run | Firebase Functions |
| Service Name | DJ Downloader | מוריד הסוד |
| Backend | Flask | Firebase |
| Features | ✅ All | ✅ All (same) |

**All download functionality preserved from DJ Downloader!**

## Shared Package Integration

Desktop app **reads** from `packages/shared/` but **never modifies** it.

**Usage:**
```python
# Read shared types (if needed for API)
# Types are defined in TypeScript, so Python uses dict/dataclass equivalents
```

**If shared types needed:**
→ Ask webapp-backend skill to add them to `packages/shared/`

## Related Documentation

- [Root CLAUDE.md](../../../CLAUDE.md) - Project overview
- [Desktop README](../../desktop/README.md) - Setup & usage
- [API Docs](../../../docs/API.md) - API reference
- [DJ Downloader Reference](/path/to/dj-downloader) - Original implementation

## Responsibilities

**This skill handles:**
- ✅ Desktop app development (Python + Qt)
- ✅ License validation integration
- ✅ Download functionality (YouTube, Spotify, SoundCloud)
- ✅ Building installers (DMG, NSIS)
- ✅ Desktop UI/UX

**NOT handled:**
- ❌ Webapp (packages/webapp/)
- ❌ Backend functions (packages/functions/)
- ❌ Shared package modifications (read-only)
- ❌ Firebase deployment

## Next Steps

1. **Add backend endpoint**: `/user/subscription-status` in Cloud Functions
2. **Add service**: `hasod-downloader` in Firestore services collection
3. **Test integration**: End-to-end license validation
4. **Build installers**: Create DMG and NSIS packages
5. **Distribute**: Host installers for download
