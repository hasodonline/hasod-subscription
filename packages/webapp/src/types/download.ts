/**
 * Download Service Type Definitions
 */

import { Timestamp } from 'firebase/firestore';

export type Platform = 'youtube' | 'spotify' | 'soundcloud' | 'bandcamp' | 'unknown';

export type DownloadType = 'single' | 'album' | 'playlist';

export type JobStatus = 'queued' | 'downloading' | 'processing' | 'complete' | 'error';

export interface DownloadMetadata {
  title?: string;
  artist?: string;
  album?: string;
  trackCount?: number;
}

export interface DownloadFile {
  name: string;
  path: string;
  size: number;
}

export interface DownloadJob {
  jobId: string;
  uid: string;
  url: string;
  platform: Platform;
  type: DownloadType;
  status: JobStatus;
  progress: number;
  message: string;
  metadata: DownloadMetadata;
  files: DownloadFile[];
  downloadUrl?: string;
  expiresAt?: Timestamp;
  transliterateEnabled: boolean;
  createdAt: Timestamp;
  completedAt?: Timestamp;
  error?: string;
}

export interface SubmitDownloadRequest {
  uid: string;
  url: string;
  transliterate?: boolean;
}

export interface SubmitDownloadResponse {
  success: boolean;
  jobId: string;
  estimatedTracks?: number;
  message: string;
}

export interface JobStatusResponse {
  job: DownloadJob;
}

export interface DownloadHistoryResponse {
  jobs: DownloadJob[];
}

export interface ParsedURL {
  platform: Platform;
  cleanUrl: string;
  id?: string;
  type?: DownloadType;
}
