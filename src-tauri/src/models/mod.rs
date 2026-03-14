//! Data models for the music player
//! Defines the core data structures used throughout the application

pub mod album;
pub mod artist;
pub mod playback_state;
pub mod playlist;
pub mod track;

// Re-export all models
pub use album::*;
pub use artist::*;
pub use playback_state::*;
pub use playlist::*;
pub use track::*;

// Configuration model
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Application configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    /// Library paths to scan for music
    pub library_paths: Vec<PathBuf>,
    /// Default volume (0.0 to 1.0)
    pub default_volume: f32,
    /// Auto-scan library on startup
    pub auto_scan: bool,
    /// Theme preference
    pub theme: String,

    pub output_device_id: Option<String>,

    pub last_track_id: Option<String>,
    pub last_position_seconds: u64,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            library_paths: Vec::new(),
            default_volume: 0.7,
            auto_scan: true,
            theme: "system".to_string(),
            output_device_id: None,
            last_track_id: None,
            last_position_seconds: 0,
        }
    }
}
