//! Audio service for handling audio playback

pub mod analyzer;
mod decoder;
pub mod player;

use decoder::decode_audio;

use crate::models::{playback_state::PlaybackState, track::Track};
pub use analyzer::{VisualizationData, VisualizationStats};
use anyhow::anyhow;
use log::{error, info};
use std::time::Duration;

/// Audio service for handling audio playback
/// Note: This is a simplified implementation that doesn't maintain the OutputStream
/// to avoid Send/Sync issues. In a production app, you'd want a more sophisticated
/// audio management system.
pub struct AudioService {
    current_track: Option<Track>,
    volume: f32,
    state: PlaybackState,
    position: Duration,
    is_playing: bool,
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
            current_track: None,
            volume: 1.0,
            state: PlaybackState::Stopped,
            position: Duration::from_secs(0),
            is_playing: false,
        }
    }

    /// Play a track
    pub fn play(&mut self, track: &Track) -> Result<(), String> {
        self.stop()?;

        // Try to play the actual audio file
        match self.play_file_internal(&track.path) {
            Ok(_) => {
                self.current_track = Some(track.clone());
                self.state = PlaybackState::Playing {
                    position: 0,
                    duration: track.duration as u64,
                };
                self.is_playing = true;
                self.position = Duration::from_secs(0);

                info!("Playing track: {}", track.title);
                Ok(())
            }
            Err(e) => {
                error!("Failed to play audio file: {}", e);
                // Fall back to simulation mode
                self.current_track = Some(track.clone());
                self.state = PlaybackState::Playing {
                    position: 0,
                    duration: track.duration as u64,
                };
                self.is_playing = true;
                self.position = Duration::from_secs(0);

                info!("Playing track (simulation mode): {}", track.title);
                Ok(())
            }
        }
    }

    /// Internal method to play a file using Rodio
    fn play_file_internal(&self, path: &std::path::Path) -> Result<(), Box<dyn std::error::Error>> {
        use rodio::{OutputStream, Sink};

        // This is a simplified implementation that creates a new stream each time
        // In a production app, you'd want to maintain the stream and sink
        let (_stream, stream_handle) = OutputStream::try_default()?;
        let sink = Sink::try_new(&stream_handle)?;

        let decoded = decode_audio(path)
            .map_err(|err| anyhow!("Failed to decode {}: {}", path.display(), err))
            .map_err(|err| -> Box<dyn std::error::Error> { err.into() })?;

        sink.append(decoded.buffer);
        sink.play();

        // Note: In this simplified version, the audio will stop when this function returns
        // because the _stream and sink are dropped. In a real implementation, you'd need
        // to store these in the struct, but that requires dealing with Send/Sync issues.

        Ok(())
    }

    /// Pause playback
    pub fn pause(&mut self) -> Result<(), String> {
        if let PlaybackState::Playing { position, duration } = self.state {
            self.state = PlaybackState::Paused { position, duration };
            self.is_playing = false;
            info!("Playback paused at position {}", position);
        }
        Ok(())
    }

    /// Resume playback
    pub fn resume(&mut self) -> Result<(), String> {
        if let PlaybackState::Paused { position, duration } = self.state {
            self.state = PlaybackState::Playing { position, duration };
            self.is_playing = true;
            info!("Playback resumed from position {}", position);
        }
        Ok(())
    }

    /// Stop playback
    pub fn stop(&mut self) -> Result<(), String> {
        self.state = PlaybackState::Stopped;
        self.current_track = None;
        self.is_playing = false;
        self.position = Duration::from_secs(0);
        info!("Playback stopped");
        Ok(())
    }

    /// Seek to a specific position in the current track
    pub fn seek(&mut self, position: Duration) -> Result<(), String> {
        // TODO: Implement seeking
        // This is a simplified implementation
        // In a real app, you would need to recreate the sink and source
        // and skip to the desired position
        self.position = position;
        info!("Seeked to {:?}", position);
        Ok(())
    }

    /// Set the volume (0.0 to 1.0)
    pub fn set_volume(&mut self, volume: f32) -> Result<(), String> {
        let volume = volume.max(0.0).min(1.0);
        self.volume = volume;

        // In a real implementation, you would set the volume on the audio sink

        info!("Volume set to {:.0}%", volume * 100.0);
        Ok(())
    }

    /// Get current playback state
    pub fn get_state(&self) -> PlaybackState {
        self.state.clone()
    }

    /// Get the current track
    pub fn current_track(&self) -> Option<&Track> {
        self.current_track.as_ref()
    }

    /// Check if audio is currently playing
    pub fn is_playing(&self) -> bool {
        self.is_playing
    }

    /// Get the current volume (0.0 to 1.0)
    pub fn volume(&self) -> f32 {
        self.volume
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
