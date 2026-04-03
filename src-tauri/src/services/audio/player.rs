//! Real audio player implementation using Rodio
#![allow(dead_code)]

use super::decoder::decode_audio;
use crate::models::{playback_state::PlaybackState, track::Track};
use log::info;
use rodio::{DeviceSinkBuilder, MixerDeviceSink, Player};
use std::path::Path;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone)]
pub enum PlayMode {
    Sequential,
    Random,
    SingleRepeat,
    ListRepeat,
}

/// Real audio player that can actually play audio files
pub struct RealAudioPlayer {
    #[allow(dead_code)]
    device_sink: MixerDeviceSink,
    player: Player,
    current_track: Arc<Mutex<Option<Track>>>,
    volume: Arc<Mutex<f32>>,
    play_mode: Arc<Mutex<PlayMode>>,
}

impl RealAudioPlayer {
    /// Create a new RealAudioPlayer
    pub fn new() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let mut device_sink = DeviceSinkBuilder::open_default_sink()?;
        device_sink.log_on_drop(false);
        let player = Player::connect_new(device_sink.mixer());

        Ok(RealAudioPlayer {
            device_sink,
            player,
            current_track: Arc::new(Mutex::new(None)),
            volume: Arc::new(Mutex::new(1.0)),
            play_mode: Arc::new(Mutex::new(PlayMode::Sequential)),
        })
    }

    /// Play a track
    pub fn play_track(&self, track: &Track) -> Result<(), String> {
        info!("Attempting to play track: {}", track.title);

        // Try to open and decode the audio file
        let decoded =
            decode_audio(&track.path).map_err(|err| format!("Failed to decode audio: {}", err))?;

        // Stop current playback and start new track
        {
            self.player.stop();
            self.player.clear();
            self.player.append(decoded.buffer);
            self.player.play();

            let volume = *self.volume.lock().unwrap();
            self.player.set_volume(volume);
        }

        // Update current track
        *self.current_track.lock().unwrap() = Some(track.clone());

        info!("Successfully started playing: {}", track.title);
        Ok(())
    }

    /// Play a file by path
    pub fn play_file<P: AsRef<Path>>(&self, path: P) -> Result<(), String> {
        let path_buf = path.as_ref().to_path_buf();

        // Create a temporary track for file playback
        let track = Track {
            id: uuid::Uuid::new_v4(),
            title: path_buf
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Unknown")
                .to_string(),
            duration: 0, // TODO: Extract from metadata
            track_number: None,
            disc_number: None,
            path: path_buf,
            library_root: None,
            size: 0, // TODO: Get file size
            file_mtime_ms: None,
            format: "unknown".to_string(),
            bitrate: 0,
            sample_rate: 44100,
            channels: 2,
            artist_id: None,
            artist_name: Some("Unknown Artist".to_string()),
            album_artist_id: None,
            album_artist_name: None,
            album_id: None,
            album_title: Some("Unknown Album".to_string()),
            year: None,
            genre: None,
            artwork: None,
            artwork_path: None,
            lyrics: None,
            availability: crate::models::TrackAvailability::Available,
            missing_since: None,
            play_count: 0,
            last_played: None,
            date_added: chrono::Utc::now(),
        };

        self.play_track(&track)
    }

    /// Pause playback
    pub fn pause(&self) {
        self.player.pause();
        info!("Playback paused");
    }

    /// Resume playback
    pub fn resume(&self) {
        self.player.play();
        info!("Playback resumed");
    }

    /// Stop playback
    pub fn stop(&self) {
        self.player.stop();
        self.player.clear();
        *self.current_track.lock().unwrap() = None;
        info!("Playback stopped");
    }

    /// Set volume (0.0 to 1.0)
    pub fn set_volume(&self, volume: f32) {
        let clamped_volume = volume.clamp(0.0, 1.0);

        {
            self.player.set_volume(clamped_volume);
        }

        *self.volume.lock().unwrap() = clamped_volume;
        info!("Volume set to {:.0}%", clamped_volume * 100.0);
    }

    /// Get current volume
    pub fn get_volume(&self) -> f32 {
        *self.volume.lock().unwrap()
    }

    /// Set play mode
    pub fn set_play_mode(&self, mode: PlayMode) {
        info!("Play mode set to {:?}", mode);
        *self.play_mode.lock().unwrap() = mode;
    }

    /// Get play mode
    pub fn get_play_mode(&self) -> PlayMode {
        self.play_mode.lock().unwrap().clone()
    }

    /// Get current track
    pub fn get_current_track(&self) -> Option<Track> {
        self.current_track.lock().unwrap().clone()
    }

    /// Check if currently playing
    pub fn is_playing(&self) -> bool {
        !self.player.is_paused() && !self.player.empty()
    }

    /// Check if paused
    pub fn is_paused(&self) -> bool {
        self.player.is_paused()
    }

    /// Check if stopped/empty
    pub fn is_empty(&self) -> bool {
        self.player.empty()
    }

    /// Get current playback state
    pub fn get_playback_state(&self) -> PlaybackState {
        if self.player.empty() {
            PlaybackState::Stopped
        } else if self.player.is_paused() {
            PlaybackState::Paused {
                position: 0,
                duration: 0,
            } // TODO: Track actual position
        } else {
            PlaybackState::Playing {
                position: 0,
                duration: 0,
            } // TODO: Track actual position
        }
    }
}

impl Default for RealAudioPlayer {
    fn default() -> Self {
        Self::new().expect("Failed to create audio player")
    }
}
