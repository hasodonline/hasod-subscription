# Desktop Application - Hasod Downloads (מוריד הסוד)

## TL;DR

**What:** Python desktop app for downloading music from YouTube, Spotify, SoundCloud with Hasod license validation
**Commands:**
- `python main.py` - Run application
- `./build.sh` - Build macOS app
- `./build_dmg.sh` - Create macOS installer
- `python build.bat` - Build Windows app

**Hebrew Name:** מוריד הסוד
**Required Service:** `hasod-downloader` subscription must be active

**Based on:** DJ Downloader project (full feature parity)

## Project Structure

```
packages/desktop/
├── main.py                      # Application entry point
├── requirements.txt             # Python dependencies
├── src/
│   ├── downloaders/             # Download engines
│   │   ├── download_manager.py  # Queue & progress management
│   │   ├── youtube_downloader.py # yt-dlp wrapper
│   │   └── spotify_downloader.py # spotdl wrapper
│   ├── gui/                     # Qt6 UI components
│   │   ├── main_window_qt.py    # Main application window
│   │   ├── license_tab.py       # License validation UI
│   │   ├── search_tab.py        # Search interface
│   │   └── settings_dialog.py   # Settings
│   ├── search/                  # Search providers
│   │   ├── local_search.py      # Local file search
│   │   ├── gdrive_search.py     # Google Drive
│   │   └── dropbox_search.py    # Dropbox
│   └── utils/
│       ├── license_manager.py   # Hasod API integration ⭐
│       ├── google_auth.py       # Google OAuth
│       ├── config.py            # Configuration
│       ├── i18n.py              # Hebrew/English
│       └── url_parser.py        # URL detection
├── assets/                      # Icons, images
├── build.sh                     # macOS build script
├── build_dmg.sh                # DMG creator
├── build.bat                   # Windows build script
├── build_installer.sh          # NSIS installer
├── build_pyinstaller.spec      # PyInstaller config
└── icon.png                    # App icon
```

## Quick Start

### Setup

```bash
# Navigate to package
cd packages/desktop

# Create virtual environment
python3 -m venv venv

# Activate
source venv/bin/activate  # macOS/Linux
# OR
venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt

# Run application
python main.py
```

### First Run

1. App launches with License tab
2. Click "Login with Google"
3. Authenticate with Hasod account
4. App validates `hasod-downloader` subscription
5. If active → Downloads tab enabled
6. If not → Registration prompt

## License Integration

### How It Works

The desktop app integrates with the Hasod Subscription System:

**API Endpoint:** `https://us-central1-hasod-41a23.cloudfunctions.net/api`

**Flow:**
1. User logs in with Google
2. App stores auth token locally
3. Calls `/user/subscription-status`
4. Checks if `hasod-downloader` service exists
5. Validates status is `"active"`
6. Enables/disables download features accordingly

### License Manager

**File:** `src/utils/license_manager.py`

**Key Methods:**
```python
from src.utils.license_manager import get_license_manager

lm = get_license_manager()

# Check license
result = lm.check_license(user_email='user@example.com')
# Returns: {'is_valid': bool, 'status': str, 'email': str, ...}

# Get device UUID
uuid = lm.get_device_uuid()

# Get registration URL
url = lm.get_registration_url()
# Returns: https://hasod-41a23.web.app/subscriptions?device_uuid={uuid}
```

### License States

| Status | Meaning | App Behavior |
|--------|---------|--------------|
| `registered` | Active subscription | Full download access |
| `not_registered` | No subscription | Show registration prompt |
| `expired` | Subscription expired | Block downloads, show renewal |
| `suspended` | Cancelled/suspended | Block downloads, show support |
| `error` | API/network error | Graceful degradation, retry |

### API Response Format

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

## Features

### Downloads

**Supported Platforms:**
- YouTube (videos, playlists)
- Spotify (tracks, albums, playlists)
- SoundCloud (tracks, playlists)

**Quality:**
- High-quality MP3
- Album art embedded
- Metadata (title, artist, album)

**Process:**
1. Paste URL
2. Click "Download"
3. Progress displayed
4. Files saved to configured folder (default: `~/Downloads/Hasod Downloads/`)

