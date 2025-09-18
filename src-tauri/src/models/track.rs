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
    /// Track artist identifier (foreign key to artists table)
    pub artist_id: Option<Uuid>,
    /// Track artist display name
    pub artist_name: Option<String>,
    /// Album artist identifier if differs from track artist
    pub album_artist_id: Option<Uuid>,
    /// Album artist display name
    pub album_artist_name: Option<String>,
    /// Album identifier (foreign key to albums table)
    pub album_id: Option<Uuid>,
    /// Album title
    pub album_title: Option<String>,
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
            artist_id: None,
            artist_name: None,
            album_artist_id: None,
            album_artist_name: None,
            album_id: None,
            album_title: None,
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
