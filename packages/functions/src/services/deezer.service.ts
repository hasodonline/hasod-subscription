/**
 * Deezer Download Service
 *
 * Converts ISRC codes to download URLs using Deezer's API.
 * Requires a valid Deezer ARL (Authentication Required Login) token.
 */

import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import { getDeezerConfig } from '../utils/config';

export type DeezerQuality = 'MP3_128' | 'MP3_320' | 'FLAC';

// Deezer's master decryption secret
const DEEZER_SECRET = 'g4el58wc0zvf9na1';

interface DeezerSearchResponse {
  id?: number;
  title?: string;
  artist?: {
    name: string;
  };
  error?: {
    type: string;
    message: string;
  };
}

interface DeezerUserDataResponse {
  results: {
    USER: {
      OPTIONS: {
        license_token: string;
      };
    };
    checkForm?: string;
  };
}

interface DeezerTrackDataResponse {
  results: {
    TRACK_TOKEN: string;
  };
}

interface DeezerMediaResponse {
  data: Array<{
    media: Array<{
      sources: Array<{
        url: string;
      }>;
    }>;
  }>;
}

export interface DeezerDownloadResult {
  downloadUrl: string;
  quality: DeezerQuality;
  decryptionKey: string;
}

export class DeezerService {
  private arl: string;
  private session: AxiosInstance;
  private sid: string | null = null;

  constructor() {
    const config = getDeezerConfig();
    this.arl = config.arl;

    // Create axios instance with Deezer ARL cookie
    this.session = axios.create({
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      withCredentials: true,
    });
  }

  /**
   * Get download URL from ISRC code
   *
   * @param isrc - International Standard Recording Code (e.g., "IL1012501118")
   * @param quality - Audio quality (MP3_320, MP3_128, or FLAC)
   * @returns Download URL and metadata
   */
  async getDownloadUrl(isrc: string, quality: DeezerQuality = 'MP3_320'): Promise<DeezerDownloadResult> {
    if (!this.arl) {
      throw new Error('Deezer ARL not configured');
    }

    // Step 1: Search Deezer by ISRC
    const trackId = await this.searchByIsrc(isrc);

    if (!trackId) {
      throw new Error(`Track not found on Deezer for ISRC: ${isrc}`);
    }

    // Step 2: Get user license token
    const { licenseToken, csrfToken } = await this.getUserLicense();

    // Step 3: Get track token
    const trackToken = await this.getTrackToken(trackId, csrfToken);

    // Step 4: Get download URL
    const downloadUrl = await this.getMediaUrl(licenseToken, trackToken, quality);

    // Step 5: Generate Blowfish decryption key
    const decryptionKey = this.getBlowfishKey(trackId);

    return {
      downloadUrl,
      quality,
      decryptionKey,
    };
  }

  /**
   * Search Deezer by ISRC and return track ID
   */
  private async searchByIsrc(isrc: string): Promise<number | null> {
    try {
      const response = await axios.get<DeezerSearchResponse>(
        `https://api.deezer.com/track/isrc:${isrc}`
      );

      if (response.data.error || !response.data.id) {
        console.error('Deezer search error:', response.data.error);
        return null;
      }

      return response.data.id;
    } catch (error) {
      console.error('Failed to search Deezer:', error);
      throw new Error('Failed to search Deezer by ISRC');
    }
  }

  /**
   * Get user license token and CSRF token
   */
  private async getUserLicense(): Promise<{ licenseToken: string; csrfToken: string }> {
    try {
      const response = await this.session.post<DeezerUserDataResponse>(
        'https://www.deezer.com/ajax/gw-light.php',
        {},
        {
          params: {
            api_version: '1.0',
            api_token: 'null',
            input: '3',
            method: 'deezer.getUserData',
          },
          headers: {
            Cookie: `arl=${this.arl}`,
          },
        }
      );

      const licenseToken = response.data.results.USER.OPTIONS.license_token;
      const csrfToken = response.data.results.checkForm || 'null';

      // Extract and store sid cookie from response
      const setCookieHeader = response.headers['set-cookie'];
      if (setCookieHeader) {
        for (const cookie of setCookieHeader) {
          if (cookie.startsWith('sid=')) {
            this.sid = cookie.split(';')[0].split('=')[1];
            console.log('Deezer session ID (sid) obtained');
            break;
          }
        }
      }

      if (!licenseToken) {
        throw new Error('Failed to get license token - ARL may be invalid');
      }

      return { licenseToken, csrfToken };
    } catch (error) {
      console.error('Failed to get user license:', error);
      throw new Error('Failed to authenticate with Deezer - check ARL token');
    }
  }

