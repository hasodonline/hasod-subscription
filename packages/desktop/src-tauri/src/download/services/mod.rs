// Download service handlers

pub mod youtube;
pub mod spotify;
pub mod deezer;
pub mod apple_music;

// Re-export service modules
pub use youtube::YouTubeDownloader;
pub use spotify::{SpotifyDownloader, SpotifyTrackInfo};
pub use deezer::DeezerDownloader;
pub use apple_music::{AppleMusicDownloader, AppleMusicTrackInfo};
