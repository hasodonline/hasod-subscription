/**
 * Spotify Downloader Service
 * Fetches metadata from Spotify API and downloads audio from YouTube
 */

import SpotifyWebApi from 'spotify-web-api-node';
import { getConfig, buildProxyUrl, getRandomProxyPort } from '../utils/config';
import { getYoutubeDownloader, DownloadProgress, DownloadResult } from './youtube.downloader';
import { HttpsProxyAgent } from 'https-proxy-agent';

export interface SpotifyTrackInfo {
  id: string;
  name: string;
  artist: string;
  album: string;
  releaseDate: string;
  duration: number;
  imageUrl?: string;
}

export interface SpotifyAlbumInfo {
  id: string;
  name: string;
  artist: string;
  releaseDate: string;
  trackCount: number;
  tracks: SpotifyTrackInfo[];
}

export class SpotifyDownloader {
  private spotifyApi: SpotifyWebApi;
  private authPromise: Promise<void> | null = null;

  constructor() {
    const config = getConfig();

    // Configure API without proxy initially (we'll set proxy per request)
    const apiConfig: any = {
      clientId: config.spotify?.client_id || '5f573c9620494bae87890c0f08a60293',
      clientSecret: config.spotify?.client_secret || '212476d9b0f3472eaa762d90b19b0ba8',
    };

    this.spotifyApi = new SpotifyWebApi(apiConfig);

    // Start authentication (store promise)
    this.authPromise = this.authenticate();
  }

  /**
   * Set proxy with random port for next request
   */
  private setRandomProxy(): number | null {
    const config = getConfig();
    if (!config.proxy?.enabled) {
      return null;
    }

    const randomPort = getRandomProxyPort();
    const proxyUrl = buildProxyUrl(randomPort);
    const proxyAgent = new HttpsProxyAgent(proxyUrl);

    // Set the proxy agent on the API client
    (this.spotifyApi as any)._credentials.agent = proxyAgent;

    console.log(`[Spotify] Using proxy: ${config.proxy.host}:${randomPort}`);
    return randomPort;
  }

  /**
   * Retry wrapper with exponential backoff that respects Retry-After header
   * Based on Spotify API best practices 2025
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Set random proxy before each attempt
        this.setRandomProxy();

        // Add delay before request (except first attempt) to avoid bursts
        if (attempt > 0) {
          const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential: 1s, 2s, 4s
          console.log(`[Spotify] Waiting ${delay}ms before retry attempt ${attempt}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        return await fn();
      } catch (error: any) {
        lastError = error;

        // Check if it's a rate limit error (429)
        if (error.statusCode === 429) {
          // Respect Retry-After header (Spotify best practice)
          const retryAfter = error.headers?.['retry-after'];
          const retryDelay = retryAfter
            ? parseInt(retryAfter) * 1000
            : baseDelay * Math.pow(2, attempt); // Fallback to exponential

          console.log(
            `[Spotify] Rate limited (429). Retry-After: ${retryAfter || 'not provided'}s. ` +
            `Waiting ${retryDelay}ms before retry (attempt ${attempt + 1}/${maxRetries + 1})`
          );

          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
        }

        // For non-429 errors, throw immediately
        throw error;
      }
    }

    throw lastError;
  }

  /**
   * Authenticate with Spotify API
   */
  private async authenticate(): Promise<void> {
    try {
      const data = await this.spotifyApi.clientCredentialsGrant();
      this.spotifyApi.setAccessToken(data.body.access_token);
      console.log('[Spotify] Authenticated successfully');

      // Refresh token before it expires
      setTimeout(() => {
        this.authPromise = this.authenticate();
      }, (data.body.expires_in - 60) * 1000);
    } catch (error) {
      console.error('[Spotify] Authentication failed:', error);
      throw error;
    }
  }

  /**
   * Ensure authentication is complete before making API calls
   */
  private async ensureAuthenticated(): Promise<void> {
    if (this.authPromise) {
      await this.authPromise;
    }
  }

