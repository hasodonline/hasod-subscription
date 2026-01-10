// Deezer download and decryption service

use blowfish::Blowfish;
use cipher::{BlockDecryptMut, KeyIvInit};
use cbc::Decryptor;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

use crate::api_types::{HasodApiClient, DeezerQuality};

type BlowfishCbc = Decryptor<Blowfish>;

// ============================================================================
// Deezer Downloader
// ============================================================================

pub struct DeezerDownloader;

impl DeezerDownloader {
    /// Decrypt Deezer encrypted MP3/FLAC file using Blowfish CBC
    /// Deezer uses a custom encryption scheme where only certain chunks are encrypted
    pub fn decrypt_file(encrypted_data: &[u8], decryption_key_hex: &str) -> Result<Vec<u8>, String> {
        // Parse hex key to bytes
        let key_bytes = hex::decode(decryption_key_hex)
            .map_err(|e| format!("Invalid decryption key hex: {}", e))?;

        if key_bytes.len() != 16 {
            return Err(format!("Invalid key length: {} bytes (expected 16)", key_bytes.len()));
        }

        let mut decrypted_data = encrypted_data.to_vec();

        // Deezer encryption scheme: only every third 2048-byte chunk is encrypted
        const CHUNK_SIZE: usize = 2048;
        let chunks_count = encrypted_data.len() / CHUNK_SIZE;

        // IV for Deezer CBC mode (constant: 0, 1, 2, 3, 4, 5, 6, 7)
        let iv: [u8; 8] = [0, 1, 2, 3, 4, 5, 6, 7];

        for chunk_idx in 0..chunks_count {
            // Only decrypt every third chunk (chunks 0, 3, 6, 9, ...)
            if chunk_idx % 3 == 0 {
                let chunk_start = chunk_idx * CHUNK_SIZE;
                let chunk_end = (chunk_start + CHUNK_SIZE).min(decrypted_data.len());
                let chunk_len = chunk_end - chunk_start;

                // Only decrypt if we have a full or nearly-full chunk
                if chunk_len >= 8 {
                    // Initialize CBC decryptor for this chunk
                    let cipher = BlowfishCbc::new_from_slices(&key_bytes, &iv)
                        .map_err(|e| format!("Failed to initialize Blowfish CBC: {}", e))?;

                    // Get mutable slice for this chunk (must be aligned to 8-byte blocks)
                    let blocks_len = (chunk_len / 8) * 8; // Round down to block boundary
                    let chunk_data = &mut decrypted_data[chunk_start..(chunk_start + blocks_len)];

                    // Decrypt the chunk in-place
                    cipher.decrypt_padded_mut::<cipher::block_padding::NoPadding>(chunk_data)
                        .map_err(|e| format!("Decryption failed: {}", e))?;
                }
            }
        }

        Ok(decrypted_data)
    }

