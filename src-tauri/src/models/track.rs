//! Track model

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

/// Represents a music track
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    /// Unique identifier
    pub id: Uuid,
    /// Track title
    pub title: String,
    /// Track duration in seconds
    pub duration: u32,
    /// Track number on the album
    pub track_number: Option<u32>,
    /// Disc number
    pub disc_number: Option<u32>,
    /// Path to the audio file
    pub path: PathBuf,
    /// File size in bytes
    pub size: u64,
    /// File format (mp3, flac, etc.)
    pub format: String,
    /// Bitrate in kbps
    pub bitrate: u32,
    /// Sample rate in Hz
    pub sample_rate: u32,
    /// Number of channels
    pub channels: u16,
    /// Track artist
    pub artist: Option<String>,
    /// Album artist
    pub album_artist: Option<String>,
    /// Album title
    pub album: Option<String>,
    /// Release year
    pub year: Option<i32>,
    /// Genre
    pub genre: Option<String>,
    /// Track artwork (path or binary data)
    pub artwork: Option<Vec<u8>>,
    /// Lyrics
    pub lyrics: Option<String>,
    /// Play count
    pub play_count: u32,
    /// Last played timestamp
    pub last_played: Option<DateTime<Utc>>,
    /// Date added to library
    pub date_added: DateTime<Utc>,
}

impl Default for Track {
    fn default() -> Self {
        Self {
            id: Uuid::new_v4(),
            title: "Unknown Track".to_string(),
            duration: 0,
            track_number: None,
            disc_number: None,
            path: PathBuf::new(),
            size: 0,
            format: String::new(),
            bitrate: 0,
            sample_rate: 44100,
            channels: 2,
            artist: None,
            album_artist: None,
            album: None,
            year: None,
            genre: None,
            artwork: None,
            lyrics: None,
            play_count: 0,
            last_played: None,
            date_added: Utc::now(),
        }
    }
}
