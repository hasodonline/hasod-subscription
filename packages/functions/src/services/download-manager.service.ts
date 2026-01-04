/**
 * Download Manager Service
 * Orchestrates download jobs, manages progress, and coordinates all downloaders
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { URLParserService, Platform } from './url-parser.service';
import { getYoutubeDownloader } from './youtube.downloader';
import { getSpotifyDownloader } from './spotify.downloader';
import { getStorageService } from './storage.service';
import { getZipService } from './zip.service';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export type JobStatus = 'queued' | 'downloading' | 'processing' | 'complete' | 'error';

export interface DownloadJob {
  jobId: string;
  uid: string;
  url: string;
  platform: Platform;
  type: 'single' | 'album' | 'playlist';
  status: JobStatus;
  progress: number;
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
  expiresAt?: Timestamp;
  transliterateEnabled: boolean;
  createdAt: Timestamp;
  completedAt?: Timestamp;
  error?: string;
}

export class DownloadManagerService {
  private db = getFirestore();

  /**
   * Create a new download job
   */
  public async createJob(
    uid: string,
    url: string,
    transliterate: boolean = false
  ): Promise<{jobId: string; estimatedTracks?: number}> {
    // Parse and validate URL
    const parsed = URLParserService.parse(url);

    if (parsed.platform === Platform.UNKNOWN) {
      throw new Error('Unsupported or invalid URL');
    }

    if (!URLParserService.isSafe(url)) {
      throw new Error('URL is not allowed');
    }

    // Generate job ID
    const jobId = this.db.collection('downloadJobs').doc().id;

    // Determine if this is an album/playlist
    let type: 'single' | 'album' | 'playlist' = 'single';
    let estimatedTracks = 1;

    if (parsed.type === 'album') {
      type = 'album';
      // For Spotify albums, we can get the track count
      if (parsed.platform === Platform.SPOTIFY) {
        try {
          const spotifyDownloader = getSpotifyDownloader();
          const albumInfo = await spotifyDownloader.getAlbumInfo(parsed.cleanUrl);
          if (albumInfo) {
            estimatedTracks = albumInfo.trackCount;
          }
        } catch (error) {
          console.warn('[DownloadManager] Could not fetch album track count:', error);
        }
      }
    } else if (parsed.type === 'playlist') {
      type = 'playlist';
      estimatedTracks = 10; // Default estimate
    }

    // Create job document
    const job: DownloadJob = {
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
      createdAt: Timestamp.now(),
    };

    await this.db.collection('downloadJobs').doc(jobId).set(job);
    console.log(`[DownloadManager] Created job: ${jobId} (${type}, ${estimatedTracks} tracks)`);

    // Start processing in background (don't await)
    this.processJob(jobId).catch(error => {
      console.error(`[DownloadManager] Job ${jobId} failed:`, error);
      this.updateJobStatus(jobId, 'error', 0, error.message);
    });

    return {jobId, estimatedTracks: type !== 'single' ? estimatedTracks : undefined};
  }

  /**
   * Process a download job
   */
  private async processJob(jobId: string): Promise<void> {
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
      if (job.type === 'album' && job.platform === Platform.SPOTIFY) {
        await this.processSpotifyAlbum(jobId, job, tmpDir);
      } else if (job.platform === Platform.SPOTIFY) {
        await this.processSpotifyTrack(jobId, job, tmpDir);
      } else {
        await this.processYoutubeDownload(jobId, job, tmpDir);
      }

      console.log(`[DownloadManager] Job ${jobId} completed successfully`);
    } catch (error) {
      console.error(`[DownloadManager] Job ${jobId} failed:`, error);
      await this.updateJobStatus(
        jobId,
        'error',
        0,
        error instanceof Error ? error.message : 'Download failed'
      );
    }
  }

  /**
   * Process YouTube/SoundCloud/Bandcamp download
   */
  private async processYoutubeDownload(
    jobId: string,
    job: DownloadJob,
    tmpDir: string
  ): Promise<void> {
    const youtubeDownloader = getYoutubeDownloader();

    const result = await youtubeDownloader.download(
      job.url,
      tmpDir,
      job.transliterateEnabled,
      async (progress) => {
        await this.updateJobStatus(jobId, progress.status as JobStatus, progress.progress, progress.message);
      }
    );

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
  private async processSpotifyTrack(
    jobId: string,
    job: DownloadJob,
    tmpDir: string
  ): Promise<void> {
    const spotifyDownloader = getSpotifyDownloader();

    // Get track info first
    const trackInfo = await spotifyDownloader.getTrackInfo(job.url);
    if (trackInfo) {
      await this.db.collection('downloadJobs').doc(jobId).update({
        'metadata.title': trackInfo.name,
        'metadata.artist': trackInfo.artist,
        'metadata.album': trackInfo.album,
      });
    }

    const result = await spotifyDownloader.downloadTrack(
      job.url,
      tmpDir,
      job.transliterateEnabled,
      async (progress) => {
        await this.updateJobStatus(jobId, progress.status as JobStatus, progress.progress, progress.message);
      }
    );

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
  private async processSpotifyAlbum(
    jobId: string,
    job: DownloadJob,
    tmpDir: string
  ): Promise<void> {
    const spotifyDownloader = getSpotifyDownloader();

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

    const downloadedFiles: string[] = [];

    // Download each track
    for (let i = 0; i < albumInfo.tracks.length; i++) {
      const track = albumInfo.tracks[i];
      const trackNum = i + 1;

      await this.updateJobStatus(
        jobId,
        'downloading',
        (trackNum / albumInfo.trackCount) * 90,
        `Downloading track ${trackNum}/${albumInfo.trackCount}: ${track.name}`
      );

      const trackUrl = `https://open.spotify.com/track/${track.id}`;
      const result = await spotifyDownloader.downloadTrack(
        trackUrl,
        tmpDir,
        job.transliterateEnabled
      );

      if (result.success && result.filePath) {
        downloadedFiles.push(result.filePath);
      } else {
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
  private async uploadAndFinalize(
    jobId: string,
    filePaths: string[],
    createZip: boolean
  ): Promise<void> {
    const storageService = getStorageService();
    const zipService = getZipService();

    let finalFilePath: string;
    let finalFileName: string;

    if (createZip && filePaths.length > 1) {
      // Create ZIP
      const zipPath = path.join(path.dirname(filePaths[0]), `download-${jobId}.zip`);
      await zipService.createZip(
        filePaths.map(fp => ({
          localPath: fp,
          nameInZip: path.basename(fp),
        })),
        zipPath
      );
      finalFilePath = zipPath;
      finalFileName = path.basename(zipPath);
    } else {
      finalFilePath = filePaths[0];
      finalFileName = path.basename(filePaths[0]);
    }

    // Upload to storage
    const storagePath = await storageService.uploadFile(finalFilePath, jobId, finalFileName);

    // Generate signed download URL
    const downloadUrl = await storageService.getSignedDownloadUrl(storagePath);

    // Calculate expiry (24 hours from now)
    const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);

    // Update job with completion info
    await this.db.collection('downloadJobs').doc(jobId).update({
      status: 'complete',
      progress: 100,
      message: 'Download ready',
      downloadUrl,
      expiresAt,
      completedAt: Timestamp.now(),
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
  private async updateJobStatus(
    jobId: string,
    status: JobStatus,
    progress?: number,
    message?: string
  ): Promise<void> {
    const updates: any = {status, updatedAt: FieldValue.serverTimestamp()};

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
  public async getJob(jobId: string): Promise<DownloadJob | null> {
    const doc = await this.db.collection('downloadJobs').doc(jobId).get();
    if (!doc.exists) {
      return null;
    }
    return doc.data() as DownloadJob;
  }

  /**
   * Get user's download history
   */
  public async getUserJobs(uid: string, limit: number = 30): Promise<DownloadJob[]> {
    const snapshot = await this.db
      .collection('downloadJobs')
      .where('uid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => doc.data() as DownloadJob);
  }

  /**
   * Delete a job and its files
   */
  public async deleteJob(jobId: string, uid: string): Promise<void> {
    const job = await this.getJob(jobId);

    if (!job) {
      throw new Error('Job not found');
    }

    if (job.uid !== uid) {
      throw new Error('Unauthorized');
    }

    // Delete files from storage
    const storageService = getStorageService();
    await storageService.deleteJobFiles(jobId);

    // Delete job document
    await this.db.collection('downloadJobs').doc(jobId).delete();
  }

  /**
   * Cleanup temporary directory
   */
  private cleanupTempDir(dirPath: string): void {
    try {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, {recursive: true, force: true});
        console.log(`[DownloadManager] Cleaned up temp dir: ${dirPath}`);
      }
    } catch (error) {
      console.error(`[DownloadManager] Failed to cleanup temp dir:`, error);
    }
  }
}

// Singleton instance
let downloadManagerService: DownloadManagerService | null = null;

/**
 * Get the singleton download manager service instance
 */
export function getDownloadManagerService(): DownloadManagerService {
  if (!downloadManagerService) {
    downloadManagerService = new DownloadManagerService();
  }
  return downloadManagerService;
}
