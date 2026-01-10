// SoundCloud Download Service
// Uses yt-dlp for downloading from SoundCloud

use crate::download::{DownloadContext, DownloadStatus, TrackMetadata};
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

pub struct SoundCloudDownloader;

impl SoundCloudDownloader {
    /// Download track from SoundCloud using yt-dlp
    pub async fn download_track(
        app: &AppHandle,
        url: &str,
        base_output_dir: &str,
        download_context: &DownloadContext,
        job_id: &str,
        update_status_fn: impl Fn(&str, DownloadStatus, f32, &str),
        emit_queue_fn: impl Fn(),
        update_metadata_fn: impl Fn(TrackMetadata),
    ) -> Result<String, String> {
        use tauri_plugin_shell::ShellExt;

        println!("[SoundCloud] Starting download for URL: {}", url);

        // Step 1: Get metadata
        update_status_fn(job_id, DownloadStatus::Downloading, 5.0, "Fetching metadata...");
        emit_queue_fn();

        let sidecar = app.shell().sidecar("yt-dlp")
            .map_err(|e| format!("Failed to get yt-dlp sidecar: {}", e))?;

        let (mut rx, _child) = sidecar
            .args(["--dump-json", "--no-download", url])
            .spawn()
            .map_err(|e| format!("Failed to spawn yt-dlp: {}", e))?;

        let mut json_output = String::new();
        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    json_output.push_str(&String::from_utf8_lossy(&line));
                }
                tauri_plugin_shell::process::CommandEvent::Terminated(_) => break,
                _ => {}
            }
        }

        // Parse metadata
        let metadata = Self::parse_soundcloud_metadata(&json_output);
        update_metadata_fn(metadata.clone());
        emit_queue_fn();

        println!(
            "[SoundCloud] Title: '{}', Artist: '{}'",
            metadata.title, metadata.artist
        );

        // Step 2: Calculate output path
        let output_path = crate::utils::filesystem::get_organized_output_path(
            base_output_dir,
            &metadata,
            download_context,
        );
        let output_dir = output_path.parent().unwrap().to_string_lossy().to_string();

        std::fs::create_dir_all(&output_dir)
            .map_err(|e| format!("Failed to create directory: {}", e))?;

        let output_template = format!("{}/%(title)s.%(ext)s", output_dir);

        // Step 3: Download with yt-dlp
        let sidecar = app.shell().sidecar("yt-dlp")
            .map_err(|e| format!("Failed to get yt-dlp sidecar: {}", e))?;

        let args: Vec<&str> = vec![
            url,
            "-f", "bestaudio",
            "--extract-audio",
            "--audio-format", "mp3",
            "--audio-quality", "0",
            "--embed-thumbnail",
            "--add-metadata",
            "--output", &output_template,
            "--progress",
            "--newline",
            "--no-warnings",
        ];

        let (mut rx, _child) = sidecar.args(args).spawn()
            .map_err(|e| format!("Failed to spawn yt-dlp: {}", e))?;

        update_status_fn(job_id, DownloadStatus::Downloading, 10.0, "Downloading...");

        // Step 4: Listen to progress
        let mut last_progress: f32 = 10.0;

        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    let line_str = String::from_utf8_lossy(&line).to_string();
                    println!("[yt-dlp] {}", line_str);

                    // Parse progress from yt-dlp output
                    if let Some(pct) = Self::parse_progress(&line_str) {
                        last_progress = pct * 0.9;
                        update_status_fn(
                            job_id,
                            DownloadStatus::Downloading,
                            last_progress,
                            &format!("Downloading... {:.1}%", pct),
                        );
                        emit_queue_fn();
                    }

                    if line_str.contains("[ExtractAudio]") || line_str.contains("[Merger]") {
                        update_status_fn(job_id, DownloadStatus::Converting, 92.0, "Converting to MP3...");
                        emit_queue_fn();
                    }
                }
                tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                    let line_str = String::from_utf8_lossy(&line).to_string();
                    eprintln!("[yt-dlp stderr] {}", line_str);
                }
                tauri_plugin_shell::process::CommandEvent::Error(error) => {
                    update_status_fn(
                        job_id,
                        DownloadStatus::Error,
                        last_progress,
                        &format!("Error: {}", error),
                    );
                    return Err(format!("yt-dlp error: {}", error));
                }
                tauri_plugin_shell::process::CommandEvent::Terminated(payload) => {
                    if payload.code != Some(0) {
                        let error_msg = format!("yt-dlp exited with code: {:?}", payload.code);
                        update_status_fn(job_id, DownloadStatus::Error, last_progress, &error_msg);
                        return Err(error_msg);
                    }
                    break;
                }
                _ => {}
            }
        }

        update_status_fn(job_id, DownloadStatus::Complete, 100.0, "Download complete!");
        emit_queue_fn();

        Ok(output_path.to_string_lossy().to_string())
    }

    /// Parse yt-dlp progress output
    fn parse_progress(line: &str) -> Option<f32> {
        if line.contains("[download]") && line.contains("%") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            for part in parts {
                if part.ends_with('%') {
                    if let Ok(pct) = part.trim_end_matches('%').parse::<f32>() {
                        return Some(pct);
                    }
                }
            }
        }
        None
    }

    /// Parse SoundCloud metadata from yt-dlp JSON output
    fn parse_soundcloud_metadata(json_str: &str) -> TrackMetadata {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(json_str) {
            TrackMetadata {
                title: json.get("title").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string(),
                artist: json.get("uploader")
                    .or_else(|| json.get("artist"))
                    .or_else(|| json.get("channel"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown Artist")
                    .to_string(),
                album: "SoundCloud".to_string(),
                duration: json.get("duration").and_then(|v| v.as_u64()).map(|d| d as u32),
                thumbnail: json.get("thumbnail").and_then(|v| v.as_str()).map(|s| s.to_string()),
            }
        } else {
            TrackMetadata::default()
        }
    }
}
