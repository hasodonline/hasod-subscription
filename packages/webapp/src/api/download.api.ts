/**
 * Download API Client
 * Handles communication with the download service backend
 *
 * Types are generated from OpenAPI spec - see packages/api-spec/openapi.yaml
 */

import apiClient from './client';
import { getFirestore, doc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import type { components } from './schema';

// Re-export types for convenience
export type SubmitDownloadRequest = components['schemas']['SubmitDownloadRequest'];
export type SubmitDownloadResponse = components['schemas']['SubmitDownloadResponse'];
export type DownloadJob = components['schemas']['DownloadJob'];
export type DownloadJobResponse = components['schemas']['DownloadJobResponse'];
export type DownloadHistoryResponse = components['schemas']['DownloadHistoryResponse'];
export type DownloadMetadata = components['schemas']['DownloadMetadata'];
export type DownloadFile = components['schemas']['DownloadFile'];
export type Platform = components['schemas']['Platform'];
export type DownloadType = components['schemas']['DownloadType'];
export type JobStatus = components['schemas']['JobStatus'];

const db = getFirestore();

/**
 * Submit a new download job
 */
export const submitDownload = async (
  uid: string,
  url: string,
  transliterate: boolean = false
): Promise<SubmitDownloadResponse> => {
  const payload: SubmitDownloadRequest = { uid, url, transliterate };
  const response = await apiClient.post<SubmitDownloadResponse>('/download/submit', payload);
  return response.data;
};

/**
 * Get the status of a download job
 */
export const getJobStatus = async (jobId: string, uid: string): Promise<DownloadJob> => {
  const response = await apiClient.get<DownloadJobResponse>(`/download/status/${jobId}`, {
    params: { uid },
  });
  return response.data.job;
};

/**
 * Get user's download history
 */
export const getDownloadHistory = async (uid: string, limit: number = 30): Promise<DownloadJob[]> => {
  const response = await apiClient.get<DownloadHistoryResponse>('/download/history', {
    params: { uid, limit },
  });
  return response.data.jobs;
};

/**
 * Delete a download job and its files
 */
export const deleteJob = async (jobId: string, uid: string): Promise<void> => {
  await apiClient.delete(`/download/${jobId}`, { data: { uid } });
};

/**
 * Subscribe to real-time job updates from Firestore
 * Returns an unsubscribe function
 */
export const subscribeToJob = (
  jobId: string,
  callback: (job: DownloadJob | null) => void
): Unsubscribe => {
  const jobRef = doc(db, 'downloadJobs', jobId);

  return onSnapshot(
    jobRef,
    (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data() as DownloadJob);
      } else {
        callback(null);
      }
    },
    (error) => {
      console.error('Error subscribing to job updates:', error);
      callback(null);
    }
  );
};

/**
 * Check if a URL is valid for downloading
 */
export const isValidDownloadUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const trimmedUrl = url.trim().toLowerCase();

  // Check supported platforms
  const patterns = [
    /youtube\.com\/watch/,
    /youtu\.be\//,
    /music\.youtube\.com/,
    /open\.spotify\.com\/(track|album|playlist)/,
    /spotify:(track|album|playlist)/,
    /soundcloud\.com\//,
    /bandcamp\.com\/(track|album)/,
  ];

  return patterns.some((pattern) => pattern.test(trimmedUrl));
};

/**
 * Detect the platform from a URL
 */
export const detectPlatform = (url: string): string => {
  if (!url) return 'Unknown';

  const trimmedUrl = url.toLowerCase();

  if (trimmedUrl.includes('youtube.com') || trimmedUrl.includes('youtu.be')) {
    return 'YouTube';
  } else if (trimmedUrl.includes('spotify.com') || trimmedUrl.includes('spotify:')) {
    return 'Spotify';
  } else if (trimmedUrl.includes('soundcloud.com')) {
    return 'SoundCloud';
  } else if (trimmedUrl.includes('bandcamp.com')) {
    return 'Bandcamp';
  }

  return 'Unknown';
};

/**
 * Format file size in bytes to human-readable format
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

/**
 * Calculate time remaining until expiry
 */
export const getTimeRemaining = (expiresAt: string | undefined): string => {
  if (!expiresAt) return '';

  const now = Date.now();
  const expiry = new Date(expiresAt).getTime();
  const diff = expiry - now;

  if (diff <= 0) return 'Expired';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
};

/**
 * Get status badge color
 */
export const getStatusColor = (status: JobStatus): string => {
  switch (status) {
    case 'complete':
      return 'green';
    case 'downloading':
    case 'processing':
      return 'blue';
    case 'error':
      return 'red';
    case 'queued':
      return 'gray';
    default:
      return 'gray';
  }
};

export default {
  submitDownload,
  getJobStatus,
  getDownloadHistory,
  deleteJob,
  subscribeToJob,
  isValidDownloadUrl,
  detectPlatform,
  formatFileSize,
  getTimeRemaining,
  getStatusColor,
};