### Search

**Local Search:**
- Search downloaded files
- Filter by artist, album, title
- Quick access to files

**Cloud Search:**
- Google Drive integration
- Dropbox integration
- Search cloud-stored music

### Settings

- Language: English / Hebrew (עברית)
- Download location
- Audio quality preferences
- Theme customization

## Development

### Adding Download Feature

1. Create downloader in `src/downloaders/`:
```python
class NewDownloader:
    def download(self, url: str, output_dir: str):
        # Implementation
        pass
```

2. Register in `download_manager.py`
3. Add UI controls in `main_window_qt.py`

### Modifying License Validation

1. Edit `src/utils/license_manager.py`
2. Update `check_license()` method
3. Test: `python test_desktop_license.py`

### Updating UI

1. Edit Qt components in `src/gui/`
2. Modify dark theme in `main_window_qt.py` (DARK_STYLE)
3. Test: `python main.py`

## Dependencies

**Main Packages:**
```
PySide6==6.7.0              # Qt6 GUI framework
requests==2.32.3            # HTTP client
spotdl==4.2.5               # Spotify downloader
yt-dlp==2024.8.6            # YouTube downloader
google-auth==2.28.2         # Google OAuth
google-auth-oauthlib==1.2.0 # OAuth flow
google-auth-httplib2==0.2.0 # HTTP transport
```

See `requirements.txt` for full list.

## Building & Distribution

### macOS

**Build App:**
```bash
./build.sh
# Output: dist/Hasod Downloads.app
```

**Create DMG Installer:**
```bash
./build_dmg.sh
# Output: dist/Hasod Downloads.dmg
```

**Requirements:**
- Xcode Command Line Tools
- PyInstaller
- create-dmg (optional, for DMG)

### Windows

**Build Executable:**
```bash
python build.bat
# Output: dist/Hasod Downloads.exe
```

**Create Installer:**
```bash
./build_installer.sh
# Output: dist/Hasod Downloads Setup.exe
```

**Requirements:**
- Python 3.9+
- PyInstaller
- NSIS (for installer)

### PyInstaller Configuration

`build_pyinstaller.spec`:
- Entry point: `main.py`
- Hidden imports for PySide6, spotdl, yt-dlp
- Bundled data files (assets, icons)
- Binary exclusions for size optimization

## Configuration

### Storage Location

**User Config:** `~/.hasod_downloads/`

**Files:**
- `device_uuid.json` - Unique device identifier
- `auth_token.json` - Authentication token from webapp
- `google_credentials.json` - OAuth credentials (if used)

**Config Format:**
```json
// device_uuid.json
{
  "uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "created_at": "2025-01-01T00:00:00Z"
}

// auth_token.json
{
  "token": "eyJhbGc...",
  "device_uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

### Environment Variables

```bash
# Optional: Override API URL (for development)
export HASOD_API_URL="http://localhost:5001/hasod-41a23/us-central1/api"

# Optional: Enable dev mode
export HASOD_DEV_MODE="true"
```

## Testing

### Manual Testing

```bash
# 1. Launch app
python main.py

# 2. Test license validation
# - Go to License tab
# - Click "Login with Google"
# - Verify subscription check works
# - Check status displayed correctly

# 3. Test downloads (if licensed)
# - Paste YouTube URL
# - Click Download
# - Verify progress tracking
# - Check file saved correctly
```

### Testing License Without GUI

```bash
python test_desktop_license.py
```

### Unit Tests (if added)

```bash
pytest
```

## Internationalization (i18n)

**Languages:** English, Hebrew

**Implementation:** `src/utils/i18n.py`

**Usage:**
```python
from src.utils.i18n import _

