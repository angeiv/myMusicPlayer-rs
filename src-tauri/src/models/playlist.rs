//! Playlist model

use super::Track;
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
    /// Tracks in the playlist
    pub tracks: Vec<Track>,
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
            tracks: Vec::new(),
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
            tracks: Vec::new(),
            artwork: None,
            created_at: now,
            updated_at: now,
        }
    }

    /// Add a track to the playlist
    pub fn add_track(&mut self, track: Track) {
        self.tracks.push(track);
        self.updated_at = Utc::now();
    }

    /// Remove a track from the playlist by index
    pub fn remove_track(&mut self, index: usize) -> Option<Track> {
        if index < self.tracks.len() {
            self.updated_at = Utc::now();
            Some(self.tracks.remove(index))
        } else {
            None
        }
    }

    /// Get the number of tracks in the playlist
    pub fn track_count(&self) -> usize {
        self.tracks.len()
    }

    /// Get the total duration of all tracks in the playlist (in seconds)
    pub fn total_duration(&self) -> u64 {
        self.tracks.iter().map(|t| t.duration as u64).sum()
    }
}
