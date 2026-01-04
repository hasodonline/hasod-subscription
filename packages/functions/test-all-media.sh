#!/bin/bash

# Comprehensive Media Services Test Script
# Tests all supported media services with the exact function configuration

echo "=========================================="
echo "  Media Services Comprehensive Test"
echo "=========================================="
echo ""

# Configuration
OUTPUT_DIR="./test-downloads"
YTDLP_PATH="./bin/yt-dlp"

# Test URLs from media test links.md
SPOTIFY_URL="https://open.spotify.com/track/3U1voPJN8NBSR96Ry0WJiF?si=0a84b2897ae34ce2"
SOUNDCLOUD_URL="https://soundcloud.com/rmx100/rose-bruno-mars-apt-rmx100"
YOUTUBE_URL="https://www.youtube.com/watch?v=fVMihvd4Xzs"

# Check prerequisites
if [ ! -f "$YTDLP_PATH" ]; then
    echo "❌ ERROR: yt-dlp not found at $YTDLP_PATH"
    exit 1
fi

chmod +x "$YTDLP_PATH"
mkdir -p "$OUTPUT_DIR"

# Proxy configuration
PROXY_ENABLED="${PROXY_ENABLED:-false}"
PROXY_HOST="${PROXY_HOST:-gate.decodo.com}"
PROXY_PORT_MIN="${PROXY_PORT_MIN:-10001}"
PROXY_PORT_MAX="${PROXY_PORT_MAX:-10040}"
PROXY_USERNAME="${PROXY_USERNAME:-sprxtz62t4}"
PROXY_PASSWORD="${PROXY_PASSWORD:-pAc9fQ5QdQy5xt+h4b}"

# Get random port
RANDOM_PORT=$((PROXY_PORT_MIN + RANDOM % (PROXY_PORT_MAX - PROXY_PORT_MIN + 1)))
PROXY_URL="http://${PROXY_USERNAME}:${PROXY_PASSWORD}@${PROXY_HOST}:${RANDOM_PORT}"

echo "Configuration:"
echo "  yt-dlp: $YTDLP_PATH"
echo "  Output: $OUTPUT_DIR"
if [ "$PROXY_ENABLED" = "true" ]; then
    echo "  Proxy: $PROXY_HOST:$RANDOM_PORT"
else
    echo "  Proxy: Disabled"
fi
echo ""

# Test results tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Common yt-dlp arguments (exact match with youtube.downloader.ts)
build_ytdlp_args() {
    local url="$1"
    local output_template="$2"

    ARGS=(
        "$url"
        --format "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best"
        --extract-audio
        --audio-format mp3
        --audio-quality 0
        --embed-metadata
        --embed-thumbnail
        --convert-thumbnails jpg
        --output "$output_template"
        --no-playlist
        --extractor-args "youtube:player_client=android"
        --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        --retries 5
        --fragment-retries 5
        --retry-sleep 2
        --sleep-interval 2
        --max-sleep-interval 5
        --sleep-requests 1
        --no-check-certificate
        --geo-bypass
        --progress
        --newline
        --add-header "Accept-Language:en-US,en;q=0.9"
        --add-header "Sec-Fetch-Dest:empty"
        --add-header "Sec-Fetch-Mode:cors"
        --add-header "Sec-Fetch-Site:same-origin"
    )

    if [ "$PROXY_ENABLED" = "true" ]; then
        ARGS+=(--proxy "$PROXY_URL")
    fi
}

# Test function
test_media_service() {
    local service_name="$1"
    local url="$2"

    echo "=========================================="
    echo "Testing: $service_name"
    echo "=========================================="
    echo "URL: $url"
    echo ""

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    # Build output template
    OUTPUT_TEMPLATE="$OUTPUT_DIR/[${service_name}] %(title)s.%(ext)s"

    # Build arguments
    build_ytdlp_args "$url" "$OUTPUT_TEMPLATE"

    # Execute
    START_TIME=$(date +%s)
    "$YTDLP_PATH" "${ARGS[@]}"
    EXIT_CODE=$?
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))

    echo ""
    echo "Result: Exit code $EXIT_CODE (${DURATION}s)"

    if [ $EXIT_CODE -eq 0 ]; then
        # Check for downloaded file
        MP3_FILES=$(find "$OUTPUT_DIR" -name "*${service_name}*.mp3" -type f -mmin -1 2>/dev/null)

        if [ -n "$MP3_FILES" ]; then
            echo "✅ SUCCESS - $service_name"
            while IFS= read -r file; do
                SIZE=$(du -h "$file" | cut -f1)
                FILENAME=$(basename "$file")
                echo "   📁 $FILENAME ($SIZE)"
            done <<< "$MP3_FILES"
            PASSED_TESTS=$((PASSED_TESTS + 1))
        else
            echo "⚠️  WARNING - Download succeeded but no MP3 file found"
            FAILED_TESTS=$((FAILED_TESTS + 1))
        fi
    else
        echo "❌ FAILED - $service_name"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi

    echo ""
}

# Run all tests
echo "Starting tests..."
echo ""

test_media_service "YouTube" "$YOUTUBE_URL"
sleep 2

test_media_service "SoundCloud" "$SOUNDCLOUD_URL"
sleep 2

test_media_service "Spotify" "$SPOTIFY_URL"

# Final summary
echo "=========================================="
echo "  Test Summary"
echo "=========================================="
echo "Total Tests:  $TOTAL_TESTS"
echo "Passed:       $PASSED_TESTS ✅"
echo "Failed:       $FAILED_TESTS ❌"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo "🎉 All tests passed!"
    echo ""
    echo "Downloaded files:"
    ls -lh "$OUTPUT_DIR"/*.mp3 2>/dev/null || echo "No MP3 files found"
    exit 0
else
    echo "⚠️  Some tests failed. See details above."
    exit 1
fi
