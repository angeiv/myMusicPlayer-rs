//! Playback state model

use serde::{Deserialize, Serialize};

/// Represents the current playback state
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum PlaybackState {
    /// No track is currently playing
    #[default]
    Stopped,
    /// A track is currently playing
    Playing {
        /// Current position in the track (in seconds)
        position: u64,
        /// Total duration of the track (in seconds)
        duration: u64,
    },
    /// Playback is paused
    Paused {
        /// Current position in the track (in seconds)
        position: u64,
        /// Total duration of the track (in seconds)
        duration: u64,
    },
    /// An error occurred during playback
    Error(String),
}

impl PlaybackState {
    /// Check if the player is currently playing
    pub fn is_playing(&self) -> bool {
        matches!(self, Self::Playing { .. })
    }

    /// Check if the player is currently paused
    pub fn is_paused(&self) -> bool {
        matches!(self, Self::Paused { .. })
    }

    /// Check if the player is stopped
    pub fn is_stopped(&self) -> bool {
        matches!(self, Self::Stopped)
    }

    /// Check if there was an error
    pub fn is_error(&self) -> bool {
        matches!(self, Self::Error(_))
    }

    /// Get the current position in the track (in seconds)
    pub fn position(&self) -> Option<u64> {
        match self {
            Self::Playing { position, .. } | Self::Paused { position, .. } => Some(*position),
            _ => None,
        }
    }

    /// Get the total duration of the current track (in seconds)
    pub fn duration(&self) -> Option<u64> {
        match self {
            Self::Playing { duration, .. } | Self::Paused { duration, .. } => Some(*duration),
            _ => None,
        }
    }

    /// Get the error message if an error occurred
    pub fn error(&self) -> Option<&str> {
        if let Self::Error(msg) = self {
            Some(msg)
        } else {
            None
        }
    }
}
