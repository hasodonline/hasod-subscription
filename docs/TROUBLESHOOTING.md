# Troubleshooting Guide - Download Service

## Current Issues & Solutions

### ✅ Issue 1: Download History 500 Error (FIXED - Building)

**Error:**
```
Failed to load resource: the server responded with a status of 500
Error: The query requires an index
```

**Cause:** Missing Firestore composite index for `downloadJobs` collection.

**Solution:** ✅ Index deployed and building now.

**Query:** `downloadJobs.where('uid', '==', uid).orderBy('createdAt', 'desc')`

**Status:**
- Index configuration deployed
- Building in progress (5-15 minutes)
- Will work automatically once complete

**Test When Ready:**
```bash
curl "https://us-central1-hasod-41a23.cloudfunctions.net/api/download/history?uid=YOUR_UID&limit=20"
```

**Expected Response:**
```json
{
  "jobs": []
}
```

---

### ❌ Issue 2: Downloads Fail - yt-dlp Not Found (CRITICAL)

**Error from Logs:**
```
Error: spawn yt-dlp ENOENT
[DownloadManager] Job failed: Error: spawn yt-dlp ENOENT
```

**Cause:** `yt-dlp` CLI tool is not installed in the Cloud Functions environment.

**Impact:** All downloads will fail immediately with this error.

---

## Solutions for yt-dlp Installation

### Option 1: Quick Test (Install in Functions) ⚡
This won't work for Cloud Functions Gen 2, but we can test locally:

```bash
cd functions
npm install yt-dlp-wrap
```

**Issue:** Cloud Functions doesn't have yt-dlp binary pre-installed.

### Option 2: Bundle yt-dlp Binary (Medium) 📦

**Steps:**
1. Download yt-dlp binary:
```bash
cd functions
mkdir -p bin
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o bin/yt-dlp
chmod +x bin/yt-dlp
```

2. Update `youtube.downloader.ts` to use bundled binary:
```typescript
constructor() {
  // Use bundled binary
  const functionPath = process.cwd();
  this.ytDlpPath = path.join(functionPath, 'bin', 'yt-dlp');
}
```

3. Include in deployment:
```bash
# Add to functions/.gcloudignore to NOT ignore bin/
# Then deploy
firebase deploy --only functions
```

**Pros:** Works with current Cloud Functions setup
**Cons:** Larger deployment package, need to keep binary updated

---

### Option 3: Migrate to Cloud Run (RECOMMENDED) 🐳

Cloud Run allows custom Docker images with pre-installed tools.

**Create `functions/Dockerfile`:**
```dockerfile
FROM node:20-slim

# Install yt-dlp and ffmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && pip3 install yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy application
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 8080

# Start server
CMD ["node", "lib/index.js"]
```

**Deploy to Cloud Run:**
```bash
# Build and deploy
gcloud run deploy hasod-download-api \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 512Mi \
  --timeout 3600 \
  --max-instances 10
```

**Pros:**
- Full control over environment
- Can install any dependencies
- Longer timeout (up to 60 minutes)
- Better for large downloads

**Cons:**
- More complex setup
- Slightly different deployment process

---

### Option 4: Use External Download Service (Alternative) 🌐

Use a third-party API that handles downloads:
- **yt-dlp-api** (self-hosted or managed)
- **Invidious API** (for YouTube)
- **Spotify Downloader API**

**Pros:** No infrastructure management
**Cons:** External dependency, potential costs

---

## Recommended Path Forward

### Immediate (Today):

1. **Wait for Index to Build** (10 minutes)
   - Download history will work
   - Services endpoint will work

2. **Choose yt-dlp Solution**:
   - **Quick Test:** Option 2 (Bundle Binary)
   - **Production:** Option 3 (Cloud Run)

3. **Test Flow**:
   - Visit: https://hasod-41a23.web.app/download
   - Submit test URL
   - Verify it works

### This Week:

1. **Migrate to Cloud Run** (Option 3)
2. **Create PayPal Plan** for Hasod Downloader
3. **Monitor logs and errors**
4. **Set up error alerting**

---

## Quick Fix: Bundle yt-dlp (15 minutes)

```bash
cd "/Users/kereneisenkeit/VS Code/Hasod Subscirption/functions"

# Create bin directory
mkdir -p bin

# Download yt-dlp
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o bin/yt-dlp
chmod +x bin/yt-dlp

# Update .gcloudignore to include bin/
echo "!bin/" >> .gcloudignore

# Update youtube.downloader.ts
# Change: this.ytDlpPath = 'yt-dlp';
# To: this.ytDlpPath = path.join(process.cwd(), 'bin', 'yt-dlp');

# Rebuild and deploy
npm run build
cd ..
firebase deploy --only functions
```

---

## Testing Checklist

### After Index Builds (10-15 min):
- [ ] Test: `GET /services` → Should return 2 services
- [ ] Test: `GET /download/history` → Should return `{jobs: []}`
- [ ] Test: Frontend loads without errors

### After yt-dlp Fix:
- [ ] Submit YouTube URL
- [ ] Watch job progress in real-time
- [ ] Download completes successfully
- [ ] File is 320kbps MP3
- [ ] Metadata is embedded

### After PayPal Plan:
- [ ] Subscribe to Hasod Downloader
- [ ] Verify subscription activates
- [ ] Download becomes available
- [ ] Subscription shows in profile

---

## Monitoring Commands

```bash
# Watch function logs
firebase functions:log --only api

# Test endpoints
curl https://us-central1-hasod-41a23.cloudfunctions.net/api/services
curl "https://us-central1-hasod-41a23.cloudfunctions.net/api/download/history?uid=YOUR_UID"

# Check Cloud Storage
gsutil ls gs://hasod-downloads-temp

# Check Firestore indexes
open "https://console.firebase.google.com/project/hasod-41a23/firestore/indexes"
```

---

## Error Reference

| Error | Cause | Solution |
|-------|-------|----------|
| 500: Internal Server Error | Missing Firestore index | Wait for index to build |
| spawn yt-dlp ENOENT | yt-dlp not installed | Bundle binary or use Cloud Run |
| requiresSubscription | No active subscription | Subscribe to Hasod Downloader |
| Invalid URL | Unsupported platform | Use YouTube, Spotify, SoundCloud, Bandcamp |
| Timeout | Download too long | Increase timeout or use Cloud Run |

---

## Support

**Firebase Console:** https://console.firebase.google.com/project/hasod-41a23
**Cloud Storage:** https://console.cloud.google.com/storage/browser/hasod-downloads-temp
**Firestore:** https://console.firebase.google.com/project/hasod-41a23/firestore

---

**Last Updated:** 2026-01-04 01:30 UTC
