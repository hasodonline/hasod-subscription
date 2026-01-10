/**
 * API Types - Manually maintained to match OpenAPI spec
 * Source: packages/api-spec/openapi.yaml
 *
 * IMPORTANT: When adding new endpoints, update these types to match the OpenAPI schemas
 * Validation: Compare with packages/api-spec/openapi.yaml components/schemas section
 */

use serde::{Deserialize, Serialize};

// ============================================================================
// Metadata API Types
// ============================================================================

/// Request for POST /metadata/spotify
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyMetadataRequest {
    #[serde(rename = "spotifyUrl")]
    pub spotify_url: String,
}

/// Response from POST /metadata/spotify
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyMetadataResponse {
    pub success: bool,
    pub metadata: SpotifyTrackMetadata,
}

/// Complete Spotify track metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyTrackMetadata {
    #[serde(rename = "trackId")]
    pub track_id: String,

    pub name: String,

    pub artist: String,

    pub album: String,

    pub isrc: String,

    pub duration_ms: u32,

    #[serde(rename = "releaseDate")]
    pub release_date: String,

    #[serde(rename = "imageUrl")]
    pub image_url: String,
}

/// Request for POST /metadata/spotify/album
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyAlbumMetadataRequest {
    #[serde(rename = "spotifyUrl")]
    pub spotify_url: String,
}

/// Response from POST /metadata/spotify/album
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyAlbumMetadataResponse {
    pub success: bool,
    pub album: SpotifyAlbumInfo,
    pub tracks: Vec<SpotifyAlbumTrack>,
}

/// Album information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyAlbumInfo {
    #[serde(rename = "albumId")]
    pub album_id: String,

    pub name: String,

    pub artist: String,

    #[serde(rename = "releaseDate")]
    pub release_date: String,

    #[serde(rename = "totalTracks")]
    pub total_tracks: u32,

    #[serde(rename = "imageUrl")]
    pub image_url: String,
}

/// Individual track in album with ISRC
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyAlbumTrack {
    #[serde(rename = "trackId")]
    pub track_id: String,

    pub position: u32,

    pub name: String,

    pub artists: String,

    pub album: String,

    pub isrc: String,

    pub duration_ms: u32,

    #[serde(rename = "imageUrl")]
    pub image_url: String,

    #[serde(rename = "releaseDate")]
    pub release_date: String,
}

/// Request for POST /metadata/spotify/playlist
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyPlaylistMetadataRequest {
    #[serde(rename = "spotifyUrl")]
    pub spotify_url: String,
}

/// Response from POST /metadata/spotify/playlist
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyPlaylistMetadataResponse {
    pub success: bool,
    pub playlist: SpotifyPlaylistInfo,
    pub tracks: Vec<SpotifyPlaylistTrack>,
}

/// Playlist information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyPlaylistInfo {
    #[serde(rename = "playlistId")]
    pub playlist_id: String,

    pub name: String,

    pub owner: String,

    pub description: String,

    #[serde(rename = "totalTracks")]
    pub total_tracks: u32,

    #[serde(rename = "imageUrl")]
    pub image_url: String,
}

/// Individual track in playlist with ISRC
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyPlaylistTrack {
    #[serde(rename = "trackId")]
    pub track_id: String,

    pub position: u32,

    pub name: String,

    pub artists: String,

    pub album: String,

    pub isrc: String,

    pub duration_ms: u32,

    #[serde(rename = "imageUrl")]
    pub image_url: String,

    #[serde(rename = "releaseDate")]
    pub release_date: String,
}

// ============================================================================
// Transliteration API Types
// ============================================================================

/// Media item for transliteration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaItem {
    pub title: String,
    pub artist: String,
    pub album: String,
}

/// Request for POST /transliterate
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransliterateRequest {
    pub items: Vec<MediaItem>,
}

/// Transliterated item with original and transliterated versions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransliteratedItem {
    pub original: MediaItem,
    pub transliterated: MediaItem,
}

/// Response from POST /transliterate
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransliterateResponse {
    pub success: bool,
    pub items: Vec<TransliteratedItem>,
    #[serde(rename = "tokensUsed", skip_serializing_if = "Option::is_none")]
    pub tokens_used: Option<i32>,
}

// ============================================================================
// Download Link Retrieval API Types
// ============================================================================

/// Quality options for Deezer downloads
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DeezerQuality {
    #[serde(rename = "MP3_128")]
    Mp3128,
    #[serde(rename = "MP3_320")]
    Mp3320,
    #[serde(rename = "FLAC")]
    Flac,
}

