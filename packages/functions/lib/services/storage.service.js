"use strict";
/**
 * Storage Service
 * Handles file uploads to Cloud Storage and signed URL generation
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
exports.StorageService = void 0;
exports.getStorageService = getStorageService;
const storage_1 = require("@google-cloud/storage");
const config_1 = require("../utils/config");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class StorageService {
    constructor() {
        this.storage = new storage_1.Storage();
        const config = (0, config_1.getConfig)();
        this.bucketName = config.storage?.bucket || 'hasod-downloads-temp';
    }
    /**
     * Upload a file to Cloud Storage
     */
    async uploadFile(localFilePath, jobId, filename) {
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
        }
        catch (error) {
            console.error(`[Storage] Upload failed:`, error);
            throw new Error(`Failed to upload file: ${error}`);
        }
    }
    /**
     * Generate a signed URL for downloading a file
     * URL expires after 24 hours
     */
    async getSignedDownloadUrl(filePath) {
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
        }
        catch (error) {
            console.error(`[Storage] Failed to generate signed URL:`, error);
            throw new Error(`Failed to generate download URL: ${error}`);
        }
    }
    /**
     * Delete a file from Cloud Storage
     */
    async deleteFile(filePath) {
        try {
            const bucket = this.storage.bucket(this.bucketName);
            const file = bucket.file(filePath);
            await file.delete();
            console.log(`[Storage] Deleted: ${filePath}`);
        }
        catch (error) {
            console.error(`[Storage] Failed to delete file:`, error);
            // Don't throw - deletion failures shouldn't break the flow
        }
    }
    /**
     * Delete all files for a job
     */
    async deleteJobFiles(jobId) {
        try {
            const bucket = this.storage.bucket(this.bucketName);
            const [files] = await bucket.getFiles({ prefix: `${jobId}/` });
            console.log(`[Storage] Deleting ${files.length} files for job: ${jobId}`);
            await Promise.all(files.map((file) => file.delete()));
            console.log(`[Storage] Deleted all files for job: ${jobId}`);
        }
        catch (error) {
            console.error(`[Storage] Failed to delete job files:`, error);
            // Don't throw - deletion failures shouldn't break the flow
        }
    }
    /**
     * Get file size
     */
    getFileSize(filePath) {
        try {
            const stats = fs.statSync(filePath);
            return stats.size;
        }
        catch (error) {
            console.error(`[Storage] Failed to get file size:`, error);
            return 0;
        }
    }
    /**
     * Check if a file exists in Cloud Storage
     */
    async fileExists(filePath) {
        try {
            const bucket = this.storage.bucket(this.bucketName);
            const file = bucket.file(filePath);
            const [exists] = await file.exists();
            return exists;
        }
        catch (error) {
            console.error(`[Storage] Failed to check file existence:`, error);
            return false;
        }
    }
    /**
     * List all files for a job
     */
    async listJobFiles(jobId) {
        try {
            const bucket = this.storage.bucket(this.bucketName);
            const [files] = await bucket.getFiles({ prefix: `${jobId}/` });
            return files.map((file) => ({
                name: path.basename(file.name),
                size: typeof file.metadata.size === 'string' ? parseInt(file.metadata.size, 10) : file.metadata.size || 0,
            }));
        }
        catch (error) {
            console.error(`[Storage] Failed to list job files:`, error);
            return [];
        }
    }
    /**
     * Delete files older than specified hours
     * Used for cleanup scheduled function
     */
    async deleteOldFiles(hoursOld = 24) {
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
        }
        catch (error) {
            console.error(`[Storage] Cleanup failed:`, error);
            return 0;
        }
    }
}
exports.StorageService = StorageService;
// Singleton instance
let storageService = null;
/**
 * Get the singleton storage service instance
 */
function getStorageService() {
    if (!storageService) {
        storageService = new StorageService();
    }
    return storageService;
}
