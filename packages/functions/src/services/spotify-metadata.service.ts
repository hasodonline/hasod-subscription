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

export interface SpotifyAlbumInfo {
  albumId: string;
  name: string;
  artist: string;
  releaseDate: string;
  totalTracks: number;
  imageUrl: string;
}

export interface SpotifyAlbumTrack {
  trackId: string;
  position: number;
  name: string;
  artists: string;
  album: string;
  isrc: string;
  duration_ms: number;
  imageUrl: string;
  releaseDate: string;
}

export interface SpotifyAlbumMetadata {
  album: SpotifyAlbumInfo;
  tracks: SpotifyAlbumTrack[];
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

  /**
   * Extract album ID from Spotify URL
   */
  private extractAlbumId(url: string): string {
    // Handle URLs like:
    // - https://open.spotify.com/album/4fnlNjkYSlc6nmkNo5v9nC
    // - https://open.spotify.com/album/4fnlNjkYSlc6nmkNo5v9nC?si=xxx
    // - spotify:album:4fnlNjkYSlc6nmkNo5v9nC

    if (url.startsWith('spotify:album:')) {
      return url.replace('spotify:album:', '');
    }

    const match = url.match(/album\/([a-zA-Z0-9]+)/);
    if (!match) {
      throw new Error('Invalid Spotify album URL');
    }

    return match[1];
  }

  /**
   * Get anonymous access token from Spotify embed page
   */
  private async getEmbedAccessToken(type: 'track' | 'album', id: string): Promise<string> {
    console.log(`[Spotify Embed] Getting access token for ${type}: ${id}`);

    const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;

    const response = await axios.get(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    // Extract access token from embed page
    const tokenMatch = response.data.match(/"accessToken":"([^"]+)"/);
    if (!tokenMatch) {
      throw new Error('No access token found in embed page');
    }

    const accessToken = tokenMatch[1];
    console.log(`[Spotify Embed] ✅ Got access token`);

    return accessToken;
  }

  /**
   * Get complete album metadata with all tracks and ISRCs
   */
  async getAlbumMetadata(spotifyUrl: string): Promise<SpotifyAlbumMetadata> {
    console.log(`[Spotify Album] Fetching album metadata for: ${spotifyUrl}`);

    const albumId = this.extractAlbumId(spotifyUrl);
    console.log(`[Spotify Album] Album ID: ${albumId}`);

    // Get embed access token
    const accessToken = await this.getEmbedAccessToken('album', albumId);

    // Get album info
    console.log(`[Spotify Album] Fetching album info...`);
    const albumResponse = await axios.get(
      `https://api.spotify.com/v1/albums/${albumId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    const albumData = albumResponse.data;
    const trackIds = albumData.tracks.items.map((t: any) => t.id);

    console.log(`[Spotify Album] Album: "${albumData.name}" by "${albumData.artists[0].name}"`);
    console.log(`[Spotify Album] Total tracks: ${trackIds.length}`);

    // Get all track details with ISRCs (batch - up to 50 tracks)
    console.log(`[Spotify Album] Fetching ISRCs for all ${trackIds.length} tracks...`);

    const tracksResponse = await axios.get(
      'https://api.spotify.com/v1/tracks',
      {
        params: {
          ids: trackIds.join(','),
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    const albumInfo: SpotifyAlbumInfo = {
      albumId: albumData.id,
      name: albumData.name,
      artist: albumData.artists[0].name,
      releaseDate: albumData.release_date,
      totalTracks: albumData.tracks.total,
      imageUrl: albumData.images[0]?.url || '',
    };

    const tracks: SpotifyAlbumTrack[] = tracksResponse.data.tracks.map((track: any, idx: number) => ({
      trackId: track.id,
      position: idx + 1,
      name: track.name,
      artists: track.artists.map((a: any) => a.name).join(', '),
      album: albumData.name,
      isrc: track.external_ids?.isrc,
      duration_ms: track.duration_ms,
      imageUrl: albumData.images[0]?.url || '',
      releaseDate: albumData.release_date,
    }));

    console.log(`[Spotify Album] ✅ Got ${tracks.length} tracks with ISRCs`);

    return {
      album: albumInfo,
      tracks,
    };
  }
}

// Export singleton instance
export const spotifyMetadataService = new SpotifyMetadataService();
