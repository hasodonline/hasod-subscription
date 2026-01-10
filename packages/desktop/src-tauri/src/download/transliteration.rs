// Transliteration service for Hebrew to English filename conversion

use crate::api_types::{HasodApiClient, MediaItem, TransliterateRequest};
use crate::auth::get_auth_from_keychain;
use crate::download::TrackMetadata;
use crate::utils::needs_transliteration;

/// Transliterate metadata if English Only mode is enabled and text contains Hebrew
pub async fn transliterate_if_needed(metadata: &TrackMetadata) -> Result<TrackMetadata, String> {
    // Check if English Only mode is enabled
    if !crate::utils::get_english_only_mode() {
        println!("[Transliteration] English Only mode disabled, skipping");
        return Ok(metadata.clone());
    }

    // Check if metadata contains Hebrew
    if !needs_transliteration(&metadata.title, &metadata.artist, &metadata.album) {
        println!("[Transliteration] No Hebrew detected, skipping");
        return Ok(metadata.clone());
    }

    println!("[Transliteration] Hebrew detected, transliterating...");
    println!("[Transliteration] Original: {} - {} ({})", metadata.artist, metadata.title, metadata.album);

    // Get auth token
    let auth = get_auth_from_keychain();
    if auth.is_none() {
        println!("[Transliteration] Warning: No auth token, skipping transliteration");
        return Ok(metadata.clone());
    }

    let auth_token = auth.unwrap().id_token;

    // Call transliteration API
    let api_client = HasodApiClient::production();

    let media_item = MediaItem {
        title: metadata.title.clone(),
        artist: metadata.artist.clone(),
        album: metadata.album.clone(),
    };

    match api_client.transliterate(vec![media_item], &auth_token).await {
        Ok(response) => {
            if let Some(item) = response.items.first() {
                let transliterated = &item.transliterated;

                println!("[Transliteration] ✅ Success!");
                println!("[Transliteration] Transliterated: {} - {} ({})",
                    transliterated.artist, transliterated.title, transliterated.album);

                // Return new metadata with transliterated values
                Ok(TrackMetadata {
                    title: transliterated.title.clone(),
                    artist: transliterated.artist.clone(),
                    album: transliterated.album.clone(),
                    duration: metadata.duration,
                    thumbnail: metadata.thumbnail.clone(),
                })
            } else {
                println!("[Transliteration] Warning: API returned no items");
                Ok(metadata.clone())
            }
        }
        Err(e) => {
            println!("[Transliteration] ⚠️ API call failed: {}", e);
            println!("[Transliteration] Continuing with original metadata");
            Ok(metadata.clone())
        }
    }
}
