# Installation & Testing Guide - Hasod System

**Date:** January 4, 2026
**Status:** ✅ ALL SYSTEMS DEPLOYED

## 🎯 What's Been Deployed

### 1. ✅ Web Application
**URL:** https://hasod-41a23.web.app
**Status:** Live and operational

### 2. ✅ Cloud Functions API
**URL:** https://us-central1-hasod-41a23.cloudfunctions.net/api
**Status:** Live with new `/user/subscription-status` endpoint

### 3. ✅ Desktop Application
**Platform:** macOS (DMG installer ready)
**File:** `packages/desktop/Hasod Downloads.dmg` (534MB)
**Status:** Built and ready for distribution

---

## 📥 Installing Desktop App (macOS)

### For Users

**Location:** `packages/desktop/Hasod Downloads.dmg`

**Steps:**
1. **Download** the DMG file (534MB)
2. **Open** the DMG file (double-click)
3. **Drag** "Hasod Downloads.app" to Applications folder
4. **Open** from Applications
   - First time: Right-click → Open (to bypass Gatekeeper)
   - Click "Open" in the security dialog
5. **Go to License tab**
6. **Click "Login with Google"**
7. **Authenticate** with your Hasod account (same as webapp)
8. **App validates** your subscription

### What Happens After Login

**If you have active `hasod-downloader` subscription:**
- ✅ License shows "Active"
- ✅ Downloads tab enabled
- ✅ Can download from YouTube, Spotify, SoundCloud
- ✅ Full app functionality

**If you DON'T have subscription:**
- ❌ License shows "Not Registered"
- ❌ Downloads disabled
- ℹ️ "Register" button opens webapp subscription page
- ℹ️ Subscribe to "מוריד הסוד" service
- ℹ️ Return to app and click "Refresh"

---

## 🧪 Testing Checklist

### Test 1: Desktop App Launch
```bash
cd packages/desktop
source venv/bin/activate
python main.py
```

**Expected:**
- [ ] App window opens
- [ ] Modern dark theme UI visible
- [ ] Multiple tabs present (Downloads, Search, License, Settings)
- [ ] No crash errors

### Test 2: License Validation (No Auth)
1. Go to License tab
2. Observe status

**Expected:**
- [ ] Shows "Device ID" with UUID
- [ ] Status: "Not Registered" or "Checking..."
- [ ] "Register" button enabled
- [ ] "Login with Google" button visible

### Test 3: License Validation (With Auth)

**Prerequisites:** User account with active `hasod-downloader` subscription

**Steps:**
1. Launch app
2. Go to License tab
3. Click "Login with Google"
4. Complete OAuth flow
5. Return to app

**Expected:**
- [ ] Status changes to "Registered" or "Active"
- [ ] Shows email address
- [ ] Shows expiration date
- [ ] Downloads tab becomes enabled
- [ ] Can paste URLs and download

### Test 4: Download Functionality

**Prerequisites:** Active license (Test 3 passed)

