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
    YouTubeDownloader, SpotifyDownloader, SoundCloudDownloader, DeezerDownloader,
    AppleMusicDownloader, AppleMusicTrackInfo,
};
use crate::download::queue::{DOWNLOAD_QUEUE};

use crate::platform::FloatingPanelManager;

// ============================================================================
// Job Processor
// ============================================================================

pub struct JobProcessor;

impl JobProcessor {
    /// Process a single download job - delegates to service-specific methods
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

        println!("[Download] Starting {} download for job {}", service.display_name(), job_id);

        // Helper closures for callbacks
        let get_queued_count = || -> usize {
            DOWNLOAD_QUEUE
                .lock()
                .map(|q| q.iter().filter(|j| j.status == DownloadStatus::Queued).count())
                .unwrap_or(0)
        };

        let update_status_fn = |id: &str, status: DownloadStatus, progress: f32, message: &str| {
            // Map status to floating panel states before status is moved
            let panel_state = match status {
                DownloadStatus::Downloading if progress < 10.0 => "fetching",
                DownloadStatus::Downloading => "downloading",
                DownloadStatus::Converting => "converting",
                DownloadStatus::Complete => "complete",
                DownloadStatus::Error => "error",
                _ => "processing",
            };

            // Update job status (this moves status)
            QueueManager::update_job_status(id, status, progress, message);

            // Get current track title from queue
            let title = DOWNLOAD_QUEUE
                .lock()
                .ok()
                .and_then(|q| q.iter().find(|j| j.id == id).map(|j| j.metadata.title.clone()))
                .unwrap_or_else(|| message.to_string());

            // Update floating panel with real-time progress
            FloatingPanelManager::update_status(app, panel_state, progress, &title, get_queued_count());
        };

        let emit_queue_fn = || {
            QueueManager::emit_update(app);
        };

        let update_metadata_fn = |mut metadata: TrackMetadata| {
            // Transliterate if English Only mode is enabled
            let metadata_clone = metadata.clone();
            let job_id_clone = job_id.to_string();
            let app_clone = app.clone();

            tauri::async_runtime::spawn(async move {
                match crate::download::transliteration::transliterate_if_needed(&metadata_clone).await {
                    Ok(transliterated) => {
                        // Update job with transliterated metadata
                        let _ = QueueManager::update_job_metadata(&job_id_clone, |job| {
                            job.metadata = transliterated.clone();
                        });

                        // Update floating panel with transliterated title
                        FloatingPanelManager::update_status(&app_clone, "fetching", 5.0, &transliterated.title, 0);
                    }
                    Err(e) => {
                        println!("[Transliteration] Error: {}", e);
                        // Use original metadata on error
                        let _ = QueueManager::update_job_metadata(&job_id_clone, |job| {
                            job.metadata = metadata_clone.clone();
                        });
                    }
                }
            });

            // Also update immediately with original (will be replaced by transliterated if successful)
            let _ = QueueManager::update_job_metadata(&job_id, |job| {
                job.metadata = metadata.clone();
            });

            // Update floating panel with metadata
            FloatingPanelManager::update_status(app, "fetching", 5.0, &metadata.title, get_queued_count());
        };

        // Update floating panel - works on all platforms now
        FloatingPanelManager::update_status(app, "fetching", 1.0, &initial_title, get_queued_count());

        // Delegate to service-specific download methods
        let result = match service {
            MusicService::Spotify => {
                SpotifyDownloader::download_track(
                    app,
                    &url,
                    &base_output_dir,
                    download_context.as_ref().unwrap_or(&DownloadContext::Single),
                    &job_id,
                    update_status_fn,
                    emit_queue_fn,
                    update_metadata_fn,
                )
                .await
            }
            MusicService::AppleMusic => {
                AppleMusicDownloader::download_track(
                    app,
                    &url,
                    &base_output_dir,
                    download_context.as_ref().unwrap_or(&DownloadContext::Single),
                    &job_id,
                    update_status_fn,
                    emit_queue_fn,
                    update_metadata_fn,
                )
                .await
            }
            MusicService::YouTube => {
                YouTubeDownloader::download_track(
                    app,
                    &url,
                    &base_output_dir,
                    download_context.as_ref().unwrap_or(&DownloadContext::Single),
                    &job_id,
                    update_status_fn,
                    emit_queue_fn,
                    update_metadata_fn,
                )
                .await
            }
            MusicService::SoundCloud => {
                SoundCloudDownloader::download_track(
                    app,
                    &url,
                    &base_output_dir,
                    download_context.as_ref().unwrap_or(&DownloadContext::Single),
                    &job_id,
                    update_status_fn,
                    emit_queue_fn,
                    update_metadata_fn,
                )
                .await
            }
            _ => Err(format!("Unsupported service: {}", service.display_name())),
        };

        // Handle result
        match result {
            Ok(output_path) => {
                // Update job with output path and completion time
                QueueManager::update_job_metadata(&job_id, |job| {
                    job.output_path = Some(output_path.clone());
                    job.completed_at = Some(chrono::Utc::now().timestamp());
                })?;
                QueueManager::emit_update(app);

                // Update floating panel - cross-platform
                FloatingPanelManager::update_status(app, "complete", 100.0, "Done!", get_queued_count());

                Ok(output_path)
            }
            Err(e) => {
                // Update job with error
                QueueManager::update_job_status(&job_id, DownloadStatus::Error, 0.0, &e);
                QueueManager::update_job_metadata(&job_id, |job| {
                    job.error = Some(e.clone());
                })?;
                QueueManager::emit_update(app);

                // Update floating panel - cross-platform
                FloatingPanelManager::update_status(app, "error", 0.0, "Error", get_queued_count());

                Err(e)
            }
        }
    }
}
