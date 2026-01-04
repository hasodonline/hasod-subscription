# Download Service Implementation Plan

## Overview
Implement a web-based music download service that replicates the DJ Downloader desktop app functionality, allowing users to download music from YouTube, Spotify, SoundCloud, and Bandcamp with Hebrew transliteration support.

## Architecture

### Flow Diagram
```
User submits URL → Backend validates subscription → Parse URL →
Queue download job → Download from platform → Transliterate filenames →
Create ZIP (if album) → Upload to Cloud Storage → Generate signed URL →
User downloads → Auto-cleanup after 24 hours
```

## Implementation Phases

### Phase 1: Backend Core Services ✅ [CURRENT]

#### 1.1 URL Parser Service
**File:** `functions/src/services/url-parser.service.ts`

**Features:**
- Parse and validate URLs from supported platforms
- Extract media IDs
- Clean URLs (remove tracking parameters)
- Detect platform type

**Supported Platforms:**
- YouTube (video, music, playlist)
- Spotify (track, album, playlist)
- SoundCloud (track, playlist)
- Bandcamp (track, album)

#### 1.2 Transliteration Service
**File:** `functions/src/services/transliteration.service.ts`

**Features:**
- Detect Hebrew characters in text
- Transliterate Hebrew to English using OpenAI API
- Handle filenames (preserve extensions)
- Configurable enable/disable per request

**Implementation:**
- Use OpenAI GPT-4o-mini for cost efficiency
- Cache common transliterations (optional optimization)
- Preserve non-Hebrew parts unchanged

#### 1.3 Download Manager Service
**File:** `functions/src/services/download-manager.service.ts`

**Responsibilities:**
- Create and manage download jobs
- Track download progress
- Update Firestore job status
- Coordinate between downloaders
- Handle job lifecycle (create → process → complete → cleanup)

**Job Status States:**
- `queued` - Job created, waiting to start
- `downloading` - Actively downloading files
- `processing` - Converting/transliterating/zipping
- `complete` - Files ready for download
- `error` - Failed with error message

#### 1.4 Platform Downloaders

**A. YouTube/Generic Downloader**
**File:** `functions/src/services/youtube.downloader.ts`

**Implementation:**
- Use `yt-dlp` via Node.js child process
- Download to `/tmp` directory
- Extract best audio quality
- Convert to 320kbps MP3
- Embed metadata and album art
- Support for YouTube, SoundCloud, Bandcamp

**B. Spotify Downloader**
**File:** `functions/src/services/spotify.downloader.ts`

**Implementation:**
- Fetch track metadata via Spotify Web API
- Search YouTube for matching audio
- Download via yt-dlp
- Embed Spotify metadata (artist, title, album, year, cover art)
- Handle albums (iterate through all tracks)

#### 1.5 Storage Service
**File:** `functions/src/services/storage.service.ts`

**Features:**
- Upload files to Cloud Storage
- Generate signed download URLs (24-hour expiry)
- Delete expired files
- Organize by job ID

**Bucket Structure:**
```
hasod-downloads-temp/
├── {jobId}/
│   ├── single-track.mp3
│   └── album.zip
```

#### 1.6 ZIP Service
**File:** `functions/src/services/zip.service.ts`

**Features:**
- Create ZIP archives from multiple files
- Include all tracks from albums/playlists
- Preserve folder structure
- Optimize for streaming download

### Phase 2: API Endpoints

#### 2.1 Download Endpoints
**File:** `functions/src/index.ts` (add to existing Express app)

**Endpoints:**

**POST /api/download/submit**
```typescript
Request: { url: string, transliterate?: boolean }
Response: { jobId: string, estimatedTracks: number }
- Validates user subscription
- Creates download job
- Returns job ID for tracking
```

**GET /api/download/status/:jobId**
```typescript
Response: {
  status: 'queued' | 'downloading' | 'processing' | 'complete' | 'error',
  progress: number,
  message: string,
  downloadUrl?: string,
  files: Array<{name: string, size: number}>,
  expiresAt?: string
}
- Returns current job status
- Includes download URL when complete
```

**GET /api/download/history**
```typescript
Response: { jobs: Array<DownloadJob> }
- Returns user's recent download jobs (last 30 days)
- Includes expired jobs (without download URLs)
```

**DELETE /api/download/:jobId**
```typescript
Response: { success: boolean }
- Cancels active job or deletes completed job
- Removes files from storage
```

### Phase 3: Data Model

#### 3.1 Firestore Collections

