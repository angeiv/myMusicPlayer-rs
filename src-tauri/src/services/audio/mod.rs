//! Audio service for handling audio playback

pub mod analyzer;
pub mod audio_player;
pub mod audio_player_thread;
mod decoder;
pub mod play_queue;
pub mod player;

pub use audio_player_thread::AudioPlayerHandle;
pub use play_queue::PlayMode;

use crate::models::{playback_state::PlaybackState, track::Track};
pub use analyzer::{VisualizationData, VisualizationStats};
use std::time::Duration;

/// Audio service for handling audio playback
/// This wraps the AudioPlayerHandle to provide a simpler interface
pub struct AudioService {
    player: AudioPlayerHandle,
}

impl Default for AudioService {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioService {
    /// Create a new AudioService
    pub fn new() -> Self {
        Self {
            player: AudioPlayerHandle::new().expect("Failed to create audio player"),
        }
    }

    /// Play a track
    pub fn play(&mut self, track: &Track) -> Result<(), String> {
        self.player.play(track).map_err(|e| e.to_string())
    }

    /// Pause playback
    pub fn pause(&mut self) -> Result<(), String> {
        self.player.pause().map_err(|e| e.to_string())
    }

    /// Resume playback
    pub fn resume(&mut self) -> Result<(), String> {
        self.player.resume().map_err(|e| e.to_string())
    }

    /// Stop playback
    pub fn stop(&mut self) -> Result<(), String> {
        self.player.stop().map_err(|e| e.to_string())
    }

    /// Seek to a specific position in the current track
    pub fn seek(&mut self, position: Duration) -> Result<(), String> {
        self.player.seek(position).map_err(|e| e.to_string())
    }

    /// Set the volume (0.0 to 1.0)
    pub fn set_volume(&mut self, volume: f32) -> Result<(), String> {
        self.player.set_volume(volume).map_err(|e| e.to_string())
    }

    /// Get current playback state
    pub fn get_state(&self) -> PlaybackState {
        self.player.state().playback_state
    }

    /// Get the current track
    pub fn current_track(&self) -> Option<Track> {
        self.player.current_track()
    }

    /// Check if audio is currently playing
    pub fn is_playing(&self) -> bool {
        self.player.is_playing()
    }

    /// Get the current volume (0.0 to 1.0)
    pub fn volume(&self) -> f32 {
        self.player.volume()
    }

    /// Play next track
    pub fn next(&mut self) -> Result<(), String> {
        self.player.next().map_err(|e| e.to_string())
    }

    /// Play previous track
    pub fn previous(&mut self) -> Result<(), String> {
        self.player.previous().map_err(|e| e.to_string())
    }

    /// Set play mode
    pub fn set_play_mode(&mut self, mode: PlayMode) {
        let _ = self.player.set_play_mode(mode);
    }

    /// Get play mode
    pub fn play_mode(&self) -> PlayMode {
        self.player.play_mode()
    }

    /// Set the play queue
    pub fn set_queue(&self, tracks: Vec<Track>) -> Result<(), String> {
        self.player.set_queue(tracks).map_err(|e| e.to_string())
    }

    /// Add tracks to the queue
    pub fn add_to_queue(&self, tracks: Vec<Track>) -> Result<(), String> {
        self.player.add_to_queue(tracks).map_err(|e| e.to_string())
    }

    /// Clear the queue
    pub fn clear_queue(&self) -> Result<(), String> {
        self.player.clear_queue().map_err(|e| e.to_string())
    }

    /// Get the queue tracks
    pub fn get_queue(&self) -> Vec<Track> {
        // This would require adding a get_queue method to AudioPlayerHandle
        // For now, return empty vec
        Vec::new()
    }

    /// Get current position
    pub fn position(&self) -> Duration {
        self.player.position()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_service() {
        // This is a simple test that just verifies the service can be created
        let mut service = AudioService::default();
        assert!(!service.is_playing());
        assert_eq!(service.volume(), 1.0);

        // Test volume control
        service.set_volume(0.5).unwrap();
        assert_eq!(service.volume(), 0.5);

        // Test volume clamping
        service.set_volume(1.5).unwrap();
        assert_eq!(service.volume(), 1.0);

        service.set_volume(-0.5).unwrap();
        assert_eq!(service.volume(), 0.0);
    }
}
