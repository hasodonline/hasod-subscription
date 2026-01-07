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
}
