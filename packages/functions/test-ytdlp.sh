#!/bin/bash

# Local test script for yt-dlp
# Tests the exact configuration used in the YouTube downloader service

echo "=== yt-dlp Local Test ==="
echo ""

# Test URL
TEST_URL="https://www.youtube.com/watch?v=fVMihvd4Xzs"

# Output directory
OUTPUT_DIR="./test-downloads"

# yt-dlp binary path
YTDLP_PATH="./bin/yt-dlp"

echo "Test URL: $TEST_URL"
echo "Output directory: $OUTPUT_DIR"
echo ""

# Check if yt-dlp exists
if [ ! -f "$YTDLP_PATH" ]; then
    echo "ERROR: yt-dlp not found at $YTDLP_PATH"
    echo "Please ensure the yt-dlp binary is in the bin/ directory"
    exit 1
fi

echo "Using yt-dlp at: $YTDLP_PATH"

# Make yt-dlp executable
chmod +x "$YTDLP_PATH"

# Create output directory
mkdir -p "$OUTPUT_DIR"
echo "Output directory: $OUTPUT_DIR"
echo ""

# Output template
OUTPUT_TEMPLATE="$OUTPUT_DIR/%(title)s.%(ext)s"

# Proxy configuration (optional - set PROXY_ENABLED=true to use)
PROXY_ENABLED="${PROXY_ENABLED:-false}"
PROXY_HOST="${PROXY_HOST:-gate.decodo.com}"
PROXY_PORT_MIN="${PROXY_PORT_MIN:-10001}"
PROXY_PORT_MAX="${PROXY_PORT_MAX:-10040}"
PROXY_USERNAME="${PROXY_USERNAME:-sprxtz62t4}"
PROXY_PASSWORD="${PROXY_PASSWORD:-pAc9fQ5QdQy5xt+h4b}"

# Get random port in range
RANDOM_PORT=$((PROXY_PORT_MIN + RANDOM % (PROXY_PORT_MAX - PROXY_PORT_MIN + 1)))
PROXY_URL="http://${PROXY_USERNAME}:${PROXY_PASSWORD}@${PROXY_HOST}:${RANDOM_PORT}"

if [ "$PROXY_ENABLED" = "true" ]; then
    echo "Using proxy: $PROXY_HOST:$RANDOM_PORT"
else
    echo "Proxy: Disabled"
fi

echo ""
echo "=== Command ==="
echo ""

# Build yt-dlp command with EXACT arguments from youtube.downloader.ts
CMD=(
    "$YTDLP_PATH"
    "$TEST_URL"
    # Download audio-only stream directly
    --format "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best"
    --extract-audio
    --audio-format mp3
    --audio-quality 0
    --embed-metadata
    --embed-thumbnail
    --convert-thumbnails jpg
    --output "$OUTPUT_TEMPLATE"
    --no-playlist

    # 2025 Anti-bot measures - Use Android client (WORKING!)
    --extractor-args "youtube:player_client=android"
    --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

    # Rate limiting & retry configuration
    --retries 5
    --fragment-retries 5
    --retry-sleep 2
    --sleep-interval 2
    --max-sleep-interval 5
    --sleep-requests 1

    # Additional safety
    --no-check-certificate
    --geo-bypass
    --progress
    --newline

    # HTTP headers
    --add-header "Accept-Language:en-US,en;q=0.9"
    --add-header "Sec-Fetch-Dest:empty"
    --add-header "Sec-Fetch-Mode:cors"
    --add-header "Sec-Fetch-Site:same-origin"
)

# Add proxy if enabled
if [ "$PROXY_ENABLED" = "true" ]; then
    CMD+=(--proxy "$PROXY_URL")
fi

# Print command
echo "${CMD[@]}"
echo ""
echo "=== Execution ==="
echo ""

# Execute command and track time
START_TIME=$(date +%s)

"${CMD[@]}"

EXIT_CODE=$?
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "=== Result ==="
echo "Exit code: $EXIT_CODE"
echo "Duration: ${DURATION}s"
echo ""

if [ $EXIT_CODE -eq 0 ]; then
    # List downloaded files
    MP3_FILES=$(find "$OUTPUT_DIR" -name "*.mp3" -type f)

    if [ -n "$MP3_FILES" ]; then
        echo "✓ SUCCESS - Downloaded file(s):"
        while IFS= read -r file; do
            SIZE=$(du -h "$file" | cut -f1)
            FILENAME=$(basename "$file")
            echo "  - $FILENAME ($SIZE)"
        done <<< "$MP3_FILES"
        echo ""
        exit 0
    else
        echo "✗ ERROR - No MP3 files found"
        exit 1
    fi
else
    echo "✗ ERROR - yt-dlp exited with code $EXIT_CODE"
    exit $EXIT_CODE
fi
