// Download orchestration module

pub mod models;
pub mod services;
pub mod queue;
pub mod processor;
pub mod transliteration;

// Re-export common types
pub use models::{
    MusicService,
    DownloadStatus,
    TrackMetadata,
    DownloadJob,
    QueueStatus,
    DownloadContext,
    DownloadProgress,
};

// Re-export managers
pub use queue::QueueManager;
pub use processor::JobProcessor;
