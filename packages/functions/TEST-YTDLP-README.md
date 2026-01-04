# yt-dlp Local Test

This directory contains test scripts to test yt-dlp locally with the **exact same configuration** used in the Cloud Functions.

## Test URL
`https://www.youtube.com/watch?v=fVMihvd4Xzs`

## Prerequisites

✅ yt-dlp binary is already present at: `bin/yt-dlp`

## Method 1: Bash Script (Recommended - Fastest)

Run the shell script directly:

```bash
cd functions
./test-ytdlp.sh
```

### With Proxy Enabled

```bash
cd functions
PROXY_ENABLED=true ./test-ytdlp.sh
```

## Method 2: TypeScript Script

Run with ts-node:

```bash
cd functions
npx ts-node test-ytdlp.ts
```

Or compile and run:

```bash
cd functions
npx tsc test-ytdlp.ts
node test-ytdlp.js
```

## What It Does

Both scripts replicate the **exact yt-dlp execution** from `src/services/youtube.downloader.ts`:

1. ✅ Uses the same yt-dlp binary (`bin/yt-dlp`)
2. ✅ Uses the same command-line arguments
3. ✅ Uses the same anti-bot measures:
   - Web client extractor (no PO token needed)
   - Chrome 131 user agent
   - Browser-like headers
4. ✅ Uses the same rate limiting and retry configuration
5. ✅ Downloads to `test-downloads/` directory
6. ✅ Converts to MP3 with best quality
7. ✅ Embeds metadata and thumbnails
8. ✅ Optional proxy support (same configuration)

## Expected Output

```
=== yt-dlp Local Test ===

Test URL: https://www.youtube.com/watch?v=fVMihvd4Xzs
Output directory: ./test-downloads

Using yt-dlp at: ./bin/yt-dlp
Proxy: Disabled

=== Command ===
[Full yt-dlp command with all arguments]

=== Execution ===
[download] Downloading video...
[download]  50.0% of 5.20MiB at 1.50MiB/s
[download] 100% of 5.20MiB in 00:03
[ffmpeg] Extracting audio...
[ExtractAudio] Destination: test-downloads/Video Title.mp3

=== Result ===
Exit code: 0
Duration: 12.5s

✓ SUCCESS - Downloaded file(s):
  - Video Title.mp3 (5.2 MB)
```

## Troubleshooting

### Error: "yt-dlp not found"
Make sure you're running the script from the `functions/` directory.

### Error: "Permission denied"
Make the script executable:
```bash
chmod +x test-ytdlp.sh
```

### Bot Detection Error
Try enabling proxy:
```bash
PROXY_ENABLED=true ./test-ytdlp.sh
```

### Update yt-dlp
If you encounter issues, try updating yt-dlp:
```bash
./bin/yt-dlp -U
# or download latest version:
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o bin/yt-dlp
chmod +x bin/yt-dlp
```

## Configuration

The test scripts use the same configuration as the Cloud Functions:

- Config file: `src/utils/config.ts`
- Downloader: `src/services/youtube.downloader.ts`
- Proxy settings from environment variables (if enabled)

## Output Location

Downloaded files are saved to: `functions/test-downloads/`

You can clean up test downloads:
```bash
rm -rf test-downloads/
```