    /// Download and decrypt track from Deezer using ISRC
    /// Returns the path to the decrypted MP3 file
    pub async fn download_and_decrypt(
        app: &AppHandle,
        isrc: &str,
        auth_token: &str,
        output_path: &str,
        artwork_url: Option<&str>,
    ) -> Result<String, String> {
        println!("[Deezer] Attempting download for ISRC: {}", isrc);

        // Step 1: Get download URL and decryption key from backend
        let api_client = HasodApiClient::production();

        let deezer_response = api_client
            .get_deezer_download_url(isrc, auth_token, Some(DeezerQuality::Mp3320))
            .await?;

        println!("[Deezer] ✅ Got download URL (quality: {:?})", deezer_response.quality);
        println!("[Deezer] Decryption key: {}", deezer_response.decryption_key);

        // Step 2: Download encrypted file
        println!("[Deezer] Downloading encrypted file...");

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(300)) // 5 minute timeout
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let response = client
            .get(&deezer_response.download_url)
            .send()
            .await
            .map_err(|e| format!("Failed to download from Deezer: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Deezer download failed with status: {}", response.status()));
        }

        let encrypted_bytes = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read download bytes: {}", e))?;

        println!("[Deezer] Downloaded {} bytes", encrypted_bytes.len());

        // Step 3: Decrypt the file
        println!("[Deezer] Decrypting file...");

        let decrypted_bytes = Self::decrypt_file(&encrypted_bytes, &deezer_response.decryption_key)?;

        println!("[Deezer] ✅ Decrypted successfully");

        // Step 4: Write decrypted file
        std::fs::write(output_path, decrypted_bytes)
            .map_err(|e| format!("Failed to write decrypted file: {}", e))?;

        println!("[Deezer] ✅ Saved to: {}", output_path);

        // Step 5: Download and embed artwork if available
        if let Some(artwork_url) = artwork_url {
            println!("[Deezer] Downloading and embedding artwork...");

            // Download artwork
            let artwork_response = client.get(artwork_url).send().await;

            if let Ok(artwork_resp) = artwork_response {
                if artwork_resp.status().is_success() {
                    if let Ok(artwork_bytes) = artwork_resp.bytes().await {
                        // Save artwork temporarily
                        let artwork_path = format!("{}.jpg", output_path.trim_end_matches(".mp3"));
                        if std::fs::write(&artwork_path, &artwork_bytes).is_ok() {
                            // Use ffmpeg to embed artwork
                            let temp_output = format!("{}.temp.mp3", output_path.trim_end_matches(".mp3"));

                            match app.shell().sidecar("ffmpeg") {
                                Ok(sidecar) => {
                                    let result = sidecar.args(&[
                                        "-i", output_path,
                                        "-i", &artwork_path,
                                        "-map", "0:a",
                                        "-map", "1:0",
                                        "-c", "copy",
                                        "-id3v2_version", "3",
                                        "-metadata:s:v", "title=Album cover",
                                        "-metadata:s:v", "comment=Cover (front)",
                                        "-y",
                                        &temp_output,
                                    ]).status().await;

                                    if let Ok(status) = result {
                                        if status.success() {
                                            // Replace original with artwork-embedded version
                                            std::fs::rename(&temp_output, output_path).ok();
                                            println!("[Deezer] ✅ Artwork embedded");
                                        }
                                    }
                                }
                                Err(_) => {
                                    println!("[Deezer] ⚠️ ffmpeg not available, skipping artwork");
                                }
                            }

                            // Clean up temp artwork file
                            std::fs::remove_file(&artwork_path).ok();
                        }
                    }
                }
            }
        }

        Ok(output_path.to_string())
    }

    /// Download and decrypt track from Deezer with progress tracking
    /// This version reports real-time download progress via callbacks
    pub async fn download_and_decrypt_with_progress(
        app: &AppHandle,
        isrc: &str,
        auth_token: &str,
        output_path: &str,
        artwork_url: Option<&str>,
        job_id: &str,
        update_status_fn: &impl Fn(&str, crate::download::DownloadStatus, f32, &str),
        emit_queue_fn: &impl Fn(),
    ) -> Result<String, String> {
        use futures_util::StreamExt;

        println!("[Deezer] Attempting download for ISRC: {} with progress tracking", isrc);

        update_status_fn(job_id, crate::download::DownloadStatus::Downloading, 10.0, "Getting Deezer URL...");
        emit_queue_fn();

        // Step 1: Get download URL and decryption key from backend
        let api_client = HasodApiClient::production();

        let deezer_response = api_client
            .get_deezer_download_url(isrc, auth_token, Some(DeezerQuality::Mp3320))
            .await?;

        println!("[Deezer] ✅ Got download URL (quality: {:?})", deezer_response.quality);

        update_status_fn(job_id, crate::download::DownloadStatus::Downloading, 15.0, "Downloading from Deezer...");
        emit_queue_fn();

        // Step 2: Download encrypted file with progress tracking
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let response = client
            .get(&deezer_response.download_url)
            .send()
            .await
            .map_err(|e| format!("Failed to download from Deezer: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Deezer download failed with status: {}", response.status()));
        }

        // Get total size if available
        let total_size = response.content_length().unwrap_or(0);
        println!("[Deezer] Total size: {} bytes", total_size);

        // Stream the download with progress
        let mut stream = response.bytes_stream();
        let mut encrypted_bytes = Vec::new();
        let mut downloaded: u64 = 0;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
            downloaded += chunk.len() as u64;
            encrypted_bytes.extend_from_slice(&chunk);

            // Update progress (15% to 75%)
            if total_size > 0 {
                let download_progress = ((downloaded as f32 / total_size as f32) * 60.0) + 15.0;
                update_status_fn(
                    job_id,
                    crate::download::DownloadStatus::Downloading,
                    download_progress,
                    &format!("Downloading... {:.1}%", (downloaded as f32 / total_size as f32) * 100.0),
                );
                emit_queue_fn();
            }
        }

        println!("[Deezer] Downloaded {} bytes", encrypted_bytes.len());

        update_status_fn(job_id, crate::download::DownloadStatus::Converting, 80.0, "Decrypting...");
        emit_queue_fn();

        // Step 3: Decrypt the file
        let decrypted_bytes = Self::decrypt_file(&encrypted_bytes, &deezer_response.decryption_key)?;

        println!("[Deezer] ✅ Decrypted successfully");

        update_status_fn(job_id, crate::download::DownloadStatus::Converting, 90.0, "Saving file...");
        emit_queue_fn();

        // Step 4: Write decrypted file
        std::fs::write(output_path, decrypted_bytes)
            .map_err(|e| format!("Failed to write decrypted file: {}", e))?;

        println!("[Deezer] ✅ Saved to: {}", output_path);

        // Step 5: Download and embed artwork if available
        if let Some(artwork_url) = artwork_url {
            println!("[Deezer] Downloading and embedding artwork...");
            update_status_fn(job_id, crate::download::DownloadStatus::Converting, 95.0, "Adding artwork...");
            emit_queue_fn();

            // Download artwork
            let artwork_response = client.get(artwork_url).send().await;

            if let Ok(artwork_resp) = artwork_response {
                if artwork_resp.status().is_success() {
                    if let Ok(artwork_bytes) = artwork_resp.bytes().await {
                        // Save artwork temporarily
                        let artwork_path = format!("{}.jpg", output_path.trim_end_matches(".mp3"));
                        if std::fs::write(&artwork_path, &artwork_bytes).is_ok() {
                            // Use ffmpeg to embed artwork
                            let temp_output = format!("{}.temp.mp3", output_path.trim_end_matches(".mp3"));

                            match app.shell().sidecar("ffmpeg") {
                                Ok(sidecar) => {
                                    let result = sidecar.args(&[
                                        "-i", output_path,
                                        "-i", &artwork_path,
                                        "-map", "0:a",
                                        "-map", "1",
                                        "-c", "copy",
                                        "-id3v2_version", "3",
                                        "-metadata:s:v", "title=Album cover",
                                        "-metadata:s:v", "comment=Cover (front)",
                                        &temp_output,
                                        "-y",
                                    ]).output().await;

                                    if result.is_ok() {
                                        if std::fs::rename(&temp_output, output_path).is_ok() {
                                            println!("[Deezer] ✅ Embedded artwork successfully");
                                        }
                                    }
                                }
                                Err(e) => println!("[Deezer] ⚠️ ffmpeg not available: {}", e),
                            }

                            // Clean up temporary artwork file
                            let _ = std::fs::remove_file(&artwork_path);
                        }
                    }
                }
            }
        }

        Ok(output_path.to_string())
    }
}
