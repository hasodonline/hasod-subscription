/**
 * Storage Service
 * Handles file uploads to Cloud Storage and signed URL generation
 */

import { Storage } from '@google-cloud/storage';
import { getConfig } from '../utils/config';
import * as path from 'path';
import * as fs from 'fs';

export class StorageService {
  private storage: Storage;
  private bucketName: string;

  constructor() {
    this.storage = new Storage();
    const config = getConfig();
    this.bucketName = config.storage?.bucket || 'hasod-downloads-temp';
  }

  /**
   * Upload a file to Cloud Storage
   */
  public async uploadFile(
    localFilePath: string,
    jobId: string,
    filename?: string
  ): Promise<string> {
    try {
      const fileName = filename || path.basename(localFilePath);
      const destination = `${jobId}/${fileName}`;

      console.log(`[Storage] Uploading ${localFilePath} to gs://${this.bucketName}/${destination}`);

      const bucket = this.storage.bucket(this.bucketName);
      await bucket.upload(localFilePath, {
        destination,
        metadata: {
          metadata: {
            jobId,
            uploadedAt: new Date().toISOString(),
          },
        },
      });

      console.log(`[Storage] Upload successful: ${destination}`);
      return destination;
    } catch (error) {
      console.error(`[Storage] Upload failed:`, error);
      throw new Error(`Failed to upload file: ${error}`);
    }
  }

  /**
   * Generate a signed URL for downloading a file
   * URL expires after 24 hours
   */
  public async getSignedDownloadUrl(filePath: string): Promise<string> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(filePath);

      // Generate signed URL valid for 24 hours
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      });

      console.log(`[Storage] Generated signed URL for: ${filePath}`);
      return url;
    } catch (error) {
      console.error(`[Storage] Failed to generate signed URL:`, error);
      throw new Error(`Failed to generate download URL: ${error}`);
    }
  }

  /**
   * Delete a file from Cloud Storage
   */
  public async deleteFile(filePath: string): Promise<void> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(filePath);

      await file.delete();
      console.log(`[Storage] Deleted: ${filePath}`);
    } catch (error) {
      console.error(`[Storage] Failed to delete file:`, error);
      // Don't throw - deletion failures shouldn't break the flow
    }
  }

  /**
   * Delete all files for a job
   */
  public async deleteJobFiles(jobId: string): Promise<void> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const [files] = await bucket.getFiles({ prefix: `${jobId}/` });

      console.log(`[Storage] Deleting ${files.length} files for job: ${jobId}`);

      await Promise.all(files.map((file) => file.delete()));
      console.log(`[Storage] Deleted all files for job: ${jobId}`);
    } catch (error) {
      console.error(`[Storage] Failed to delete job files:`, error);
      // Don't throw - deletion failures shouldn't break the flow
    }
  }

  /**
   * Get file size
   */
  public getFileSize(filePath: string): number {
    try {
      const stats = fs.statSync(filePath);
      return stats.size;
    } catch (error) {
      console.error(`[Storage] Failed to get file size:`, error);
      return 0;
    }
  }

  /**
   * Check if a file exists in Cloud Storage
   */
  public async fileExists(filePath: string): Promise<boolean> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(filePath);
      const [exists] = await file.exists();
      return exists;
    } catch (error) {
      console.error(`[Storage] Failed to check file existence:`, error);
      return false;
    }
  }

  /**
   * List all files for a job
   */
  public async listJobFiles(jobId: string): Promise<Array<{name: string; size: number}>> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const [files] = await bucket.getFiles({ prefix: `${jobId}/` });

      return files.map((file) => ({
        name: path.basename(file.name),
        size: typeof file.metadata.size === 'string' ? parseInt(file.metadata.size, 10) : file.metadata.size || 0,
      }));
    } catch (error) {
      console.error(`[Storage] Failed to list job files:`, error);
      return [];
    }
  }

  /**
   * Delete files older than specified hours
   * Used for cleanup scheduled function
   */
  public async deleteOldFiles(hoursOld: number = 24): Promise<number> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const [files] = await bucket.getFiles();

      const now = Date.now();
      const cutoffTime = now - hoursOld * 60 * 60 * 1000;

      let deletedCount = 0;

      for (const file of files) {
        const createdTime = new Date(file.metadata.timeCreated || 0).getTime();

        if (createdTime < cutoffTime) {
          await file.delete();
          deletedCount++;
        }
      }

      console.log(`[Storage] Cleanup: Deleted ${deletedCount} old files`);
      return deletedCount;
    } catch (error) {
      console.error(`[Storage] Cleanup failed:`, error);
      return 0;
    }
  }
}

// Singleton instance
let storageService: StorageService | null = null;

/**
 * Get the singleton storage service instance
 */
export function getStorageService(): StorageService {
  if (!storageService) {
    storageService = new StorageService();
  }
  return storageService;
}