**`downloadJobs/{jobId}`**
```typescript
interface DownloadJob {
  jobId: string;
  uid: string;
  url: string;
  platform: 'youtube' | 'spotify' | 'soundcloud' | 'bandcamp';
  type: 'single' | 'album' | 'playlist';
  status: 'queued' | 'downloading' | 'processing' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;

  metadata: {
    title?: string;
    artist?: string;
    album?: string;
    trackCount?: number;
  };

  files: Array<{
    name: string;
    path: string;
    size: number;
  }>;

  downloadUrl?: string;
  expiresAt?: FirebaseFirestore.Timestamp;
  transliterateEnabled: boolean;

  createdAt: FirebaseFirestore.Timestamp;
  completedAt?: FirebaseFirestore.Timestamp;
  error?: string;
}
```

#### 3.2 Service Definition Update

**Update `services/hasod-downloader`**
```typescript
{
  id: 'hasod-downloader',
  name: 'Hasod Downloader',
  description: 'Download high-quality music from multiple platforms',
  features: [
    'YouTube, Spotify, SoundCloud, Bandcamp support',
    'Always 320kbps MP3 quality',
    'Automatic metadata & album art',
    'Hebrew filename transliteration',
    'Album/playlist batch downloads',
    'Files available for 24 hours'
  ],
  price: 10.00,
  billingPeriod: 'monthly',
  paypalPlanId: '', // To be created
  googleGroupEmail: 'hasod-downloader-members@hasodonline.com',
  isActive: true
}
```

### Phase 4: Frontend Implementation

#### 4.1 Download Page
**File:** `src/pages/Download.tsx`

**Sections:**
- URL input field with platform detection
- Download button (checks subscription)
- Active downloads (real-time progress)
- Completed downloads (with download buttons)
- Download history (last 10 jobs)

#### 4.2 Components

**A. DownloadForm Component**
**File:** `src/components/DownloadForm.tsx`
- URL input with validation
- Platform icon display
- Transliteration toggle
- Submit button with subscription check

**B. ProgressDisplay Component**
**File:** `src/components/DownloadProgress.tsx`
- Real-time progress bar
- Status messages
- Track count (for albums)
- Cancel button

**C. DownloadResult Component**
**File:** `src/components/DownloadResult.tsx`
- File information (name, size)
- Download button
- Expiry countdown
- Delete button

**D. DownloadHistory Component**
**File:** `src/components/DownloadHistory.tsx`
- List of past downloads
- Status badges
- Re-download button (if not expired)

#### 4.3 API Client
**File:** `src/api/download.api.ts`

```typescript
export const downloadAPI = {
  submitDownload: (url: string, transliterate: boolean) =>
    Promise<{jobId: string}>,

  getJobStatus: (jobId: string) =>
    Promise<DownloadJob>,

  getHistory: () =>
    Promise<DownloadJob[]>,

  cancelJob: (jobId: string) =>
    Promise<void>,

  subscribeToJob: (jobId: string, callback: (job: DownloadJob) => void) =>
    () => void // Returns unsubscribe function
};
```

### Phase 5: Infrastructure Setup

#### 5.1 Cloud Storage Configuration

**Create Bucket:**
```bash
gsutil mb -p hasod-41a23 -c STANDARD -l us-central1 gs://hasod-downloads-temp
```

**Set Lifecycle Policy:**
```json
{
  "lifecycle": {
    "rule": [{
      "action": {"type": "Delete"},
      "condition": {"age": 1}
    }]
  }
}
```

**Enable CORS:**
```json
[{
  "origin": ["https://hasod-41a23.web.app", "http://localhost:5000"],
  "method": ["GET"],
  "maxAgeSeconds": 3600
}]
```

#### 5.2 Dependencies Installation

**Backend (functions/package.json):**
```json
{
  "yt-dlp-wrap": "^2.3.0",
  "spotify-web-api-node": "^5.0.2",
  "archiver": "^7.0.1",
  "openai": "^4.0.0",
  "@google-cloud/storage": "^7.0.0"
}
```

**Install yt-dlp binary:**
- Download in postinstall script
- Or bundle with deployment

#### 5.3 Environment Configuration

**Firebase Functions Config:**
```bash
firebase functions:config:set \
  spotify.client_id="5f573c9620494bae87890c0f08a60293" \
  spotify.client_secret="212476d9b0f3472eaa762d90b19b0ba8" \
  openai.api_key="<from DJ Downloader project>" \
  download.max_concurrent="3" \
  download.timeout_minutes="15" \
  storage.bucket="hasod-downloads-temp"
```

### Phase 6: Security & Rate Limiting

#### 6.1 Access Control
- Check user authentication (Firebase Auth)
- Verify active subscription to "hasod-downloader"
- Validate URL format and platform support
- Reject if subscription inactive

#### 6.2 Rate Limiting
- Max 10 downloads per user per hour
- Max 50 downloads per user per day
- Track in Firestore with TTL
- Return 429 Too Many Requests if exceeded

