# Hasod Downloads - Desktop Application

Desktop application for downloading music from YouTube, Spotify, and SoundCloud with license validation via Hasod Subscription System.

**Hebrew Name:** מוריד הסוד
**Required Subscription:** hasod-downloader service must be active

## Overview

This is the desktop version of Hasod Downloads (מוריד הסוד), ported from the DJ Downloader project with integrated license validation against the Hasod subscription system.

### Features

- **Multi-Platform Downloads**: YouTube, Spotify, SoundCloud
- **High-Quality Audio**: MP3 with metadata and album art
- **Modern UI**: Qt-based interface with dark theme
- **License Validation**: Checks active subscription via Hasod API
- **Google OAuth**: Authenticate with your Hasod account
- **Batch Downloads**: Album and playlist support
- **Search Integration**: Find and download music easily

### License Requirements

The app requires an **active subscription** to the **hasod-downloader (מוריד הסוד)** service in your Hasod account.

## Installation

### Prerequisites

- Python 3.9 or higher
- pip (Python package manager)
- Active Hasod subscription with "מוריד הסוד" service

### Setup

```bash
# Navigate to desktop package
cd packages/desktop

# Create virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the application
python main.py
```

## License Validation

### How It Works

1. **App Launch**: Desktop app starts and checks license
2. **Google Login**: User logs in with their Hasod Google account
3. **API Check**: App verifies subscription via Hasod Cloud Functions
4. **Service Validation**: Checks if "hasod-downloader" service is active
5. **Access Granted**: If active, app is fully functional

### License States

- **Registered**: Active subscription, app fully functional
- **Not Registered**: No subscription found, download features disabled
- **Expired**: Subscription expired, renewal required
- **Suspended**: Subscription cancelled or suspended

### Registration Flow

If you don't have a subscription:

1. Click "Register" in the License tab
2. Opens Hasod webapp subscription page
3. Subscribe to "מוריד הסוד" service
4. Return to desktop app and click "Refresh"
5. App will validate and activate

## Usage

### First Run

1. Launch the app: `python main.py`
2. Navigate to "License" tab
3. Click "Login with Google"
4. Authenticate with your Hasod account
5. App checks your subscription status
6. If active, start downloading!

### Downloading Media

1. **YouTube**: Paste video or playlist URL
2. **Spotify**: Paste track, album, or playlist URL
3. **SoundCloud**: Paste track or playlist URL
4. Click "Download"
5. Files saved to  `~/Downloads/Hasod Downloads/`

### Settings

- **Language**: English / Hebrew (עברית)
- **Download Location**: Customize save folder
- **Quality**: Audio quality preferences
- **Auto-Update**: Automatic app updates

## Building & Packaging

### macOS

```bash
# Build app
./build.sh

# Create DMG installer
./build_dmg.sh

# Output: dist/Hasod Downloads.app
```

### Windows

```bash
# Build executable
python build.bat

# Create installer
./build_installer.sh

# Output: dist/Hasod Downloads.exe
```

### Using PyInstaller

```bash
# Build standalone executable
pyinstaller build_pyinstaller.spec

# Output: dist/Hasod Downloads/
```

## Development

### Project Structure

```
packages/desktop/
├── main.py                 # Application entry point
├── requirements.txt        # Python dependencies
├── src/
│   ├── downloaders/        # Download handlers (YouTube, Spotify, SoundCloud)
│   ├── gui/                # Qt UI components
│   │   ├── main_window_qt.py
│   │   ├── license_tab.py  # License validation UI
│   │   └── ...
│   ├── search/             # Search functionality
│   └── utils/
│       ├── license_manager.py  # Hasod API integration
│       ├── google_auth.py      # Google OAuth
│       └── ...
├── assets/                 # UI assets, icons
├── build.sh                # macOS build script
├── build.bat               # Windows build script
└── README.md
```

### Key Files

- **`src/utils/license_manager.py`**: Integrates with Hasod Cloud Functions API
- **`src/gui/license_tab.py`**: License UI and status display
- **`main.py`**: Application launcher

### API Integration

The app communicates with Hasod Cloud Functions:

**Endpoint**: `https://us-central1-hasod-41a23.cloudfunctions.net/api`

**License Check**:
```
GET /user/subscription-status?email={email}
or
GET /user/subscription-status
Authorization: Bearer {token}
```

**Response**:
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

### Testing License Validation

```bash
# Set API URL to development (if needed)
export HASOD_API_URL="http://localhost:5001/hasod-41a23/us-central1/api"

# Run app
python main.py

# Or test license directly
python -c "from src.utils.license_manager import get_license_manager; \
           lm = get_license_manager(); \
           print(lm.check_license('test@example.com'))"
```

## Troubleshooting

### "No subscription found"

- Verify you're logged in with correct Google account
- Check subscription status on https://hasod-41a23.web.app
- Ensure "מוריד הסוד" service is active
- Click "Refresh" in License tab

### "Authentication required"

- Click "Login with Google" in License tab
- Complete OAuth flow
- Grant necessary permissions

### "Network error"

- Check internet connection
- Verify API endpoint is accessible
- Check firewall settings

### Downloads fail

- Verify license is active
- Check internet connection
- Ensure sufficient disk space
- Try different URL format

## Configuration

### Environment Variables

- `HASOD_API_URL`: API base URL (default: production)
- `HASOD_DEV_MODE`: Enable development mode (default: false)

### Config Files

Stored in `~/.hasod_downloads/`:
- `device_uuid.json`: Unique device identifier
- `auth_token.json`: Authentication token
- `google_credentials.json`: Google OAuth credentials

## Dependencies

Main dependencies (see `requirements.txt`):
- **PySide6**: Qt6 GUI framework
- **requests**: HTTP client for API calls
- **spotdl**: Spotify downloader
- **yt-dlp**: YouTube downloader
- **google-auth**: Google OAuth authentication

## Security & Privacy

- **Device UUID**: Generated locally, no personal info
- **Auth Token**: Stored securely in user's home directory
- **Google OAuth**: Industry-standard authentication
- **API Communication**: HTTPS only
- **No Data Collection**: Downloads stay on your device

## Support

### For License Issues

- Visit: https://hasod-41a23.web.app
- Email: hasod@hasodonline.com
- Check subscription status in webapp

### For App Issues

- Check [Troubleshooting](#troubleshooting) section
- Review logs in app directory
- Report bugs via GitHub Issues

## Comparison with DJ Downloader

This desktop app is based on DJ Downloader but with key differences:

| Feature | DJ Downloader | Hasod Downloads |
|---------|--------------|-----------------|
| License System | Standalone Cloud Run API | Hasod Subscription System |
| Service Name | DJ Downloader | מוריד הסוד (hasod-downloader) |
| Auth Method | Google OAuth | Hasod account (Google OAuth) |
| Backend | Flask/Cloud Run | Firebase Cloud Functions |
| API Endpoint | `api-v5nyt6vy5q-uc.a.run.app` | `hasod-41a23.cloudfunctions.net/api` |

All core functionality (downloads, UI, features) remains the same!

## Related Packages

- [Webapp](../webapp/) - Web interface for subscriptions
- [Cloud Functions](../functions/) - Backend API
- [Shared](../shared/) - Shared types and utilities

## License

Proprietary - Hasod Online
Active subscription required for use.

---

**Made with ❤️ by Hasod Online**
**עשוי באהבה על ידי הסוד און ליין**
