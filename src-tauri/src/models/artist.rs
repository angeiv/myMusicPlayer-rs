//! Artist model

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Represents a music artist
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artist {
    /// Unique identifier
    pub id: Uuid,
    /// Artist name
    pub name: String,
    /// Artist biography
    pub bio: Option<String>,
    /// Artist artwork (path or binary data)
    pub artwork: Option<Vec<u8>>,
    /// Number of albums
    pub album_count: u32,
    /// Number of tracks
    pub track_count: u32,
    /// Date added to library
    pub date_added: DateTime<Utc>,
}

impl Default for Artist {
    fn default() -> Self {
        Self {
            id: Uuid::new_v4(),
            name: "Unknown Artist".to_string(),
            bio: None,
            artwork: None,
            album_count: 0,
            track_count: 0,
            date_added: Utc::now(),
        }
    }
}

impl Artist {
    /// Create a new artist with the given name
    pub fn new(name: &str) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.to_string(),
            bio: None,
            artwork: None,
            album_count: 0,
            track_count: 0,
            date_added: Utc::now(),
        }
    }
}
