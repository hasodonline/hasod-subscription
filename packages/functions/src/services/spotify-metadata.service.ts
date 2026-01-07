/**
 * Spotify Metadata Extraction Service
 * Fetches complete track metadata including ISRC, album, and duration
 * without requiring Spotify API authentication
 *
 * Strategy:
 * 1. Primary: Groover API (simple, complete, has everything)
 * 2. Fallback: ISRC Finder (requires CSRF token handling)
 */

import axios from 'axios';

export interface SpotifyTrackMetadata {
  trackId: string;
  name: string;
  artist: string;
  album: string;
  isrc: string;
  duration_ms: number;
  releaseDate: string;
  imageUrl: string;
}

export class SpotifyMetadataService {
  /**
   * Extract track ID from Spotify URL
   */
  private extractTrackId(url: string): string {
    // Handle URLs like:
    // - https://open.spotify.com/track/5omHkj4qY0A8f6mE4T3fAH
    // - https://open.spotify.com/track/5omHkj4qY0A8f6mE4T3fAH?si=xxx
    // - spotify:track:5omHkj4qY0A8f6mE4T3fAH

    if (url.startsWith('spotify:track:')) {
      return url.replace('spotify:track:', '');
    }

    const match = url.match(/track\/([a-zA-Z0-9]+)/);
    if (!match) {
      throw new Error('Invalid Spotify track URL');
    }

    return match[1];
  }

  /**
   * Get metadata from Groover API (primary method - simple and complete)
   */
  private async getGrooverMetadata(spotifyUrl: string): Promise<SpotifyTrackMetadata> {
    console.log('[Groover] Fetching metadata...');

    const response = await axios.post(
      'https://groover.co/core/distantapi/spotify/getdata/',
      { url: spotifyUrl },
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      }
    );

    const data = response.data;

    const metadata: SpotifyTrackMetadata = {
      trackId: data.id,
      name: data.name,
      artist: data.artists[0]?.name,
      album: data.album?.name,
      isrc: data.external_ids?.isrc,
      duration_ms: data.duration_ms,
      releaseDate: data.album?.release_date,
      imageUrl: data.album?.images?.[0]?.url || '',
    };

    console.log(`[Groover] ✅ Got: "${metadata.name}" by "${metadata.artist}" from "${metadata.album}"`);
    console.log(`[Groover] ISRC: ${metadata.isrc}, Duration: ${metadata.duration_ms}ms`);

    return metadata;
  }

  /**
   * Get metadata from ISRC Finder (fallback - requires CSRF token)
   */
  private async getISRCFinderMetadata(spotifyUrl: string): Promise<SpotifyTrackMetadata> {
    console.log('[ISRC Finder] Getting CSRF token...');

    // Step 1: Get CSRF token from homepage
    const homepageResponse = await axios.get('https://www.isrcfinder.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    const html = homepageResponse.data;

    // Extract CSRF token
    const csrfMatch = html.match(/name="csrfmiddlewaretoken" value="([^"]+)"/);
    if (!csrfMatch) {
      throw new Error('Could not extract CSRF token from ISRC Finder');
    }

    const csrfToken = csrfMatch[1];
    console.log(`[ISRC Finder] Got CSRF token: ${csrfToken.substring(0, 20)}...`);

    // Extract cookies
    const cookies = homepageResponse.headers['set-cookie']?.join('; ') || '';

    // Step 2: Submit form
    console.log('[ISRC Finder] Submitting form...');

    const formData = new URLSearchParams();
    formData.append('csrfmiddlewaretoken', csrfToken);
    formData.append('URI', spotifyUrl);

    const response = await axios.post('https://www.isrcfinder.com/', formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://www.isrcfinder.com/',
        'Origin': 'https://www.isrcfinder.com',
        'Cookie': cookies,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const resultHtml = response.data;

    // Extract JSON from HTML comment (contains Spotify API response)
    const jsonCommentMatch = resultHtml.match(/<!-- ({&#x27;album&#x27;:.+?}) -->/);

    if (!jsonCommentMatch) {
      throw new Error('Could not find track data in ISRC Finder response');
    }

    // Parse Python dict format (&#x27; = quotes, False/True/None)
    const jsonStr = jsonCommentMatch[1]
      .replace(/&#x27;/g, '"')
      .replace(/False/g, 'false')
      .replace(/True/g, 'true')
      .replace(/None/g, 'null');

    const data = JSON.parse(jsonStr);

    const metadata: SpotifyTrackMetadata = {
      trackId: data.id,
      name: data.name,
      artist: data.artists[0]?.name,
      album: data.album?.name,
      isrc: data.external_ids?.isrc,
      duration_ms: data.duration_ms,
      releaseDate: data.album?.release_date,
      imageUrl: data.album?.images?.[0]?.url || '',
    };

    console.log(`[ISRC Finder] ✅ Got: "${metadata.name}" by "${metadata.artist}" from "${metadata.album}"`);
    console.log(`[ISRC Finder] ISRC: ${metadata.isrc}, Duration: ${metadata.duration_ms}ms`);

    return metadata;
  }

  /**
   * Get complete track metadata with fallback strategy
   */
  async getTrackMetadata(spotifyUrl: string): Promise<SpotifyTrackMetadata> {
    console.log(`[Spotify Metadata] Fetching metadata for: ${spotifyUrl}`);

    const trackId = this.extractTrackId(spotifyUrl);
    console.log(`[Spotify Metadata] Track ID: ${trackId}`);

    // Try Groover API first (primary - simple and complete)
    try {
      const metadata = await this.getGrooverMetadata(spotifyUrl);
      return metadata;
    } catch (error) {
      console.log(`[Groover] ❌ Failed: ${error}`);
      console.log('[Spotify Metadata] Falling back to ISRC Finder...');
    }

    // Fallback to ISRC Finder
    try {
      const metadata = await this.getISRCFinderMetadata(spotifyUrl);
      return metadata;
    } catch (error) {
      console.log(`[ISRC Finder] ❌ Failed: ${error}`);
      throw new Error('All metadata sources failed');
    }
  }
}

// Export singleton instance
export const spotifyMetadataService = new SpotifyMetadataService();