**YouTube Test:**
1. Go to Downloads tab
2. Paste YouTube URL (e.g., https://youtube.com/watch?v=dQw4w9WgXcQ)
3. Click "Download"

**Expected:**
- [ ] Progress bar appears
- [ ] Shows download percentage
- [ ] File downloads to `~/Downloads/Hasod Downloads/`
- [ ] MP3 file created with metadata and album art

**Spotify Test:**
1. Paste Spotify track URL
2. Click "Download"

**Expected:**
- [ ] Searches YouTube for track
- [ ] Downloads and converts to MP3
- [ ] File saved with correct metadata

### Test 5: Registration Flow

**Prerequisites:** User WITHOUT subscription

**Steps:**
1. Launch app (without subscription)
2. Go to License tab
3. Click "Register" button

**Expected:**
- [ ] Opens browser to: https://hasod-41a23.web.app/subscriptions?device_uuid={uuid}
- [ ] User can subscribe to "מוריד הסוד"
- [ ] After subscribing, click "Refresh" in app
- [ ] License status updates to "Active"
- [ ] Downloads become available

---

## 🔧 Development Testing

### Test License Manager Directly

```bash
cd packages/desktop
source venv/bin/activate

python3 -c "
from src.utils.license_manager import get_license_manager

lm = get_license_manager()
print('Device UUID:', lm.get_device_uuid())
print('API URL:', lm.api_url)

# Test with test email
result = lm.check_license('test@example.com')
print('Status:', result.get('status'))
print('Valid:', result.get('is_valid'))
"
```

### Test API Endpoint Directly

```bash
# Test with email param
curl "https://us-central1-hasod-41a23.cloudfunctions.net/api/user/subscription-status?email=hasod@hasodonline.com"

# Expected response:
# {
#   "email": "hasod@hasodonline.com",
#   "services": {
#     "hasod-downloader": {
#       "status": "active",
#       "paymentMethod": "paypal",
#       ...
#     }
#   }
# }
```

### Test with Real User

**You need a user who:**
1. Has Google account
2. Is registered on webapp (https://hasod-41a23.web.app)
3. Has active subscription to "hasod-downloader" service

**Test procedure:**
```bash
cd packages/desktop
python main.py
```

Then follow Test 3 steps above.

---

## 📦 Distribution

### Hosting the DMG

**Option 1: Firebase Storage**
```bash
# Upload to Firebase Storage
gsutil cp "packages/desktop/Hasod Downloads.dmg" gs://hasod-41a23.appspot.com/downloads/

# Make public
gsutil acl ch -u AllUsers:R gs://hasod-41a23.appspot.com/downloads/Hasod\ Downloads.dmg

# Get URL
echo "https://storage.googleapis.com/hasod-41a23.appspot.com/downloads/Hasod%20Downloads.dmg"
```

**Option 2: Add download link to webapp**

Edit `packages/webapp/src/pages/Subscriptions.tsx`:
```typescript
{service.id === 'hasod-downloader' && (
  <a href="https://storage.googleapis.com/.../Hasod%20Downloads.dmg"
     download
     className="download-btn">
    Download Desktop App (macOS)
  </a>
)}
```

### Windows Build (When Ready)

```bash
cd packages/desktop
python build.bat
# Output: dist/Hasod Downloads.exe

# Then create installer
./build_installer.sh
# Output: Hasod Downloads Setup.exe
```

---

## 🐛 Troubleshooting

### Desktop App Won't Launch

**macOS Security:**
```bash
# If "App is damaged" message:
xattr -cr "/Applications/Hasod Downloads.app"

# Then right-click → Open
```

### "No subscription found"

**Check:**
1. User logged in with correct Google account?
2. Account has active `hasod-downloader` subscription?
3. Subscription status is "active" (not expired/cancelled)?

**Verify in webapp:**
- Go to https://hasod-41a23.web.app
- Login with same account
- Check "My Subscriptions" page

### "Network error"

**Check:**
1. Internet connection working?
2. Firewall not blocking app?
3. API endpoint accessible:
   ```bash
   curl https://us-central1-hasod-41a23.cloudfunctions.net/api/user/subscription-status?email=test@test.com
   ```

### Downloads Fail

**Prerequisites:**
- [ ] License is active
- [ ] Internet connection working
- [ ] Sufficient disk space
- [ ] Valid URL format

**Check logs:**
```bash
# App logs location
~/Library/Logs/Hasod Downloads/
```

---

## ✅ Deployment Verification

### Webapp
- [x] Deployed to https://hasod-41a23.web.app
- [x] HTML loads correctly
- [x] Assets served
- [ ] Manual test: Login, subscribe, admin functions

### Functions
- [x] Deployed to Firebase
- [x] `/user/subscription-status` endpoint working
- [x] Returns user services correctly
- [ ] Manual test: All endpoints

### Desktop App
- [x] Built for macOS (DMG)
- [x] License manager configured
- [x] API integration tested
- [x] Device UUID generation working
- [ ] Manual test with real user subscription

### Integration
- [x] Desktop → API → Firestore flow configured
- [x] hasod-downloader service exists
- [x] Registration URL points to webapp
- [ ] End-to-end test with real user

---

## 📊 System Architecture (Live)

```
┌─────────────────────────────────────────────────┐
│          HASOD SUBSCRIPTION SYSTEM              │
│                (DEPLOYED)                        │
└─────────────────────────────────────────────────┘

┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│   Webapp    │  HTTPS  │   Cloud      │  HTTPS  │  Firestore   │
│   (React)   │◄────────┤  Functions   │◄────────┤  Database    │
│             │         │  (Node.js)   │         │              │
│ hasod-      │         │              │         │  - users     │
│ 41a23.      │         │ API:         │         │  - services  │
│ web.app     │         │ /user/       │         │  - trans...  │
└─────────────┘         │ subscription │         └──────────────┘
      ▲                 │ -status      │
      │                 └──────────────┘
      │                        ▲
      │                        │ HTTPS
      │                        │
      │                 ┌──────────────┐
      │                 │   Desktop    │
      │                 │   App (Qt)   │
      │ Registration    │              │
      └─────────────────┤ License      │
                        │ Validation   │
                        │              │
                        │ hasod-       │
                        │ downloader   │
                        └──────────────┘
```

---

## 📝 Next Actions

### Immediate
1. **Test desktop app** with real user who has subscription
2. **Fix Firestore index** if `/services` still failing (give it time to build)
3. **Upload DMG** to hosting (Firebase Storage or CDN)

### Short Term
4. **Build Windows installer** (if needed)
5. **Add download link** to webapp
6. **Code signing** for macOS (optional, for distribution)
7. **Create user guide** for desktop app

### Long Term
8. **Auto-updates** for desktop app
9. **Analytics** (track downloads, usage)
10. **Error reporting** (crash logs, telemetry)

---

**Everything is ready for testing!** 🚀

Users with active `hasod-downloader` subscriptions can now use the desktop app.
