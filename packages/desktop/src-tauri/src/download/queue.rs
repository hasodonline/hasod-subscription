// Download queue management

use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

use crate::download::{DownloadJob, QueueStatus, DownloadStatus};

// Global download queue (will be migrated to managed state later)
pub(crate) static DOWNLOAD_QUEUE: std::sync::LazyLock<Arc<Mutex<Vec<DownloadJob>>>> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(Vec::new())));

// Flag to track if queue processor is running
pub(crate) static QUEUE_PROCESSING: std::sync::LazyLock<Arc<Mutex<bool>>> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(false)));

// ============================================================================
// Queue Manager
// ============================================================================

pub struct QueueManager;

impl QueueManager {
    /// Add a job to the queue
    pub fn add_job(job: DownloadJob) -> Result<DownloadJob, String> {
        let mut queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;
        queue.push(job.clone());
        Ok(job)
    }

    /// Add multiple jobs to the queue
    pub fn add_jobs(jobs: Vec<DownloadJob>) -> Result<Vec<DownloadJob>, String> {
        let mut queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;
        for job in &jobs {
            queue.push(job.clone());
        }
        Ok(jobs)
    }

    /// Get current queue status
    pub fn get_status() -> Result<QueueStatus, String> {
        let queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;
        let is_processing = *QUEUE_PROCESSING.lock().map_err(|e| format!("Lock error: {}", e))?;

        let active_count = queue.iter().filter(|j| j.status == DownloadStatus::Downloading || j.status == DownloadStatus::Converting).count();
        let queued_count = queue.iter().filter(|j| j.status == DownloadStatus::Queued).count();
        let completed_count = queue.iter().filter(|j| j.status == DownloadStatus::Complete).count();
        let error_count = queue.iter().filter(|j| j.status == DownloadStatus::Error).count();

        Ok(QueueStatus {
            jobs: queue.clone(),
            active_count,
            queued_count,
            completed_count,
            error_count,
            is_processing,
        })
    }

    /// Update job status in queue
    pub fn update_job_status(job_id: &str, status: DownloadStatus, progress: f32, message: &str) {
        if let Ok(mut queue) = DOWNLOAD_QUEUE.lock() {
            if let Some(job) = queue.iter_mut().find(|j| j.id == job_id) {
                job.status = status;
                job.progress = progress;
                job.message = message.to_string();
            }
        }
    }

    /// Update job metadata
    pub fn update_job_metadata(job_id: &str, update_fn: impl FnOnce(&mut DownloadJob)) -> Result<(), String> {
        let mut queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;
        if let Some(job) = queue.iter_mut().find(|j| j.id == job_id) {
            update_fn(job);
        }
        Ok(())
    }

    /// Get job details (returns cloned data to avoid holding lock)
    pub fn get_job_info(job_id: &str) -> Result<(String, crate::download::MusicService, String, Option<crate::download::DownloadContext>), String> {
        let queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;
        let job = queue.iter().find(|j| j.id == job_id).ok_or("Job not found")?;
        Ok((job.url.clone(), job.service.clone(), job.metadata.title.clone(), job.download_context.clone()))
    }

    /// Clear completed and error jobs from queue
    pub fn clear_completed() -> Result<usize, String> {
        let mut queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;
        let initial_len = queue.len();
        queue.retain(|j| j.status != DownloadStatus::Complete && j.status != DownloadStatus::Error);
        let removed = initial_len - queue.len();
        Ok(removed)
    }

    /// Remove a specific job from queue
    pub fn remove_job(job_id: &str) -> Result<bool, String> {
        let mut queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;
        let initial_len = queue.len();
        queue.retain(|j| j.id != job_id);
        let removed = initial_len > queue.len();
        Ok(removed)
    }

    /// Get count of queued jobs
    pub fn get_queued_count() -> usize {
        DOWNLOAD_QUEUE.lock().map(|q| q.iter().filter(|j| j.status == DownloadStatus::Queued).count()).unwrap_or(0)
    }

    /// Get next queued job ID
    pub fn get_next_queued_job() -> Result<Option<String>, String> {
        let queue = DOWNLOAD_QUEUE.lock().map_err(|e| format!("Lock error: {}", e))?;
        Ok(queue.iter()
            .find(|j| j.status == DownloadStatus::Queued)
            .map(|j| j.id.clone()))
    }

    /// Check if queue is currently processing
    pub fn is_processing() -> Result<bool, String> {
        let processing = QUEUE_PROCESSING.lock().map_err(|e| format!("Lock error: {}", e))?;
        Ok(*processing)
    }

    /// Set processing flag
    pub fn set_processing(value: bool) -> Result<(), String> {
        let mut processing = QUEUE_PROCESSING.lock().map_err(|e| format!("Lock error: {}", e))?;
        *processing = value;
        Ok(())
    }

    /// Emit queue update event to frontend
    pub fn emit_update(app: &AppHandle) {
        app.emit("queue-update", Self::get_status().ok()).ok();
    }
}
