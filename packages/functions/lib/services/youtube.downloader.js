"use strict";
/**
 * YouTube/Generic Downloader Service
 * Downloads audio from YouTube, SoundCloud, and Bandcamp using yt-dlp
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.YoutubeDownloader = void 0;
exports.getYoutubeDownloader = getYoutubeDownloader;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const transliteration_service_1 = require("./transliteration.service");
const config_1 = require("../utils/config");
class YoutubeDownloader {
    constructor() {
        // Use bundled yt-dlp binary from bin/ directory
        // In Cloud Functions, process.cwd() points to the deployed function directory
        this.ytDlpPath = path.join(process.cwd(), 'bin', 'yt-dlp');
        console.log(`[YouTube] Using yt-dlp at: ${this.ytDlpPath}`);
    }
    /**
     * Download audio from URL (YouTube, SoundCloud, Bandcamp)
     */
    async download(url, outputDir, transliterate = false, progressCallback) {
        try {
            console.log(`[YouTube] Starting download: ${url}`);
            // Ensure output directory exists
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            // Output template for filename
            const outputTemplate = path.join(outputDir, '%(title)s.%(ext)s');
            // Get proxy configuration with random port
            const config = (0, config_1.getConfig)();
            const proxyConfig = config.proxy;
            const randomPort = proxyConfig?.enabled ? (0, config_1.getRandomProxyPort)() : null;
            const proxyUrl = randomPort ? (0, config_1.buildProxyUrl)(randomPort) : null;
            // yt-dlp arguments optimized for 2025 - anti-bot detection and memory efficiency
            const args = [
                url,
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
                // 2025 Anti-bot measures - Use Android client (works without PO token)
                '--extractor-args', 'youtube:player_client=android', // Android client bypasses bot detection
                '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', // Latest Chrome UA
                // Rate limiting & retry configuration
                '--retries', '3', // Reduced from 5 for faster proxy auth recovery
                '--fragment-retries', '3',
                '--retry-sleep', '1', // Reduced from 2 - faster retry on proxy 407 errors
                '--sleep-interval', '1', // Faster between requests
                '--max-sleep-interval', '3', // Reduced max sleep
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
                console.log(`[YouTube] Using proxy: ${proxyConfig?.host}:${randomPort}`);
            }
            console.log(`[YouTube] Running: yt-dlp ${args.join(' ')}`);
            // Track downloaded file
            let downloadedFile = null;
            let lastProgress = 0;
            // Execute yt-dlp
            const result = await new Promise((resolve, reject) => {
                const process = (0, child_process_1.spawn)(this.ytDlpPath, args);
                let isResolved = false;
                // Capture stdout
                process.stdout.on('data', (data) => {
                    const output = data.toString();
                    console.log(`[YouTube] ${output.trim()}`);
                    // Parse progress from output
                    // yt-dlp outputs like: [download]  45.0% of 5.20MiB at 1.50MiB/s ETA 00:02
                    const progressMatch = output.match(/\[download\]\s+(\d+\.\d+)%/);
                    if (progressMatch) {
                        const progress = parseFloat(progressMatch[1]);
                        if (progress !== lastProgress) {
                            lastProgress = progress;
                            if (progressCallback) {
                                progressCallback({
                                    status: 'downloading',
                                    progress,
                                    message: `Downloading... ${progress.toFixed(1)}%`,
                                });
                            }
                        }
                    }
                    // Detect when conversion starts
                    if (output.includes('[ffmpeg]') && output.includes('Extracting audio')) {
                        if (progressCallback) {
                            progressCallback({
                                status: 'processing',
                                progress: 90,
                                message: 'Converting to MP3...',
                            });
                        }
                    }
                    // Extract final filename
                    // yt-dlp outputs like: [download] Destination: filename.webm
                    const fileMatch = output.match(/\[download\] Destination: (.+)/);
                    if (fileMatch) {
                        downloadedFile = fileMatch[1].trim();
                    }
                    // Or: [ExtractAudio] Destination: filename.mp3
                    const extractMatch = output.match(/\[ExtractAudio\] Destination: (.+)/);
                    if (extractMatch) {
                        downloadedFile = extractMatch[1].trim();
                    }
                });
                // Capture stderr
                process.stderr.on('data', (data) => {
                    const output = data.toString();
                    console.error(`[YouTube] Error output: ${output.trim()}`);
                });
                // Handle completion - use 'exit' event which fires immediately
                // 'close' event can hang waiting for stdio streams to close
                const handleCompletion = (code) => {
                    if (isResolved)
                        return; // Already handled
                    isResolved = true;
                    console.log(`[YouTube] Process exited with code: ${code}`);
                    if (code === 0) {
                        // Success - find the downloaded file
                        console.log(`[YouTube] Scanning directory: ${outputDir}`);
                        try {
                            const files = fs.readdirSync(outputDir);
                            console.log(`[YouTube] Found ${files.length} files: ${files.join(', ')}`);
                            const mp3Files = files.filter(f => f.endsWith('.mp3'));
                            console.log(`[YouTube] Found ${mp3Files.length} MP3 files`);
                            if (mp3Files.length > 0) {
                                // Get the most recently modified file
                                const mostRecent = mp3Files
                                    .map(f => ({
                                    name: f,
                                    path: path.join(outputDir, f),
                                    time: fs.statSync(path.join(outputDir, f)).mtime.getTime()
                                }))
                                    .sort((a, b) => b.time - a.time)[0];
                                downloadedFile = mostRecent.path;
                                if (progressCallback) {
                                    progressCallback({
                                        status: 'complete',
                                        progress: 100,
                                        message: 'Download complete',
                                    });
                                }
                                resolve({
                                    success: true,
                                    filePath: downloadedFile,
                                    fileName: path.basename(downloadedFile),
                                    fileSize: fs.statSync(downloadedFile).size,
                                });
                            }
                            else {
                                reject(new Error('No MP3 file found after download'));
                            }
                        }
                        catch (error) {
                            console.error(`[YouTube] Error reading directory:`, error);
                            reject(error);
                        }
                    }
                    else {
                        reject(new Error(`yt-dlp exited with code ${code}`));
                    }
                };
                // Listen to both 'exit' and 'close' events
                // 'exit' fires immediately, 'close' fires after stdio closes
                process.on('exit', (code) => {
                    console.log(`[YouTube] Exit event fired with code: ${code}`);
                    // Force close stdio to trigger close event
                    process.stdout.destroy();
                    process.stderr.destroy();
                    handleCompletion(code);
                });
                process.on('close', (code) => {
                    console.log(`[YouTube] Close event fired with code: ${code}`);
                    handleCompletion(code);
                });
                // Handle errors
                process.on('error', (err) => {
                    console.error(`[YouTube] Process error:`, err);
                    reject(err);
                });
            });
            // Transliterate filename if needed
            if (result.success && result.filePath && transliterate) {
                const transliteratedPath = await this.transliterateFile(result.filePath);
                result.filePath = transliteratedPath;
                result.fileName = path.basename(transliteratedPath);
            }
            return result;
        }
        catch (error) {
            console.error(`[YouTube] Download failed:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    /**
     * Transliterate a file's name if it contains Hebrew
     */
    async transliterateFile(filePath) {
        const transliterationService = (0, transliteration_service_1.getTransliterationService)();
        const fileName = path.basename(filePath);
        const fileDir = path.dirname(filePath);
        if (!transliterationService.hasHebrew(fileName)) {
            return filePath;
        }
        const newFileName = await transliterationService.transliterateFilename(fileName);
        const newFilePath = path.join(fileDir, newFileName);
        fs.renameSync(filePath, newFilePath);
        console.log(`[YouTube] Renamed: ${fileName} -> ${newFileName}`);
        return newFilePath;
    }
    /**
     * Get video/track information without downloading
     */
    async getInfo(url) {
        return new Promise((resolve, reject) => {
            const args = [url, '--dump-json', '--no-playlist'];
            const process = (0, child_process_1.spawn)(this.ytDlpPath, args);
            let output = '';
            process.stdout.on('data', (data) => {
                output += data.toString();
            });
            process.on('close', (code) => {
                if (code === 0) {
                    try {
                        const info = JSON.parse(output);
                        resolve(info);
                    }
                    catch (error) {
                        reject(new Error('Failed to parse video info'));
                    }
                }
                else {
                    reject(new Error(`yt-dlp exited with code ${code}`));
                }
            });
            process.on('error', reject);
        });
    }
    /**
     * Check if yt-dlp is installed
     */
    async checkInstallation() {
        return new Promise((resolve) => {
            const process = (0, child_process_1.spawn)(this.ytDlpPath, ['--version']);
            process.on('close', (code) => {
                resolve(code === 0);
            });
            process.on('error', () => {
                resolve(false);
            });
        });
    }
}
exports.YoutubeDownloader = YoutubeDownloader;
// Singleton instance
let youtubeDownloader = null;
/**
 * Get the singleton YouTube downloader instance
 */
function getYoutubeDownloader() {
    if (!youtubeDownloader) {
        youtubeDownloader = new YoutubeDownloader();
    }
    return youtubeDownloader;
}
