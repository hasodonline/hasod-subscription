// Download job processor - orchestrates the download flow

use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::ShellExt;

use crate::api_types::{HasodApiClient, SpotifyTrackMetadata};
use crate::auth::get_auth_from_keychain;
use crate::download::{
    MusicService, DownloadStatus, TrackMetadata, DownloadContext,
    QueueManager,
};
use crate::download::services::{
    YouTubeDownloader, SpotifyDownloader, DeezerDownloader, 
    AppleMusicDownloader, AppleMusicTrackInfo,
};
use crate::download::queue::{DOWNLOAD_QUEUE};

// ============================================================================
// Job Processor
// ============================================================================

pub struct JobProcessor;

impl JobProcessor {
    /// Process a single download job
    /// This is a placeholder architecture - the actual implementation is still in lib.rs::process_download_job
    /// This module shows the target architecture for job processing
    ///
    /// Future work: Migrate the 482-line process_download_job function here
    pub async fn process_job(
        app: &AppHandle,
        job_id: String,
        base_output_dir: String,
    ) -> Result<String, String> {
        // Get job details
        let (url, service, initial_title, download_context) =
            QueueManager::get_job_info(&job_id)?;

        // Update job to downloading
        QueueManager::update_job_status(&job_id, DownloadStatus::Downloading, 0.0, "Starting download...");
        QueueManager::update_job_metadata(&job_id, |job| {
            job.started_at = Some(chrono::Utc::now().timestamp());
        })?;

        QueueManager::emit_update(app);

        println!("[Download] Starting {} download for job {} (via JobProcessor)", service.display_name(), job_id);

        // NOTE: The actual download logic is still in lib.rs::process_download_job
        // This is the target architecture - the migration is the next step
        Err("JobProcessor not yet fully implemented - using lib.rs::process_download_job".to_string())
    }

    /// Process a Spotify download job
    async fn process_spotify_job(
        app: &AppHandle,
        job_id: &str,
        url: &str,
        base_output_dir: &str,
        download_context: &Option<DownloadContext>,
        update_floating_panel: impl Fn(&str, f32, &str),
    ) -> Result<String, String> {
        // NOTE: The full implementation will delegate to:
        // 1. SpotifyDownloader::get_metadata_from_api()
        // 2. DeezerDownloader::download_and_decrypt() (try first)
        // 3. YouTubeDownloader::find_best_source() (fallback)
        // 4. yt-dlp download
        
        // This is a placeholder - the actual implementation is in lib.rs
        // and will be migrated incrementally
        Err("Not yet implemented in processor".to_string())
    }

    /// Process an Apple Music download job
    async fn process_apple_music_job(
        app: &AppHandle,
        job_id: &str,
        url: &str,
        base_output_dir: &str,
        download_context: &Option<DownloadContext>,
        update_floating_panel: impl Fn(&str, f32, &str),
    ) -> Result<String, String> {
        // NOTE: The full implementation will delegate to:
        // 1. AppleMusicDownloader::get_track_info()
        // 2. YouTubeDownloader::find_best_source()
        // 3. yt-dlp download
        
        Err("Not yet implemented in processor".to_string())
    }

    /// Process a YouTube download job
    async fn process_youtube_job(
        app: &AppHandle,
        job_id: &str,
        url: &str,
        base_output_dir: &str,
        download_context: &Option<DownloadContext>,
        update_floating_panel: impl Fn(&str, f32, &str),
    ) -> Result<String, String> {
        // NOTE: The full implementation will use:
        // 1. yt-dlp for metadata and download
        // 2. YouTubeDownloader::parse_ytdlp_progress()
        // 3. YouTubeDownloader::parse_ytdlp_metadata()
        
        Err("Not yet implemented in processor".to_string())
    }
}