impl Default for DeezerQuality {
    fn default() -> Self {
        DeezerQuality::Mp3320
    }
}

/// Request for POST /download/deezer/isrc
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeezerIsrcRequest {
    pub isrc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quality: Option<DeezerQuality>,
}

/// Response from POST /download/deezer/isrc
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeezerDownloadUrlResponse {
    pub success: bool,
    #[serde(rename = "downloadUrl")]
    pub download_url: String,
    pub quality: DeezerQuality,
    #[serde(rename = "decryptionKey")]
    pub decryption_key: String,
}

// ============================================================================
// API Client
// ============================================================================

/// API client for calling backend endpoints
pub struct HasodApiClient {
    base_url: String,
    client: reqwest::Client,
}

impl HasodApiClient {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .expect("Failed to create HTTP client"),
        }
    }

    pub fn production() -> Self {
        Self::new("https://us-central1-hasod-41a23.cloudfunctions.net/api")
    }

    /// Get complete Spotify track metadata
    pub async fn get_spotify_metadata(&self, spotify_url: &str) -> Result<SpotifyTrackMetadata, String> {
        let url = format!("{}/metadata/spotify", self.base_url);

        let request = SpotifyMetadataRequest {
            spotify_url: spotify_url.to_string(),
        };

        let response = self.client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("API request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API returned status {}: {}", status, body));
        }

        let api_response: SpotifyMetadataResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse API response: {}", e))?;

        if !api_response.success {
            return Err("API returned success=false".to_string());
        }

        Ok(api_response.metadata)
    }

    /// Get complete album metadata with all tracks and ISRCs
    pub async fn get_spotify_album_metadata(&self, spotify_url: &str) -> Result<SpotifyAlbumMetadataResponse, String> {
        let url = format!("{}/metadata/spotify/album", self.base_url);

        let request = SpotifyAlbumMetadataRequest {
            spotify_url: spotify_url.to_string(),
        };

        let response = self.client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("Album API request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Album API returned status {}: {}", status, body));
        }

        let api_response: SpotifyAlbumMetadataResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse album API response: {}", e))?;

        if !api_response.success {
            return Err("Album API returned success=false".to_string());
        }

        Ok(api_response)
    }

    /// Get complete playlist metadata with all tracks and ISRCs
    pub async fn get_spotify_playlist_metadata(&self, spotify_url: &str) -> Result<SpotifyPlaylistMetadataResponse, String> {
        let url = format!("{}/metadata/spotify/playlist", self.base_url);

        let request = SpotifyPlaylistMetadataRequest {
            spotify_url: spotify_url.to_string(),
        };

        let response = self.client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("Playlist API request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Playlist API returned status {}: {}", status, body));
        }

        let api_response: SpotifyPlaylistMetadataResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse playlist API response: {}", e))?;

        if !api_response.success {
            return Err("Playlist API returned success=false".to_string());
        }

        Ok(api_response)
    }

    /// Get Deezer download URL from ISRC
    /// Requires authentication token for hasod-downloader subscription
    pub async fn get_deezer_download_url(
        &self,
        isrc: &str,
        auth_token: &str,
        quality: Option<DeezerQuality>,
    ) -> Result<DeezerDownloadUrlResponse, String> {
        let url = format!("{}/download/deezer/isrc", self.base_url);

        let request = DeezerIsrcRequest {
            isrc: isrc.to_string(),
            quality,
        };

        let response = self.client
            .post(&url)
            .header("Authorization", format!("Bearer {}", auth_token))
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("Deezer API request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Deezer API returned status {}: {}", status, body));
        }

        let api_response: DeezerDownloadUrlResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Deezer API response: {}", e))?;

        if !api_response.success {
            return Err("Deezer API returned success=false".to_string());
        }

        Ok(api_response)
    }

    /// Transliterate Hebrew media names to English
    /// Requires authentication token for hasod-downloader subscription
    pub async fn transliterate(
        &self,
        items: Vec<MediaItem>,
        auth_token: &str,
    ) -> Result<TransliterateResponse, String> {
        let url = format!("{}/transliterate", self.base_url);

        let request = TransliterateRequest { items };

        let client = reqwest::Client::new();
        let response = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", auth_token))
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("Transliteration API request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Transliteration API failed with status: {}", response.status()));
        }

        let api_response: TransliterateResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse transliteration API response: {}", e))?;

        if !api_response.success {
            return Err("Transliteration API returned success=false".to_string());
        }

        Ok(api_response)
    }
}
