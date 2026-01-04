/**
 * Proxy Configuration Comparison Test
 * Tests downloads with and without proxy to compare performance
 */

// Load environment variables from .env file
import * as dotenv from 'dotenv';
dotenv.config();

import { getYoutubeDownloader } from './src/services/youtube.downloader';
import { getConfig } from './src/utils/config';
import * as path from 'path';

const TEST_URL = 'https://www.youtube.com/watch?v=fVMihvd4Xzs';
const OUTPUT_DIR = path.join(__dirname, 'test-downloads');

async function testWithConfig(testName: string) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Testing: ${testName}`);
  console.log('='.repeat(50));

  // Check current config
  const config = getConfig();
  const proxyEnabled = config.proxy?.enabled;

  if (proxyEnabled) {
    console.log(`✓ Proxy ENABLED`);
    console.log(`  Host: ${config.proxy?.host}`);
    console.log(`  Port Range: ${config.proxy?.portMin}-${config.proxy?.portMax}`);
  } else {
    console.log(`✗ Proxy DISABLED`);
  }

  const startTime = Date.now();

  try {
    const downloader = getYoutubeDownloader();
    console.log(`\nDownloading: ${TEST_URL}\n`);

    const result = await downloader.download(TEST_URL, OUTPUT_DIR, false);
    const duration = (Date.now() - startTime) / 1000;

    if (result.success) {
      console.log(`\n✅ SUCCESS`);
      console.log(`   File: ${result.fileName}`);
      console.log(`   Size: ${((result.fileSize || 0) / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Duration: ${duration.toFixed(1)}s`);
      console.log(`   Speed: ${((result.fileSize || 0) / 1024 / 1024 / duration).toFixed(2)} MB/s`);
      return { success: true, duration, fileSize: result.fileSize };
    } else {
      console.log(`\n❌ FAILED: ${result.error}`);
      return { success: false, duration, error: result.error };
    }
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    console.log(`\n❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
    return { success: false, duration, error: String(error) };
  }
}

async function runComparison() {
  console.log('==========================================');
  console.log('  Proxy Configuration Comparison Test');
  console.log('==========================================');

  // Test with current configuration (from .env)
  const result1 = await testWithConfig('Current Configuration');

  console.log(`\n\n${'='.repeat(50)}`);
  console.log('Summary');
  console.log('='.repeat(50));

  const config = getConfig();
  const proxyStatus = config.proxy?.enabled ? '✓ ENABLED' : '✗ DISABLED';

  console.log(`\nProxy: ${proxyStatus}`);
  if (result1.success) {
    console.log(`Duration: ${result1.duration.toFixed(1)}s`);
    console.log(`Speed: ${((result1.fileSize || 0) / 1024 / 1024 / result1.duration).toFixed(2)} MB/s`);
  }

  console.log('\n');
  process.exit(result1.success ? 0 : 1);
}

runComparison();
