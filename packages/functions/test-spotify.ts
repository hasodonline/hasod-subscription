/**
 * Spotify Downloader Test
 * Tests the actual Spotify downloader implementation
 */

import { getSpotifyDownloader } from './src/services/spotify.downloader';
import * as path from 'path';
import * as fs from 'fs';

// Test URL from media test links.md
const SPOTIFY_URL = 'https://open.spotify.com/track/3U1voPJN8NBSR96Ry0WJiF?si=0a84b2897ae34ce2';

// Output directory
const OUTPUT_DIR = path.join(__dirname, 'test-downloads');

async function testSpotify() {
  console.log('=== Spotify Downloader Test ===\n');
  console.log(`Test URL: ${SPOTIFY_URL}`);
  console.log(`Output directory: ${OUTPUT_DIR}\n`);

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  try {
    const downloader = getSpotifyDownloader();

    console.log('Step 1: Extracting track info from Spotify API...');
    const trackInfo = await downloader.getTrackInfo(SPOTIFY_URL);

    if (!trackInfo) {
      console.error('❌ Failed to get track info from Spotify');
      process.exit(1);
    }

    console.log('\n✓ Track Info Retrieved:');
    console.log(`  Title: ${trackInfo.name}`);
    console.log(`  Artist: ${trackInfo.artist}`);
    console.log(`  Album: ${trackInfo.album}`);
    console.log(`  Duration: ${Math.floor(trackInfo.duration / 1000)}s`);
    console.log(`  Release Date: ${trackInfo.releaseDate}`);

    console.log('\nStep 2: Downloading from YouTube...');

    let lastProgress = 0;
    const result = await downloader.downloadTrack(
      SPOTIFY_URL,
      OUTPUT_DIR,
      false, // no transliteration
      (progress) => {
        if (progress.status === 'downloading' && progress.progress) {
          const rounded = Math.floor(progress.progress / 10) * 10;
          if (rounded !== lastProgress) {
            console.log(`  ${progress.message}`);
            lastProgress = rounded;
          }
        } else if (progress.status === 'processing') {
          console.log(`  ${progress.message}`);
        }
      }
    );

    console.log('\n=== Result ===');
    if (result.success) {
      console.log(`✅ SUCCESS - Spotify Download`);
      console.log(`  File: ${result.fileName}`);
      console.log(`  Path: ${result.filePath}`);
      console.log(`  Size: ${((result.fileSize || 0) / 1024 / 1024).toFixed(2)} MB`);
      console.log('\n🎉 Spotify downloader working correctly!\n');
      process.exit(0);
    } else {
      console.log(`❌ FAILED - ${result.error}`);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

// Run test
testSpotify();
