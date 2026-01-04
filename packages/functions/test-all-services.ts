/**
 * Comprehensive Media Services Test
 * Tests all supported media services with actual implementations
 */

// Load environment variables from .env file
import * as dotenv from 'dotenv';
dotenv.config();

import { getYoutubeDownloader } from './src/services/youtube.downloader';
import { getSpotifyDownloader } from './src/services/spotify.downloader';
import * as path from 'path';
import * as fs from 'fs';

// Test URLs from media test links.md
const TEST_URLS = {
  spotify: 'https://open.spotify.com/track/3U1voPJN8NBSR96Ry0WJiF?si=0a84b2897ae34ce2',
  soundcloud: 'https://soundcloud.com/rmx100/rose-bruno-mars-apt-rmx100',
  youtube: 'https://www.youtube.com/watch?v=fVMihvd4Xzs'
};

const OUTPUT_DIR = path.join(__dirname, 'test-downloads');

interface TestResult {
  service: string;
  url: string;
  success: boolean;
  duration: number;
  fileName?: string;
  fileSize?: number;
  error?: string;
}

const results: TestResult[] = [];

async function testYouTube(): Promise<TestResult> {
  const startTime = Date.now();
  console.log('==========================================');
  console.log('Testing: YouTube');
  console.log('==========================================');
  console.log(`URL: ${TEST_URLS.youtube}\n`);

  try {
    const downloader = getYoutubeDownloader();
    const result = await downloader.download(TEST_URLS.youtube, OUTPUT_DIR, false);

    const duration = (Date.now() - startTime) / 1000;

    if (result.success) {
      console.log(`✅ SUCCESS - YouTube`);
      console.log(`   📁 ${result.fileName} (${((result.fileSize || 0) / 1024 / 1024).toFixed(1)} MB)`);
      console.log(`   ⏱️  ${duration.toFixed(1)}s\n`);

      return {
        service: 'YouTube',
        url: TEST_URLS.youtube,
        success: true,
        duration,
        fileName: result.fileName,
        fileSize: result.fileSize
      };
    } else {
      console.log(`❌ FAILED - YouTube: ${result.error}\n`);
      return {
        service: 'YouTube',
        url: TEST_URLS.youtube,
        success: false,
        duration,
        error: result.error
      };
    }
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`❌ FAILED - YouTube: ${errorMsg}\n`);
    return {
      service: 'YouTube',
      url: TEST_URLS.youtube,
      success: false,
      duration,
      error: errorMsg
    };
  }
}

async function testSoundCloud(): Promise<TestResult> {
  const startTime = Date.now();
  console.log('==========================================');
  console.log('Testing: SoundCloud');
  console.log('==========================================');
  console.log(`URL: ${TEST_URLS.soundcloud}\n`);

  try {
    const downloader = getYoutubeDownloader();
    const result = await downloader.download(TEST_URLS.soundcloud, OUTPUT_DIR, false);

    const duration = (Date.now() - startTime) / 1000;

    if (result.success) {
      console.log(`✅ SUCCESS - SoundCloud`);
      console.log(`   📁 ${result.fileName} (${((result.fileSize || 0) / 1024 / 1024).toFixed(1)} MB)`);
      console.log(`   ⏱️  ${duration.toFixed(1)}s\n`);

      return {
        service: 'SoundCloud',
        url: TEST_URLS.soundcloud,
        success: true,
        duration,
        fileName: result.fileName,
        fileSize: result.fileSize
      };
    } else {
      console.log(`❌ FAILED - SoundCloud: ${result.error}\n`);
      return {
        service: 'SoundCloud',
        url: TEST_URLS.soundcloud,
        success: false,
        duration,
        error: result.error
      };
    }
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`❌ FAILED - SoundCloud: ${errorMsg}\n`);
    return {
      service: 'SoundCloud',
      url: TEST_URLS.soundcloud,
      success: false,
      duration,
      error: errorMsg
    };
  }
}

async function testSpotify(): Promise<TestResult> {
  const startTime = Date.now();
  console.log('==========================================');
  console.log('Testing: Spotify');
  console.log('==========================================');
  console.log(`URL: ${TEST_URLS.spotify}\n`);

  try {
    const downloader = getSpotifyDownloader();

    // Get track info first
    console.log('Getting track info from Spotify API...');
    const trackInfo = await downloader.getTrackInfo(TEST_URLS.spotify);

    if (!trackInfo) {
      throw new Error('Failed to get track info from Spotify');
    }

    console.log(`Track: ${trackInfo.artist} - ${trackInfo.name}`);
    console.log('Downloading from YouTube...\n');

    const result = await downloader.downloadTrack(TEST_URLS.spotify, OUTPUT_DIR, false);

    const duration = (Date.now() - startTime) / 1000;

    if (result.success) {
      console.log(`✅ SUCCESS - Spotify`);
      console.log(`   📁 ${result.fileName} (${((result.fileSize || 0) / 1024 / 1024).toFixed(1)} MB)`);
      console.log(`   ⏱️  ${duration.toFixed(1)}s\n`);

      return {
        service: 'Spotify',
        url: TEST_URLS.spotify,
        success: true,
        duration,
        fileName: result.fileName,
        fileSize: result.fileSize
      };
    } else {
      console.log(`❌ FAILED - Spotify: ${result.error}\n`);
      return {
        service: 'Spotify',
        url: TEST_URLS.spotify,
        success: false,
        duration,
        error: result.error
      };
    }
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`❌ FAILED - Spotify: ${errorMsg}\n`);
    return {
      service: 'Spotify',
      url: TEST_URLS.spotify,
      success: false,
      duration,
      error: errorMsg
    };
  }
}

async function runAllTests() {
  console.log('==========================================');
  console.log('  Media Services Comprehensive Test');
  console.log('==========================================\n');
  console.log(`Output directory: ${OUTPUT_DIR}\n`);

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Run tests
  results.push(await testYouTube());
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s between tests

  results.push(await testSoundCloud());
  await new Promise(resolve => setTimeout(resolve, 2000));

  results.push(await testSpotify());

  // Print summary
  console.log('==========================================');
  console.log('  Test Summary');
  console.log('==========================================\n');

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`Total Tests:  ${results.length}`);
  console.log(`Passed:       ${passed} ✅`);
  console.log(`Failed:       ${failed} ❌`);
  console.log(`Duration:     ${totalDuration.toFixed(1)}s\n`);

  // Detailed results
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${result.service.padEnd(12)} ${result.duration.toFixed(1)}s`);
    if (result.success && result.fileName) {
      console.log(`   ${result.fileName}`);
    } else if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  console.log('');

  if (failed === 0) {
    console.log('🎉 All media services working correctly!\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. See details above.\n');
    process.exit(1);
  }
}

// Run tests
runAllTests();
