//! Album model

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Represents a music album
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Album {
    /// Unique identifier
    pub id: Uuid,
    /// Album title
    pub title: String,
    /// Album artist identifier
    pub artist_id: Option<Uuid>,
    /// Album artist display name
    pub artist_name: Option<String>,
    /// Release year
    pub year: Option<i32>,
    /// Genre
    pub genre: Option<String>,
    /// Album artwork (path or binary data)
    pub artwork: Option<Vec<u8>>,
    /// Cached artwork path exposed to clients
    pub artwork_path: Option<String>,
    /// Number of tracks
    pub track_count: u32,
    /// Total duration in seconds
    pub duration: u32,
    /// Date added to library
    pub date_added: DateTime<Utc>,
}

impl Default for Album {
    fn default() -> Self {
        Self {
            id: Uuid::new_v4(),
            title: "Unknown Album".to_string(),
            artist_id: None,
            artist_name: Some("Unknown Artist".to_string()),
            year: None,
            genre: None,
            artwork: None,
            artwork_path: None,
            track_count: 0,
            duration: 0,
            date_added: Utc::now(),
        }
    }
}

impl Album {
    /// Create a new album with the given title and artist
    pub fn new(title: &str, artist_id: Option<Uuid>, artist_name: Option<&str>) -> Self {
        Self {
            id: Uuid::new_v4(),
            title: title.to_string(),
            artist_id,
            artist_name: artist_name.map(|name| name.to_string()),
            year: None,
            genre: None,
            artwork: None,
            artwork_path: None,
            track_count: 0,
            duration: 0,
            date_added: Utc::now(),
        }
    }
}