label = _("license.title")  # Returns localized string
```

**Translation Files:** `translations/` folder

## Troubleshooting

### "No subscription found"

**Solution:**
1. Verify logged in with correct Google account
2. Check subscription at https://hasod-41a23.web.app
3. Ensure `hasod-downloader` service is active
4. Click "Refresh" in License tab

### "Authentication required"

**Solution:**
1. Click "Login with Google" in License tab
2. Complete OAuth flow in browser
3. Grant necessary permissions
4. Return to app

### "Network error / API timeout"

**Solution:**
1. Check internet connection
2. Verify API endpoint accessible
3. Check firewall settings
4. Try again (auto-retry implemented)

### "Download fails"

**Solution:**
1. Verify license is active
2. Check URL is valid and supported
3. Ensure sufficient disk space
4. Try different URL format
5. Check logs for specific error

### "PyQt/PySide import error"

**Solution:**
```bash
pip uninstall PySide6
pip install --upgrade PySide6
```

### "ffmpeg not found"

**Solution:**
- **macOS:** `brew install ffmpeg`
- **Windows:** Download from https://ffmpeg.org
- **Linux:** `sudo apt install ffmpeg`

### "Build fails"

**macOS:**
```bash
xcode-select --install
pip install --upgrade pyinstaller
```

**Windows:**
```bash
pip install --upgrade pyinstaller pywin32
```

## Comparison with DJ Downloader

This app is based on DJ Downloader with Hasod integration:

| Aspect | DJ Downloader | Hasod Downloads |
|--------|--------------|-----------------|
| **License System** | Standalone Cloud Run API | Hasod Subscription API |
| **Service Name** | DJ Downloader | מוריד הסוד (hasod-downloader) |
| **Backend** | Flask/Cloud Run | Firebase Cloud Functions |
| **Auth** | Google OAuth | Hasod account (Google OAuth) |
| **API Endpoint** | `api-v5nyt6vy5q-uc.a.run.app` | `hasod-41a23.cloudfunctions.net/api` |
| **Downloads** | ✅ YouTube, Spotify, SoundCloud | ✅ Same (all features preserved) |
| **UI** | ✅ Qt dark theme | ✅ Same |
| **Search** | ✅ Local, GDrive, Dropbox | ✅ Same |
| **i18n** | ✅ Hebrew/English | ✅ Same |

**Result:** All functionality preserved, only license backend changed!

## Integration with Hasod System

### Required Backend Endpoint

Desktop app requires this endpoint in Cloud Functions:

```typescript
// packages/functions/src/index.ts
app.get('/user/subscription-status', async (req, res) => {
  const email = req.query.email as string;
  // ... fetch user subscriptions from Firestore
  res.json({ email, services: {...} });
});
```

### Required Firestore Service

Service must exist in `services` collection:

```json
{
  "id": "hasod-downloader",
  "name": "Hasod Downloads",
  "nameHe": "מוריד הסוד",
  "description": "Desktop app for downloading music",
  "paypalPlanId": "P-XXX",
  "pricePerMonth": 10,
  "currency": "USD",
  "active": true,
  "features": [
    "YouTube downloads",
    "Spotify downloads",
    "SoundCloud downloads",
    "High-quality MP3",
    "Batch downloads"
  ]
}
```

## Shared Package Integration

Desktop app is **read-only** consumer of `packages/shared/`:

**TypeScript → Python Mapping:**
```typescript
// packages/shared/src/types/index.ts
interface UserSubscription {
  serviceId: string;
  status: 'active' | 'expired' | 'cancelled';
  paymentMethod: 'paypal' | 'manual';
}
```

**Python Equivalent:**
```python
# Equivalent dict structure
subscription = {
    'service_id': 'hasod-downloader',
    'status': 'active',
    'payment_method': 'paypal'
}
```

## Security & Privacy

- **Device UUID:** Generated locally, no personal info
- **Auth Token:** Stored securely in `~/.hasod_downloads/`
- **Google OAuth:** Industry-standard authentication
- **API Communication:** HTTPS only
- **No Data Collection:** Downloads stay on your device
- **No Telemetry:** No usage tracking

## Related Documentation

- [Root CLAUDE.md](../../CLAUDE.md) - Project overview
- [Desktop README](./README.md) - User-facing setup guide
- [Functions CLAUDE.md](../functions/CLAUDE.md) - Backend API
- [Shared CLAUDE.md](../shared/CLAUDE.md) - Type references
- [API Docs](../../docs/API.md) - API reference

---

**Package:** @hasod/desktop
**Language:** Python 3.9+
**Framework:** PySide6 (Qt6)
**Purpose:** Desktop music downloader with Hasod license validation