  /**
   * Get track token for a specific track ID
   */
  private async getTrackToken(trackId: number, csrfToken: string): Promise<string> {
    try {
      // Build cookie string with both arl and sid
      let cookieString = `arl=${this.arl}`;
      if (this.sid) {
        cookieString += `; sid=${this.sid}`;
      }

      const response = await this.session.post<DeezerTrackDataResponse>(
        'https://www.deezer.com/ajax/gw-light.php',
        { sng_id: trackId.toString() },
        {
          params: {
            api_version: '1.0',
            api_token: csrfToken,
            input: '3',
            method: 'song.getData',
          },
          headers: {
            Cookie: cookieString,
          },
        }
      );

      const trackToken = response.data.results.TRACK_TOKEN;

      if (!trackToken) {
        throw new Error('Failed to get track token');
      }

      return trackToken;
    } catch (error) {
      console.error('Failed to get track token:', error);
      throw new Error('Failed to get track information from Deezer');
    }
  }

  /**
   * Get media download URL
   */
  private async getMediaUrl(
    licenseToken: string,
    trackToken: string,
    quality: DeezerQuality
  ): Promise<string> {
    try {
      // Build cookie string with both arl and sid
      let cookieString = `arl=${this.arl}`;
      if (this.sid) {
        cookieString += `; sid=${this.sid}`;
      }

      const response = await this.session.post<DeezerMediaResponse>(
        'https://media.deezer.com/v1/get_url',
        {
          license_token: licenseToken,
          media: [
            {
              type: 'FULL',
              formats: [
                {
                  cipher: 'BF_CBC_STRIPE',
                  format: quality,
                },
              ],
            },
          ],
          track_tokens: [trackToken],
        },
        {
          headers: {
            Cookie: cookieString,
          },
        }
      );

      const downloadUrl = response.data.data[0]?.media[0]?.sources[0]?.url;

      if (!downloadUrl) {
        throw new Error('No download URL returned from Deezer');
      }

      return downloadUrl;
    } catch (error) {
      console.error('Failed to get media URL:', error);
      throw new Error('Failed to get download URL from Deezer');
    }
  }

  /**
   * Generate Blowfish decryption key from Deezer track ID
   *
   * Algorithm (Deezer's BF-CBC):
   * 1. MD5 hash of track_id → 32-character hex string
   * 2. XOR first 16 chars with last 16 chars with secret
   * 3. Result is 16-byte Blowfish key
   *
   * @param trackId - Deezer track ID (e.g., 3406895931)
   * @returns Hex-encoded Blowfish key (32 chars)
   */
  private getBlowfishKey(trackId: number): string {
    // Convert track_id to string and get MD5 hash
    const idMd5 = crypto
      .createHash('md5')
      .update(trackId.toString(), 'ascii')
      .digest('hex');

    // XOR to create 16-byte key
    const blowfishKey: number[] = [];
    for (let i = 0; i < 16; i++) {
      blowfishKey.push(
        idMd5.charCodeAt(i) ^           // First half of MD5
        idMd5.charCodeAt(i + 16) ^      // Second half of MD5
        DEEZER_SECRET.charCodeAt(i)     // Deezer's secret
      );
    }

    // Convert to hex string
    return Buffer.from(blowfishKey).toString('hex');
  }

  /**
   * Validate ISRC format
   */
  static isValidIsrc(isrc: string): boolean {
    // ISRC format: 2 letters (country) + 3 alphanumeric (registrant) + 7 digits
    const isrcRegex = /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/;
    return isrcRegex.test(isrc);
  }
}

// Export singleton instance
export const deezerService = new DeezerService();
