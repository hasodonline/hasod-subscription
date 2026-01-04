/**
 * Local test script for yt-dlp
 * Tests the exact configuration used in the YouTube downloader service
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { getConfig, buildProxyUrl, getRandomProxyPort } from './src/utils/config';

// Test URL
const TEST_URL = 'https://www.youtube.com/watch?v=fVMihvd4Xzs';

// Output directory for test downloads
const OUTPUT_DIR = path.join(__dirname, 'test-downloads');

async function testYtDlp() {
  console.log('=== yt-dlp Local Test ===\n');
  console.log(`Test URL: ${TEST_URL}`);
  console.log(`Output directory: ${OUTPUT_DIR}\n`);

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`Created output directory: ${OUTPUT_DIR}\n`);
  }

  // Use bundled yt-dlp binary
  const ytDlpPath = path.join(process.cwd(), 'bin', 'yt-dlp');
  console.log(`Using yt-dlp at: ${ytDlpPath}`);

  // Check if yt-dlp exists
  if (!fs.existsSync(ytDlpPath)) {
    console.error(`ERROR: yt-dlp not found at ${ytDlpPath}`);
    console.error('Please ensure the yt-dlp binary is in the bin/ directory');
    process.exit(1);
  }

  // Output template
  const outputTemplate = path.join(OUTPUT_DIR, '%(title)s.%(ext)s');

  // Get proxy configuration (same as in production)
  const config = getConfig();
  const proxyConfig = config.proxy;
  const randomPort = proxyConfig?.enabled ? getRandomProxyPort() : null;
  const proxyUrl = randomPort ? buildProxyUrl(randomPort) : null;

  // EXACT yt-dlp arguments from youtube.downloader.ts
  const args = [
    TEST_URL,
    // Download audio-only stream directly (no video download needed)
    '--format', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best',
    '--extract-audio',
    '--audio-format', 'mp3',
    '--audio-quality', '0', // Best quality
    '--embed-metadata',
    '--embed-thumbnail',
    '--convert-thumbnails', 'jpg',
    '--output', outputTemplate,
    '--no-playlist', // Download only single video, not playlist

    // 2025 Anti-bot measures - Use Android client (WORKING!)
    '--extractor-args', 'youtube:player_client=android', // Android client bypasses bot detection
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', // Latest Chrome UA

    // Rate limiting & retry configuration
    '--retries', '5',
    '--fragment-retries', '5',
    '--retry-sleep', '2',
    '--sleep-interval', '2', // Increased from 1 to mimic human behavior
    '--max-sleep-interval', '5', // Increased from 3
    '--sleep-requests', '1', // Sleep 1 second between requests

    // Additional safety
    '--no-check-certificate', // Sometimes helps with cloud IPs
    '--geo-bypass',
    '--progress',
    '--newline',

    // HTTP headers to appear more browser-like
    '--add-header', 'Accept-Language:en-US,en;q=0.9',
    '--add-header', 'Sec-Fetch-Dest:empty',
    '--add-header', 'Sec-Fetch-Mode:cors',
    '--add-header', 'Sec-Fetch-Site:same-origin',
  ];

  // Add proxy if enabled with random port
  if (proxyUrl) {
    args.push('--proxy', proxyUrl);
    console.log(`Using proxy: ${proxyConfig?.host}:${randomPort}`);
  } else {
    console.log('Proxy: Disabled');
  }

  console.log('\n=== Command ===');
  console.log(`${ytDlpPath} ${args.join(' ')}\n`);

  console.log('=== Execution ===\n');

  // Execute yt-dlp
  return new Promise<void>((resolve, reject) => {
    const startTime = Date.now();
    const proc = spawn(ytDlpPath, args);

    let lastProgress = 0;
    let downloadedFile: string | null = null;

    // Capture stdout
    proc.stdout.on('data', (data) => {
      const output = data.toString();
      process.stdout.write(output);

      // Parse progress
      const progressMatch = output.match(/\[download\]\s+(\d+\.\d+)%/);
      if (progressMatch) {
        const progress = parseFloat(progressMatch[1]);
        if (progress !== lastProgress) {
          lastProgress = progress;
        }
      }

      // Extract filename
      const fileMatch = output.match(/\[download\] Destination: (.+)/);
      if (fileMatch) {
        downloadedFile = fileMatch[1].trim();
      }

      const extractMatch = output.match(/\[ExtractAudio\] Destination: (.+)/);
      if (extractMatch) {
        downloadedFile = extractMatch[1].trim();
      }
    });

    // Capture stderr
    proc.stderr.on('data', (data) => {
      const output = data.toString();
      process.stderr.write(`[STDERR] ${output}`);
    });

    // Handle completion
    proc.on('close', (code) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log(`\n=== Result ===`);
      console.log(`Exit code: ${code}`);
      console.log(`Duration: ${duration}s`);

      if (code === 0) {
        // Find downloaded files
        const files = fs.readdirSync(OUTPUT_DIR);
        const mp3Files = files.filter(f => f.endsWith('.mp3'));

        if (mp3Files.length > 0) {
          console.log(`\n✓ SUCCESS - Downloaded ${mp3Files.length} file(s):`);
          mp3Files.forEach(file => {
            const filePath = path.join(OUTPUT_DIR, file);
            const stats = fs.statSync(filePath);
            const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
            console.log(`  - ${file} (${sizeMB} MB)`);
          });
          resolve();
        } else {
          console.log('\n✗ ERROR - No MP3 files found');
          reject(new Error('No MP3 file found after download'));
        }
      } else {
        console.log(`\n✗ ERROR - yt-dlp exited with code ${code}`);
        reject(new Error(`yt-dlp exited with code ${code}`));
      }
    });

    // Handle errors
    proc.on('error', (err) => {
      console.error(`\n✗ ERROR - Process error:`, err);
      reject(err);
    });
  });
}

// Run the test
testYtDlp()
  .then(() => {
    console.log('\n=== Test Complete ===\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n=== Test Failed ===');
    console.error(error.message);
    console.error('\n');
    process.exit(1);
  });
