// Download queue models and types

use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ============================================================================
// Music Service Detection
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum MusicService {
    YouTube,
    Spotify,
    SoundCloud,
    Deezer,
    Tidal,
    AppleMusic,
    Bandcamp,
    Unknown,
}

impl MusicService {
    pub fn from_url(url: &str) -> Self {
        let url_lower = url.to_lowercase();
        if url_lower.contains("youtube.com") || url_lower.contains("youtu.be") || url_lower.contains("music.youtube.com") {
            MusicService::YouTube
        } else if url_lower.contains("spotify.com") || url_lower.starts_with("spotify:") {
            MusicService::Spotify
        } else if url_lower.contains("soundcloud.com") {
            MusicService::SoundCloud
        } else if url_lower.contains("deezer.com") {
            MusicService::Deezer
        } else if url_lower.contains("tidal.com") {
            MusicService::Tidal
        } else if url_lower.contains("music.apple.com") {
            MusicService::AppleMusic
        } else if url_lower.contains("bandcamp.com") {
            MusicService::Bandcamp
        } else {
            MusicService::Unknown
        }
    }

    pub fn display_name(&self) -> &str {
        match self {
            MusicService::YouTube => "YouTube",
            MusicService::Spotify => "Spotify",
            MusicService::SoundCloud => "SoundCloud",
            MusicService::Deezer => "Deezer",
            MusicService::Tidal => "Tidal",
            MusicService::AppleMusic => "Apple Music",
            MusicService::Bandcamp => "Bandcamp",
            MusicService::Unknown => "Unknown",
        }
    }

    pub fn icon(&self) -> &str {
        match self {
            MusicService::YouTube => "🎬",
            MusicService::Spotify => "🟢",
            MusicService::SoundCloud => "🟠",
            MusicService::Deezer => "🟣",
            MusicService::Tidal => "🔵",
            MusicService::AppleMusic => "🍎",
            MusicService::Bandcamp => "🎵",
            MusicService::Unknown => "❓",
        }
    }
}

// ============================================================================
// Download Status and Metadata
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DownloadStatus {
    Queued,
    Downloading,
    Converting,
    Complete,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackMetadata {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: Option<u32>,  // seconds
    pub thumbnail: Option<String>,
}

impl Default for TrackMetadata {
    fn default() -> Self {
        TrackMetadata {
            title: "Unknown".to_string(),
            artist: "Unknown Artist".to_string(),
            album: "Unknown Album".to_string(),
            duration: None,
            thumbnail: None,
        }
    }
}

// ============================================================================
// Download Context
// ============================================================================

/// Context for determining file organization
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum DownloadContext {
    Single,              // Single track download
    Album(String),       // Album download with album name
    Playlist(String),    // Playlist download with playlist name
}

// ============================================================================
// Download Job
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadJob {
    pub id: String,
    pub url: String,
    pub service: MusicService,
    pub status: DownloadStatus,
    pub progress: f32,  // 0.0 to 100.0
    pub message: String,
    pub metadata: TrackMetadata,
    pub output_path: Option<String>,
    pub created_at: i64,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub error: Option<String>,
    #[serde(skip)]  // Don't serialize to frontend
    pub download_context: Option<DownloadContext>,
}

impl DownloadJob {
    pub fn new(url: String) -> Self {
        let service = MusicService::from_url(&url);
        // Create initial title from URL for better UX while fetching metadata
        let initial_title = Self::extract_title_from_url(&url, &service);
        DownloadJob {
            id: Uuid::new_v4().to_string(),
            url,
            service,
            status: DownloadStatus::Queued,
            progress: 0.0,
            message: "Waiting in queue...".to_string(),
            metadata: TrackMetadata {
                title: initial_title,
                artist: String::new(), // Empty instead of "Unknown Artist"
                album: String::new(),  // Empty instead of "Unknown Album"
                duration: None,
                thumbnail: None,
            },
            output_path: None,
            created_at: chrono::Utc::now().timestamp(),
            started_at: None,
            completed_at: None,
            error: None,
            download_context: Some(DownloadContext::Single), // Default to single track
        }
    }

    /// Extract a readable title from URL for initial display
    fn extract_title_from_url(url: &str, service: &MusicService) -> String {
        // Try to extract meaningful info from the URL
        match service {
            MusicService::YouTube => {
                // YouTube: try to get video title from URL path
                if let Some(v_param) = url.find("v=") {
                    let video_id = &url[v_param + 2..].split('&').next().unwrap_or("");
                    if !video_id.is_empty() {
                        return format!("YouTube: {}", &video_id[..video_id.len().min(11)]);
                    }
                }
                "YouTube video".to_string()
            }
            MusicService::Spotify => {
                // Spotify: extract track name from URL if possible
                if let Some(track_pos) = url.find("/track/") {
                    let after_track = &url[track_pos + 7..];
                    let track_id = after_track.split('?').next().unwrap_or(after_track);
                    return format!("Spotify: {}", &track_id[..track_id.len().min(22)]);
                }
                "Spotify track".to_string()
            }
            MusicService::AppleMusic => {
                // Apple Music: try to extract song name from URL path
                if let Some(album_pos) = url.find("/album/") {
                    let after_album = &url[album_pos + 7..];
                    // URL format: /album/song-name/id?i=trackid
                    let song_slug = after_album.split('/').next().unwrap_or("");
                    if !song_slug.is_empty() && song_slug != "album" {
                        // Convert URL slug to readable: "song-name" -> "Song Name"
                        let readable: String = song_slug
                            .split('-')
                            .map(|word| {
                                let mut chars = word.chars();
                                match chars.next() {
                                    None => String::new(),
                                    Some(first) => first.to_uppercase().chain(chars).collect(),
                                }
                            })
                            .collect::<Vec<_>>()
                            .join(" ");
                        return format!("🍎 {}", readable);
                    }
                }
                "Apple Music track".to_string()
            }
            MusicService::SoundCloud => "SoundCloud track".to_string(),
            MusicService::Deezer => "Deezer track".to_string(),
            MusicService::Tidal => "Tidal track".to_string(),
            MusicService::Bandcamp => "Bandcamp track".to_string(),
            MusicService::Unknown => {
                // Show truncated URL for unknown services
                let clean_url = url.trim_start_matches("https://").trim_start_matches("http://");
                if clean_url.len() > 40 {
                    format!("{}...", &clean_url[..40])
                } else {
                    clean_url.to_string()
                }
            }
        }
    }
}

// ============================================================================
// Queue Status
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueStatus {
    pub jobs: Vec<DownloadJob>,
    pub active_count: usize,
    pub queued_count: usize,
    pub completed_count: usize,
    pub error_count: usize,
    pub is_processing: bool,
}

// ============================================================================
// Internal Types
// ============================================================================

/// Download progress update (internal use)
#[derive(Debug, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub job_id: String,
    pub status: String, // "downloading", "converting", "complete", "error"
    pub progress: f32,
    pub message: String,
}
