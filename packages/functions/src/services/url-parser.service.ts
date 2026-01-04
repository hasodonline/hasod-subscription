/**
 * URL Parser Service
 * Validates and parses URLs from supported music platforms
 */

export enum Platform {
  YOUTUBE = 'youtube',
  SPOTIFY = 'spotify',
  SOUNDCLOUD = 'soundcloud',
  BANDCAMP = 'bandcamp',
  UNKNOWN = 'unknown'
}

export interface ParsedURL {
  platform: Platform;
  cleanUrl: string;
  id?: string;
  type?: 'track' | 'album' | 'playlist' | 'video';
}

export class URLParserService {
  // URL patterns for each platform
  private static readonly PATTERNS: Record<Platform, RegExp[]> = {
    [Platform.YOUTUBE]: [
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([\w-]+)/,
      /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([\w-]+)/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/playlist\?list=([\w-]+)/,
      /(?:https?:\/\/)?music\.youtube\.com\/watch\?v=([\w-]+)/,
    ],
    [Platform.SPOTIFY]: [
      /(?:https?:\/\/)?open\.spotify\.com\/track\/([\w]+)/,
      /(?:https?:\/\/)?open\.spotify\.com\/album\/([\w]+)/,
      /(?:https?:\/\/)?open\.spotify\.com\/playlist\/([\w]+)/,
      /spotify:track:([\w]+)/,
      /spotify:album:([\w]+)/,
      /spotify:playlist:([\w]+)/,
    ],
    [Platform.SOUNDCLOUD]: [
      /(?:https?:\/\/)?(?:www\.)?soundcloud\.com\/([\w-]+)\/([\w-]+)/,
      /(?:https?:\/\/)?(?:www\.)?soundcloud\.com\/([\w-]+)\/sets\/([\w-]+)/,
    ],
    [Platform.BANDCAMP]: [
      /(?:https?:\/\/)?([\w-]+)\.bandcamp\.com\/track\/([\w-]+)/,
      /(?:https?:\/\/)?([\w-]+)\.bandcamp\.com\/album\/([\w-]+)/,
    ],
    [Platform.UNKNOWN]: [],
  };

  /**
   * Parse a URL and determine its platform
   */
  public static parse(url: string): ParsedURL {
    if (!url || typeof url !== 'string') {
      return {
        platform: Platform.UNKNOWN,
        cleanUrl: url || '',
      };
    }

    const trimmedUrl = url.trim();

    // Check each platform's patterns
    for (const [platform, patterns] of Object.entries(this.PATTERNS)) {
      for (const pattern of patterns) {
        const match = trimmedUrl.match(pattern);
        if (match) {
          return {
            platform: platform as Platform,
            cleanUrl: this.cleanUrl(trimmedUrl, platform as Platform),
            id: this.extractId(trimmedUrl, platform as Platform),
            type: this.determineType(trimmedUrl, platform as Platform),
          };
        }
      }
    }

    return {
      platform: Platform.UNKNOWN,
      cleanUrl: trimmedUrl,
    };
  }

  /**
   * Check if a URL is valid and supported
   */
  public static isValid(url: string): boolean {
    const parsed = this.parse(url);
    return parsed.platform !== Platform.UNKNOWN;
  }

  /**
   * Clean URL by removing unwanted parameters
   */
  private static cleanUrl(url: string, platform: Platform): string {
    if (platform === Platform.YOUTUBE) {
      // Remove playlist and radio parameters for single video URLs
      try {
        const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);

        if (urlObj.hostname.includes('youtube.com')) {
          const videoId = urlObj.searchParams.get('v');
          const listId = urlObj.searchParams.get('list');

          // If it's a video with a playlist, keep only the video
          if (videoId && !listId) {
            return `https://www.youtube.com/watch?v=${videoId}`;
          } else if (videoId) {
            return `https://www.youtube.com/watch?v=${videoId}`;
          } else if (listId) {
            return `https://www.youtube.com/playlist?list=${listId}`;
          }
        }
      } catch (error) {
        // If URL parsing fails, return original
        return url;
      }
    }

    return url;
  }

  /**
   * Extract media ID from URL
   */
  private static extractId(url: string, platform: Platform): string | undefined {
    if (platform === Platform.YOUTUBE) {
      // Extract video ID
      const patterns = [
        /[?&]v=([^&]+)/,
        /youtu\.be\/([^?]+)/,
        /music\.youtube\.com\/watch\?v=([^&]+)/,
        /[?&]list=([^&]+)/, // playlist
      ];

      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
          return match[1];
        }
      }
    } else if (platform === Platform.SPOTIFY) {
      // Extract Spotify ID
      const match = url.match(/(?:track|album|playlist)[:/]([\w]+)/);
      if (match) {
        return match[1];
      }
    } else if (platform === Platform.SOUNDCLOUD) {
      // SoundCloud uses full URL as identifier
      return url;
    } else if (platform === Platform.BANDCAMP) {
      // Bandcamp uses full URL as identifier
      return url;
    }

    return undefined;
  }

  /**
   * Determine the type of media (track, album, playlist)
   */
  private static determineType(
    url: string,
    platform: Platform
  ): 'track' | 'album' | 'playlist' | 'video' | undefined {
    if (platform === Platform.YOUTUBE) {
      if (url.includes('playlist')) {
        return 'playlist';
      }
      return 'video';
    } else if (platform === Platform.SPOTIFY) {
      if (url.includes('/track/') || url.includes(':track:')) {
        return 'track';
      } else if (url.includes('/album/') || url.includes(':album:')) {
        return 'album';
      } else if (url.includes('/playlist/') || url.includes(':playlist:')) {
        return 'playlist';
      }
    } else if (platform === Platform.SOUNDCLOUD) {
      if (url.includes('/sets/')) {
        return 'playlist';
      }
      return 'track';
    } else if (platform === Platform.BANDCAMP) {
      if (url.includes('/album/')) {
        return 'album';
      }
      return 'track';
    }

    return undefined;
  }

  /**
   * Get a display name for the platform
   */
  public static getPlatformDisplayName(platform: Platform): string {
    const names: Record<Platform, string> = {
      [Platform.YOUTUBE]: 'YouTube',
      [Platform.SPOTIFY]: 'Spotify',
      [Platform.SOUNDCLOUD]: 'SoundCloud',
      [Platform.BANDCAMP]: 'Bandcamp',
      [Platform.UNKNOWN]: 'Unknown',
    };

    return names[platform] || 'Unknown';
  }

  /**
   * Validate that a URL is safe (no local files, no malicious patterns)
   */
  public static isSafe(url: string): boolean {
    const trimmedUrl = url.trim().toLowerCase();

    // Reject local file URLs
    if (trimmedUrl.startsWith('file://')) {
      return false;
    }

    // Reject localhost or local IPs
    if (
      trimmedUrl.includes('localhost') ||
      trimmedUrl.includes('127.0.0.1') ||
      trimmedUrl.includes('0.0.0.0')
    ) {
      return false;
    }

    // Reject data URLs
    if (trimmedUrl.startsWith('data:')) {
      return false;
    }

    return true;
  }
}
