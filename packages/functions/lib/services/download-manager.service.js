"use strict";
/**
 * Download Manager Service
 * Orchestrates download jobs, manages progress, and coordinates all downloaders
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
exports.DownloadManagerService = void 0;
exports.getDownloadManagerService = getDownloadManagerService;
const firestore_1 = require("firebase-admin/firestore");
const url_parser_service_1 = require("./url-parser.service");
const youtube_downloader_1 = require("./youtube.downloader");
const spotify_downloader_1 = require("./spotify.downloader");
const storage_service_1 = require("./storage.service");
const zip_service_1 = require("./zip.service");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
class DownloadManagerService {
    constructor() {
        this.db = (0, firestore_1.getFirestore)();
    }
    /**
     * Create a new download job
     */
    async createJob(uid, url, transliterate = false) {
        // Parse and validate URL
        const parsed = url_parser_service_1.URLParserService.parse(url);
        if (parsed.platform === url_parser_service_1.Platform.UNKNOWN) {
            throw new Error('Unsupported or invalid URL');
        }
        if (!url_parser_service_1.URLParserService.isSafe(url)) {
            throw new Error('URL is not allowed');
        }
        // Generate job ID
        const jobId = this.db.collection('downloadJobs').doc().id;
        // Determine if this is an album/playlist
        let type = 'single';
        let estimatedTracks = 1;
        if (parsed.type === 'album') {
            type = 'album';
            // For Spotify albums, we can get the track count
            if (parsed.platform === url_parser_service_1.Platform.SPOTIFY) {
                try {
                    const spotifyDownloader = (0, spotify_downloader_1.getSpotifyDownloader)();
                    const albumInfo = await spotifyDownloader.getAlbumInfo(parsed.cleanUrl);
                    if (albumInfo) {
                        estimatedTracks = albumInfo.trackCount;
                    }
                }
                catch (error) {
                    console.warn('[DownloadManager] Could not fetch album track count:', error);
                }
            }
        }
        else if (parsed.type === 'playlist') {
            type = 'playlist';
            estimatedTracks = 10; // Default estimate
        }
        // Create job document
        const job = {
            jobId,
            uid,
            url: parsed.cleanUrl,
            platform: parsed.platform,
            type,
            status: 'queued',
            progress: 0,
            message: 'Job queued',
            metadata: {},
            files: [],
            transliterateEnabled: transliterate,
            createdAt: firestore_1.Timestamp.now(),
        };
        await this.db.collection('downloadJobs').doc(jobId).set(job);
        console.log(`[DownloadManager] Created job: ${jobId} (${type}, ${estimatedTracks} tracks)`);
        // Start processing in background (don't await)
        this.processJob(jobId).catch(error => {
            console.error(`[DownloadManager] Job ${jobId} failed:`, error);
            this.updateJobStatus(jobId, 'error', 0, error.message);
        });
        return { jobId, estimatedTracks: type !== 'single' ? estimatedTracks : undefined };
    }
    /**
     * Process a download job
     */
    async processJob(jobId) {
        const job = await this.getJob(jobId);
        if (!job) {
            throw new Error('Job not found');
        }
        try {
            console.log(`[DownloadManager] Processing job: ${jobId}`);
            // Create temporary directory for this job
            const tmpDir = path.join(os.tmpdir(), `download-${jobId}`);
            if (!fs.existsSync(tmpDir)) {
                fs.mkdirSync(tmpDir, { recursive: true });
            }
            // Update status
            await this.updateJobStatus(jobId, 'downloading', 0, 'Starting download...');
            // Download based on platform and type
            if (job.type === 'album' && job.platform === url_parser_service_1.Platform.SPOTIFY) {
                await this.processSpotifyAlbum(jobId, job, tmpDir);
            }
            else if (job.platform === url_parser_service_1.Platform.SPOTIFY) {
                await this.processSpotifyTrack(jobId, job, tmpDir);
            }
            else {
                await this.processYoutubeDownload(jobId, job, tmpDir);
            }
            console.log(`[DownloadManager] Job ${jobId} completed successfully`);
        }
        catch (error) {
            console.error(`[DownloadManager] Job ${jobId} failed:`, error);
            await this.updateJobStatus(jobId, 'error', 0, error instanceof Error ? error.message : 'Download failed');
        }
    }
    /**
     * Process YouTube/SoundCloud/Bandcamp download
     */
    async processYoutubeDownload(jobId, job, tmpDir) {
        const youtubeDownloader = (0, youtube_downloader_1.getYoutubeDownloader)();
        const result = await youtubeDownloader.download(job.url, tmpDir, job.transliterateEnabled, async (progress) => {
            await this.updateJobStatus(jobId, progress.status, progress.progress, progress.message);
        });
        if (!result.success || !result.filePath) {
            throw new Error(result.error || 'Download failed');
        }
        // Upload to storage
        await this.updateJobStatus(jobId, 'processing', 95, 'Uploading file...');
        await this.uploadAndFinalize(jobId, [result.filePath], false);
    }
    /**
     * Process Spotify track download
     */
    async processSpotifyTrack(jobId, job, tmpDir) {
        const spotifyDownloader = (0, spotify_downloader_1.getSpotifyDownloader)();
        // Get track info first
        const trackInfo = await spotifyDownloader.getTrackInfo(job.url);
        if (trackInfo) {
            await this.db.collection('downloadJobs').doc(jobId).update({
                'metadata.title': trackInfo.name,
                'metadata.artist': trackInfo.artist,
                'metadata.album': trackInfo.album,
            });
        }
        const result = await spotifyDownloader.downloadTrack(job.url, tmpDir, job.transliterateEnabled, async (progress) => {
            await this.updateJobStatus(jobId, progress.status, progress.progress, progress.message);
        });
        if (!result.success || !result.filePath) {
            throw new Error(result.error || 'Download failed');
        }
        // Upload to storage
        await this.updateJobStatus(jobId, 'processing', 95, 'Uploading file...');
        await this.uploadAndFinalize(jobId, [result.filePath], false);
    }
    /**
     * Process Spotify album download
     */
    async processSpotifyAlbum(jobId, job, tmpDir) {
        const spotifyDownloader = (0, spotify_downloader_1.getSpotifyDownloader)();
        // Get album info
        const albumInfo = await spotifyDownloader.getAlbumInfo(job.url);
        if (!albumInfo) {
            throw new Error('Failed to fetch album information');
        }
        await this.db.collection('downloadJobs').doc(jobId).update({
            'metadata.album': albumInfo.name,
            'metadata.artist': albumInfo.artist,
            'metadata.trackCount': albumInfo.trackCount,
        });
        console.log(`[DownloadManager] Downloading ${albumInfo.trackCount} tracks from album: ${albumInfo.name}`);
        const downloadedFiles = [];
        // Download each track
        for (let i = 0; i < albumInfo.tracks.length; i++) {
            const track = albumInfo.tracks[i];
            const trackNum = i + 1;
            await this.updateJobStatus(jobId, 'downloading', (trackNum / albumInfo.trackCount) * 90, `Downloading track ${trackNum}/${albumInfo.trackCount}: ${track.name}`);
            const trackUrl = `https://open.spotify.com/track/${track.id}`;
            const result = await spotifyDownloader.downloadTrack(trackUrl, tmpDir, job.transliterateEnabled);
            if (result.success && result.filePath) {
                downloadedFiles.push(result.filePath);
            }
            else {
                console.warn(`[DownloadManager] Failed to download track ${trackNum}: ${track.name}`);
            }
        }
        if (downloadedFiles.length === 0) {
            throw new Error('No tracks were successfully downloaded');
        }
        // Create ZIP and upload
        await this.updateJobStatus(jobId, 'processing', 92, 'Creating archive...');
        await this.uploadAndFinalize(jobId, downloadedFiles, true);
    }
    /**
     * Upload files to storage and finalize job
     */
    async uploadAndFinalize(jobId, filePaths, createZip) {
        const storageService = (0, storage_service_1.getStorageService)();
        const zipService = (0, zip_service_1.getZipService)();
        let finalFilePath;
        let finalFileName;
        if (createZip && filePaths.length > 1) {
            // Create ZIP
            const zipPath = path.join(path.dirname(filePaths[0]), `download-${jobId}.zip`);
            await zipService.createZip(filePaths.map(fp => ({
                localPath: fp,
                nameInZip: path.basename(fp),
            })), zipPath);
            finalFilePath = zipPath;
            finalFileName = path.basename(zipPath);
        }
        else {
            finalFilePath = filePaths[0];
            finalFileName = path.basename(filePaths[0]);
        }
        // Upload to storage
        const storagePath = await storageService.uploadFile(finalFilePath, jobId, finalFileName);
        // Generate signed download URL
        const downloadUrl = await storageService.getSignedDownloadUrl(storagePath);
        // Calculate expiry (24 hours from now)
        const expiresAt = firestore_1.Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
        // Update job with completion info
        await this.db.collection('downloadJobs').doc(jobId).update({
            status: 'complete',
            progress: 100,
            message: 'Download ready',
            downloadUrl,
            expiresAt,
            completedAt: firestore_1.Timestamp.now(),
            files: filePaths.map(fp => ({
                name: path.basename(fp),
                path: storagePath,
                size: storageService.getFileSize(fp),
            })),
        });
        // Cleanup temporary directory
        this.cleanupTempDir(path.dirname(filePaths[0]));
    }
    /**
     * Update job status in Firestore
     */
    async updateJobStatus(jobId, status, progress, message) {
        const updates = { status, updatedAt: firestore_1.FieldValue.serverTimestamp() };
        if (progress !== undefined) {
            updates.progress = Math.min(100, Math.max(0, progress));
        }
        if (message) {
            updates.message = message;
        }
        if (status === 'error' && message) {
            updates.error = message;
        }
        await this.db.collection('downloadJobs').doc(jobId).update(updates);
    }
    /**
     * Get job by ID
     */
    async getJob(jobId) {
        const doc = await this.db.collection('downloadJobs').doc(jobId).get();
        if (!doc.exists) {
            return null;
        }
        return doc.data();
    }
    /**
     * Get user's download history
     */
    async getUserJobs(uid, limit = 30) {
        const snapshot = await this.db
            .collection('downloadJobs')
            .where('uid', '==', uid)
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();
        return snapshot.docs.map(doc => doc.data());
    }
    /**
     * Delete a job and its files
     */
    async deleteJob(jobId, uid) {
        const job = await this.getJob(jobId);
        if (!job) {
            throw new Error('Job not found');
        }
        if (job.uid !== uid) {
            throw new Error('Unauthorized');
        }
        // Delete files from storage
        const storageService = (0, storage_service_1.getStorageService)();
        await storageService.deleteJobFiles(jobId);
        // Delete job document
        await this.db.collection('downloadJobs').doc(jobId).delete();
    }
    /**
     * Cleanup temporary directory
     */
    cleanupTempDir(dirPath) {
        try {
            if (fs.existsSync(dirPath)) {
                fs.rmSync(dirPath, { recursive: true, force: true });
                console.log(`[DownloadManager] Cleaned up temp dir: ${dirPath}`);
            }
        }
        catch (error) {
            console.error(`[DownloadManager] Failed to cleanup temp dir:`, error);
        }
    }
}
exports.DownloadManagerService = DownloadManagerService;
// Singleton instance
let downloadManagerService = null;
/**
 * Get the singleton download manager service instance
 */
function getDownloadManagerService() {
    if (!downloadManagerService) {
        downloadManagerService = new DownloadManagerService();
    }
    return downloadManagerService;
}
