"use strict";
/**
 * URL Parser Service
 * Validates and parses URLs from supported music platforms
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.URLParserService = exports.Platform = void 0;
var Platform;
(function (Platform) {
    Platform["YOUTUBE"] = "youtube";
    Platform["SPOTIFY"] = "spotify";
    Platform["SOUNDCLOUD"] = "soundcloud";
    Platform["BANDCAMP"] = "bandcamp";
    Platform["UNKNOWN"] = "unknown";
})(Platform || (exports.Platform = Platform = {}));
class URLParserService {
    /**
     * Parse a URL and determine its platform
     */
    static parse(url) {
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
                        platform: platform,
                        cleanUrl: this.cleanUrl(trimmedUrl, platform),
                        id: this.extractId(trimmedUrl, platform),
                        type: this.determineType(trimmedUrl, platform),
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
    static isValid(url) {
        const parsed = this.parse(url);
        return parsed.platform !== Platform.UNKNOWN;
    }
    /**
     * Clean URL by removing unwanted parameters
     */
    static cleanUrl(url, platform) {
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
                    }
                    else if (videoId) {
                        return `https://www.youtube.com/watch?v=${videoId}`;
                    }
                    else if (listId) {
                        return `https://www.youtube.com/playlist?list=${listId}`;
                    }
                }
            }
            catch (error) {
                // If URL parsing fails, return original
                return url;
            }
        }
        return url;
    }
    /**
     * Extract media ID from URL
     */
    static extractId(url, platform) {
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
        }
        else if (platform === Platform.SPOTIFY) {
            // Extract Spotify ID
            const match = url.match(/(?:track|album|playlist)[:/]([\w]+)/);
            if (match) {
                return match[1];
            }
        }
        else if (platform === Platform.SOUNDCLOUD) {
            // SoundCloud uses full URL as identifier
            return url;
        }
        else if (platform === Platform.BANDCAMP) {
            // Bandcamp uses full URL as identifier
            return url;
        }
        return undefined;
    }
    /**
     * Determine the type of media (track, album, playlist)
     */
    static determineType(url, platform) {
        if (platform === Platform.YOUTUBE) {
            if (url.includes('playlist')) {
                return 'playlist';
            }
            return 'video';
        }
        else if (platform === Platform.SPOTIFY) {
            if (url.includes('/track/') || url.includes(':track:')) {
                return 'track';
            }
            else if (url.includes('/album/') || url.includes(':album:')) {
                return 'album';
            }
            else if (url.includes('/playlist/') || url.includes(':playlist:')) {
                return 'playlist';
            }
        }
        else if (platform === Platform.SOUNDCLOUD) {
            if (url.includes('/sets/')) {
                return 'playlist';
            }
            return 'track';
        }
        else if (platform === Platform.BANDCAMP) {
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
    static getPlatformDisplayName(platform) {
        const names = {
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
    static isSafe(url) {
        const trimmedUrl = url.trim().toLowerCase();
        // Reject local file URLs
        if (trimmedUrl.startsWith('file://')) {
            return false;
        }
        // Reject localhost or local IPs
        if (trimmedUrl.includes('localhost') ||
            trimmedUrl.includes('127.0.0.1') ||
            trimmedUrl.includes('0.0.0.0')) {
            return false;
        }
        // Reject data URLs
        if (trimmedUrl.startsWith('data:')) {
            return false;
        }
        return true;
    }
}
exports.URLParserService = URLParserService;
// URL patterns for each platform
URLParserService.PATTERNS = {
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
