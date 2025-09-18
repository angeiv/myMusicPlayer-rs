//! Playlist model

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Represents a playlist
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playlist {
    /// Unique identifier
    pub id: Uuid,
    /// Playlist name
    pub name: String,
    /// Playlist description
    pub description: Option<String>,
    /// Ordered list of track identifiers included in the playlist
    pub track_ids: Vec<Uuid>,
    /// Playlist artwork (path or binary data)
    pub artwork: Option<Vec<u8>>,
    /// Creation timestamp
    pub created_at: DateTime<Utc>,
    /// Last update timestamp
    pub updated_at: DateTime<Utc>,
}

impl Default for Playlist {
    fn default() -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            name: "New Playlist".to_string(),
            description: None,
            track_ids: Vec::new(),
            artwork: None,
            created_at: now,
            updated_at: now,
        }
    }
}

impl Playlist {
    /// Create a new playlist with the given name
    pub fn new(name: &str) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            name: name.to_string(),
            description: None,
            track_ids: Vec::new(),
            artwork: None,
            created_at: now,
            updated_at: now,
        }
    }

    /// Add a track to the playlist
    pub fn add_track(&mut self, track_id: Uuid) {
        self.track_ids.push(track_id);
        self.updated_at = Utc::now();
    }

    /// Remove a track from the playlist by index
    pub fn remove_track(&mut self, index: usize) -> Option<Uuid> {
        if index < self.track_ids.len() {
            self.updated_at = Utc::now();
            Some(self.track_ids.remove(index))
        } else {
            None
        }
    }

    /// Get the number of tracks in the playlist
    pub fn track_count(&self) -> usize {
        self.track_ids.len()
    }

    /// Get the total duration of all tracks in the playlist (in seconds)
    pub fn total_duration(&self) -> u64 {
        // Without access to full track metadata we cannot compute accurately.
        // This placeholder keeps API compatibility until duration aggregation is provided.
        0
    }
}
