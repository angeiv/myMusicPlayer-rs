//! Real audio player implementation using Rodio

use std::sync::{Arc, Mutex};
use std::path::Path;
use std::fs::File;
use std::io::BufReader;
use rodio::{Decoder, OutputStream, Sink};
use log::info;
use crate::models::{track::Track, playback_state::PlaybackState};

#[derive(Debug, Clone)]
pub enum PlayMode {
    Sequential,
    Random,
    SingleRepeat,
    ListRepeat,
}

/// Real audio player that can actually play audio files
pub struct RealAudioPlayer {
    _stream: OutputStream,
    sink: Arc<Mutex<Sink>>,
    current_track: Arc<Mutex<Option<Track>>>,
    volume: Arc<Mutex<f32>>,
    play_mode: Arc<Mutex<PlayMode>>,
}

impl RealAudioPlayer {
    /// Create a new RealAudioPlayer
    pub fn new() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let (_stream, stream_handle) = OutputStream::try_default()?;
        let sink = Sink::try_new(&stream_handle)?;
        
        Ok(RealAudioPlayer {
            _stream,
            sink: Arc::new(Mutex::new(sink)),
            current_track: Arc::new(Mutex::new(None)),
            volume: Arc::new(Mutex::new(1.0)),
            play_mode: Arc::new(Mutex::new(PlayMode::Sequential)),
        })
    }

    /// Play a track
    pub fn play_track(&self, track: &Track) -> Result<(), String> {
        info!("Attempting to play track: {}", track.title);
        
        // Try to open and decode the audio file
        let file = File::open(&track.path)
            .map_err(|e| format!("Failed to open file: {}", e))?;
        
        let source = Decoder::new(BufReader::new(file))
            .map_err(|e| format!("Failed to decode audio: {}", e))?;
        
        // Stop current playback and start new track
        {
            let sink = self.sink.lock().unwrap();
            sink.stop();
            sink.append(source);
            sink.play();
            
            // Apply current volume
            let volume = *self.volume.lock().unwrap();
            sink.set_volume(volume);
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
            title: path_buf.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Unknown")
                .to_string(),
            duration: 0, // TODO: Extract from metadata
            track_number: None,
            disc_number: None,
            path: path_buf,
            size: 0, // TODO: Get file size
            format: "unknown".to_string(),
            bitrate: 0,
            sample_rate: 44100,
            channels: 2,
            artist: Some("Unknown Artist".to_string()),
            album_artist: None,
            album: Some("Unknown Album".to_string()),
            year: None,
            genre: None,
            artwork: None,
            lyrics: None,
            play_count: 0,
            last_played: None,
            date_added: chrono::Utc::now(),
        };
        
        self.play_track(&track)
    }

    /// Pause playback
    pub fn pause(&self) {
        let sink = self.sink.lock().unwrap();
        sink.pause();
        info!("Playback paused");
    }

    /// Resume playback
    pub fn resume(&self) {
        let sink = self.sink.lock().unwrap();
        sink.play();
        info!("Playback resumed");
    }

    /// Stop playback
    pub fn stop(&self) {
        let sink = self.sink.lock().unwrap();
        sink.stop();
        *self.current_track.lock().unwrap() = None;
        info!("Playback stopped");
    }

    /// Set volume (0.0 to 1.0)
    pub fn set_volume(&self, volume: f32) {
        let clamped_volume = volume.clamp(0.0, 1.0);
        
        {
            let sink = self.sink.lock().unwrap();
            sink.set_volume(clamped_volume);
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
        let sink = self.sink.lock().unwrap();
        !sink.is_paused() && !sink.empty()
    }

    /// Check if paused
    pub fn is_paused(&self) -> bool {
        let sink = self.sink.lock().unwrap();
        sink.is_paused()
    }

    /// Check if stopped/empty
    pub fn is_empty(&self) -> bool {
        let sink = self.sink.lock().unwrap();
        sink.empty()
    }

    /// Get current playback state
    pub fn get_playback_state(&self) -> PlaybackState {
        let sink = self.sink.lock().unwrap();
        
        if sink.empty() {
            PlaybackState::Stopped
        } else if sink.is_paused() {
            PlaybackState::Paused { position: 0, duration: 0 } // TODO: Track actual position
        } else {
            PlaybackState::Playing { position: 0, duration: 0 } // TODO: Track actual position
        }
    }
}

impl Default for RealAudioPlayer {
    fn default() -> Self {
        Self::new().expect("Failed to create audio player")
    }
}