#### 6.3 Abuse Prevention
- URL validation (no file:// or localhost)
- Max file size: 500MB per track
- Max album size: 50 tracks
- Timeout: 15 minutes per job
- IP-based rate limiting for public endpoints

### Phase 7: Cleanup & Maintenance

#### 7.1 Scheduled Cleanup Function
**File:** `functions/src/scheduled/cleanup.ts`

**Schedule:** Every hour

**Tasks:**
- Delete Cloud Storage files older than 24 hours
- Update expired job statuses in Firestore
- Delete job records older than 30 days
- Log cleanup statistics

#### 7.2 Monitoring
- Cloud Functions logs for errors
- Download success/failure rates
- Storage usage metrics
- OpenAI API costs
- User download patterns

### Phase 8: Error Handling

#### 8.1 Error Types
- **Invalid URL**: User-friendly message with examples
- **Unsupported Platform**: List supported platforms
- **Download Failed**: Retry logic (3 attempts)
- **No Subscription**: Redirect to subscription page
- **File Too Large**: Notify user, suggest alternative
- **Timeout**: Cancel job, cleanup files
- **Quota Exceeded**: Rate limit message

#### 8.2 User Notifications
- Display error messages in UI
- Provide helpful suggestions
- Log technical details server-side
- Optional: Email notification on completion/error

## Implementation Order

### Week 1: Backend Foundation
- [ ] Set up Cloud Storage bucket with lifecycle rules
- [ ] Implement URL parser service
- [ ] Implement transliteration service (port from DJ Downloader)
- [ ] Set up environment configuration

### Week 2: Download Services
- [ ] Implement YouTube/generic downloader with yt-dlp
- [ ] Implement Spotify downloader
- [ ] Implement storage service (upload, signed URLs)
- [ ] Implement ZIP service for albums

### Week 3: API & Job Management
- [ ] Implement download manager service
- [ ] Add API endpoints to functions/index.ts
- [ ] Set up Firestore collection and security rules
- [ ] Implement job status tracking

### Week 4: Frontend UI
- [ ] Create Download page
- [ ] Build DownloadForm component
- [ ] Build ProgressDisplay component
- [ ] Build DownloadResult component
- [ ] Implement real-time Firestore listeners

### Week 5: Polish & Testing
- [ ] Implement cleanup scheduled function
- [ ] Add error handling and retry logic
- [ ] Implement rate limiting
- [ ] Add download history
- [ ] End-to-end testing
- [ ] Update service configuration
- [ ] Create PayPal billing plan

## Testing Strategy

### Unit Tests
- URL parser with various formats
- Transliteration with Hebrew/English mix
- File naming sanitization
- Job status transitions

### Integration Tests
- YouTube single video download
- Spotify album download (5 tracks)
- Transliteration end-to-end
- ZIP creation and upload
- Signed URL generation and expiry

### Load Tests
- 10 concurrent users downloading
- Large album (30+ tracks)
- Storage cleanup efficiency

## Cost Estimation

### Monthly Costs (100 users, 20 downloads/user/month)
- Cloud Functions compute: ~$20
- Cloud Storage: ~$10
- Firestore reads/writes: ~$5
- OpenAI API transliteration: ~$5
- **Total: ~$40/month**

### Revenue
- 100 users × $10/month = **$1,000/month**
- **Net profit: $960/month**

## Dependencies Reference

### From DJ Downloader Desktop App
- `src/utils/url_parser.py` → URL parser logic
- `src/utils/transliterator.py` → Transliteration logic
- `src/downloaders/spotify_downloader.py` → Spotify metadata fetching
- `src/downloaders/ytdlp_downloader.py` → yt-dlp integration patterns
- `src/downloaders/download_manager.py` → Job management patterns

### OpenAI API Key
- Located in: `/Users/kereneisenkeit/VS Code/DJ Downloader/openaikey`
- Model: gpt-4o-mini
- Purpose: Hebrew-to-English transliteration

## Success Metrics

### Phase 1 Complete When:
- All backend services implemented and tested
- API endpoints functional
- Cloud Storage configured
- Rate limiting active

### Phase 2 Complete When:
- Frontend UI built and connected
- Real-time progress tracking working
- Download/expiry flow functional
- Service added to subscription page

### Production Ready When:
- End-to-end testing passed
- Error handling comprehensive
- Security measures active
- Documentation complete
- PayPal plan configured

## Notes

- Start with YouTube-only support, then add other platforms
- Use Cloud Functions Gen 2 for longer timeouts (15 min)
- Consider Cloud Run for even longer-running downloads
- Monitor OpenAI costs, cache common transliterations
- Consider adding download analytics dashboard for admin

---

**Current Status:** Planning complete, ready for implementation
**Next Step:** Begin Phase 1.1 - URL Parser Service