  /**
   * Extract Spotify track ID from URL
   */
  private extractTrackId(url: string): string | null {
    const match = url.match(/track[:/]([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  }

  /**
   * Extract Spotify album ID from URL
   */
  private extractAlbumId(url: string): string | null {
    const match = url.match(/album[:/]([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  }

  /**
   * Get track information from Spotify with retry logic
   */
  public async getTrackInfo(url: string): Promise<SpotifyTrackInfo | null> {
    try {
      await this.ensureAuthenticated();

      const trackId = this.extractTrackId(url);
      if (!trackId) {
        return null;
      }

      // Use retry wrapper with exponential backoff
      const data = await this.retryWithBackoff(
        () => this.spotifyApi.getTrack(trackId),
        3, // Max 3 retries
        2000 // Start with 2 second delay
      );

      const track = data.body;

      return {
        id: track.id,
        name: track.name,
        artist: track.artists.map((a: any) => a.name).join(', '),
        album: track.album.name,
        releaseDate: track.album.release_date,
        duration: track.duration_ms,
        imageUrl: track.album.images[0]?.url,
      };
    } catch (error) {
      console.error('[Spotify] Failed to get track info after retries:', error);
      return null;
    }
  }

  /**
   * Get album information with all tracks from Spotify with retry logic
   */
  public async getAlbumInfo(url: string): Promise<SpotifyAlbumInfo | null> {
    try {
      await this.ensureAuthenticated();

      const albumId = this.extractAlbumId(url);
      if (!albumId) {
        return null;
      }

      // Use retry wrapper with exponential backoff
      const data = await this.retryWithBackoff(
        () => this.spotifyApi.getAlbum(albumId),
        3,
        2000
      );

      const album = data.body;

      const tracks: SpotifyTrackInfo[] = album.tracks.items.map((track: any) => ({
        id: track.id,
        name: track.name,
        artist: track.artists.map((a: any) => a.name).join(', '),
        album: album.name,
        releaseDate: album.release_date,
        duration: track.duration_ms,
        imageUrl: album.images[0]?.url,
      }));

      return {
        id: album.id,
        name: album.name,
        artist: album.artists.map((a: any) => a.name).join(', '),
        releaseDate: album.release_date,
        trackCount: album.total_tracks,
        tracks,
      };
    } catch (error) {
      console.error('[Spotify] Failed to get album info:', error);
      return null;
    }
  }

  /**
   * Download a Spotify track by searching and downloading from YouTube
   */
  public async downloadTrack(
    url: string,
    outputDir: string,
    transliterate: boolean = false,
    progressCallback?: (progress: DownloadProgress) => void
  ): Promise<DownloadResult> {
    try {
      console.log(`[Spotify] Downloading track: ${url}`);

      // Get track info from Spotify
      if (progressCallback) {
        progressCallback({
          status: 'downloading',
          progress: 0,
          message: 'Fetching track information...',
        });
      }

      const trackInfo = await this.getTrackInfo(url);
      if (!trackInfo) {
        return {
          success: false,
          error: 'Failed to fetch track information from Spotify',
        };
      }

      // Search YouTube for the track
      const searchQuery = `${trackInfo.artist} - ${trackInfo.name} official audio`;
      const youtubeUrl = `ytsearch1:${searchQuery}`;

      console.log(`[Spotify] Searching YouTube: ${searchQuery}`);

      if (progressCallback) {
        progressCallback({
          status: 'downloading',
          progress: 10,
          message: `Downloading: ${trackInfo.artist} - ${trackInfo.name}`,
        });
      }

      // Download from YouTube
      const youtubeDownloader = getYoutubeDownloader();
      const result = await youtubeDownloader.download(
        youtubeUrl,
        outputDir,
        transliterate,
        (progress) => {
          // Forward progress with adjusted percentage (10-100)
          if (progressCallback && progress.progress) {
            progressCallback({
              ...progress,
              progress: 10 + (progress.progress * 0.9),
            });
          }
        }
      );

      return result;
    } catch (error) {
      console.error('[Spotify] Download failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get all track URLs from a Spotify album with retry logic
   */
  public async getAlbumTracks(url: string): Promise<string[]> {
    try {
      await this.ensureAuthenticated();

      const albumId = this.extractAlbumId(url);
      if (!albumId) {
        return [];
      }

      // Use retry wrapper with exponential backoff
      const data = await this.retryWithBackoff(
        () => this.spotifyApi.getAlbum(albumId),
        3,
        2000
      );

      const album = data.body;

      return album.tracks.items.map((track: any) =>
        `https://open.spotify.com/track/${track.id}`
      );
    } catch (error) {
      console.error('[Spotify] Failed to get album tracks:', error);
      return [];
    }
  }

  /**
   * Check if URL is an album
   */
  public isAlbumUrl(url: string): boolean {
    return url.includes('/album/') || url.includes(':album:');
  }

  /**
   * Check if URL is a track
   */
  public isTrackUrl(url: string): boolean {
    return url.includes('/track/') || url.includes(':track:');
  }
}

// Singleton instance
let spotifyDownloader: SpotifyDownloader | null = null;

/**
 * Get the singleton Spotify downloader instance
 */
export function getSpotifyDownloader(): SpotifyDownloader {
  if (!spotifyDownloader) {
    spotifyDownloader = new SpotifyDownloader();
  }
  return spotifyDownloader;
}
