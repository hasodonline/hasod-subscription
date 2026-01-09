/**
 * Type-safe Tauri API client
 * Uses generated types from OpenAPI spec
 */

import { invoke } from '@tauri-apps/api/core';
import type { components } from '../../../webapp/src/api/schema';

// Re-export types for convenience
export type LicenseStatus = components['schemas']['LicenseStatus'];
export type DownloadJob = components['schemas']['DownloadJob'];
export type QueueStatus = components['schemas']['QueueStatus'];
export type StoredAuth = components['schemas']['StoredAuth'];
export type OAuthStartResult = components['schemas']['OAuthStartResult'];
export type TrackMetadata = components['schemas']['TrackMetadata'];

// ============================================================================
// Auth & License API
// ============================================================================

export const authApi = {
  async checkLicense(userEmail?: string): Promise<LicenseStatus> {
    return invoke<LicenseStatus>('check_license', { userEmail });
  },

  getDeviceUuid(): Promise<string> {
    return invoke<string>('get_device_uuid');
  },

  getRegistrationUrl(): Promise<string> {
    return invoke<string>('get_registration_url');
  },

  async startGoogleLogin(): Promise<OAuthStartResult> {
    return invoke<OAuthStartResult>('start_google_login');
  },

  async waitForOAuthCallback(): Promise<string> {
    return invoke<string>('wait_for_oauth_callback');
  },

  async exchangeOAuthCode(code: string): Promise<StoredAuth> {
    return invoke<StoredAuth>('exchange_oauth_code', { code });
  },

  async getStoredAuth(): Promise<StoredAuth | null> {
    return invoke<StoredAuth | null>('get_stored_auth');
  },

  async refreshAuthToken(): Promise<StoredAuth> {
    return invoke<StoredAuth>('refresh_auth_token');
  },

  async logout(): Promise<void> {
    return invoke('logout');
  },
};

// ============================================================================
// Download Queue API
// ============================================================================

export const queueApi = {
  async addToQueue(url: string): Promise<DownloadJob> {
    return invoke<DownloadJob>('add_to_queue', { url });
  },

  async addMultipleToQueue(urls: string[]): Promise<DownloadJob[]> {
    return invoke<DownloadJob[]>('add_multiple_to_queue', { urls });
  },

  async addSpotifyAlbum(albumUrl: string): Promise<DownloadJob[]> {
    return invoke<DownloadJob[]>('add_spotify_album_to_queue', { albumUrl });
  },

  async addSpotifyPlaylist(playlistUrl: string): Promise<DownloadJob[]> {
    return invoke<DownloadJob[]>('add_spotify_playlist_to_queue', { playlistUrl });
  },

  async addYoutubePlaylist(playlistUrl: string): Promise<DownloadJob[]> {
    return invoke<DownloadJob[]>('add_youtube_playlist_to_queue', { playlistUrl });
  },

  async getQueueStatus(): Promise<QueueStatus> {
    return invoke<QueueStatus>('get_queue_status');
  },

  async clearCompleted(): Promise<number> {
    return invoke<number>('clear_completed_jobs');
  },

  async removeFromQueue(jobId: string): Promise<boolean> {
    return invoke<boolean>('remove_from_queue', { jobId });
  },

  async startProcessing(): Promise<void> {
    return invoke('start_queue_processing');
  },
};

// ============================================================================
// Platform API
// ============================================================================

export const platformApi = {
  async toggleFloatingWindow(): Promise<void> {
    return invoke('toggle_floating_window');
  },

  async isFloatingWindowOpen(): Promise<boolean> {
    return invoke<boolean>('is_floating_window_open');
  },

  async getClipboardUrl(): Promise<string> {
    return invoke<string>('get_clipboard_url');
  },

  getDownloadDir(): Promise<string> {
    return invoke<string>('get_download_dir');
  },

  async createDownloadDir(): Promise<string> {
    return invoke<string>('create_download_dir');
  },
};

// ============================================================================
// Unified API (convenience export)
// ============================================================================

export const api = {
  auth: authApi,
  queue: queueApi,
  platform: platformApi,
};

export default api;
