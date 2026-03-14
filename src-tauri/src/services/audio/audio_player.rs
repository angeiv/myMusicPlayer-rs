//! Enhanced audio player with persistent stream and position tracking
#![allow(dead_code)] // 该实现目前未接入主流程，保留备用

use super::decoder::decode_audio;
use super::play_queue::{PlayMode, PlayQueue};
use crate::models::{playback_state::PlaybackState, track::Track};
use anyhow::{Result, anyhow};
use log::info;
use parking_lot::Mutex;
use rodio::{DeviceSinkBuilder, MixerDeviceSink, Player};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Audio player with persistent stream and position tracking
pub struct AudioPlayer {
    device_sink: Arc<Mutex<Option<MixerDeviceSink>>>,
    player: Arc<Mutex<Option<Player>>>,
    /// Play queue
    queue: Arc<Mutex<PlayQueue>>,
    /// Current track
    current_track: Arc<Mutex<Option<Track>>>,
    /// Volume (0.0 to 1.0)
    volume: Arc<Mutex<f32>>,
    /// Playback state
    state: Arc<Mutex<PlaybackState>>,
    /// Position tracking
    position_tracker: Arc<Mutex<PositionTracker>>,
}

/// Tracks playback position
#[derive(Debug, Clone)]
struct PositionTracker {
    /// When playback started
    start_time: Option<Instant>,
    /// Position when playback was paused
    paused_position: Duration,
    /// Total duration of current track
    duration: Duration,
    /// Whether currently playing
    is_playing: bool,
}

impl PositionTracker {
    fn new() -> Self {
        Self {
            start_time: None,
            paused_position: Duration::ZERO,
            duration: Duration::ZERO,
            is_playing: false,
        }
    }

    fn start(&mut self, duration: Duration) {
        self.start_time = Some(Instant::now());
        self.duration = duration;
        self.is_playing = true;
    }

    fn pause(&mut self) {
        if let Some(start) = self.start_time {
            self.paused_position += start.elapsed();
            self.start_time = None;
        }
        self.is_playing = false;
    }

    fn resume(&mut self) {
        if !self.is_playing {
            self.start_time = Some(Instant::now());
            self.is_playing = true;
        }
    }

    fn stop(&mut self) {
        self.start_time = None;
        self.paused_position = Duration::ZERO;
        self.duration = Duration::ZERO;
        self.is_playing = false;
    }

    fn seek(&mut self, position: Duration) {
        self.paused_position = position;
        if self.is_playing {
            self.start_time = Some(Instant::now());
        }
    }

    fn current_position(&self) -> Duration {
        if let Some(start) = self.start_time {
            let elapsed = self.paused_position + start.elapsed();
            elapsed.min(self.duration)
        } else {
            self.paused_position.min(self.duration)
        }
    }

    fn duration(&self) -> Duration {
        self.duration
    }
}

impl AudioPlayer {
    /// Create a new audio player
    pub fn new() -> Result<Self> {
        Ok(Self {
            device_sink: Arc::new(Mutex::new(None)),
            player: Arc::new(Mutex::new(None)),
            queue: Arc::new(Mutex::new(PlayQueue::new())),
            current_track: Arc::new(Mutex::new(None)),
            volume: Arc::new(Mutex::new(1.0)),
            state: Arc::new(Mutex::new(PlaybackState::Stopped)),
            position_tracker: Arc::new(Mutex::new(PositionTracker::new())),
        })
    }

    /// Play a track
    pub fn play(&self, track: &Track) -> Result<()> {
        info!("Playing track: {} - {}", track.title, track.path.display());

        // Decode the audio file
        let decoded =
            decode_audio(&track.path).map_err(|e| anyhow!("Failed to decode audio file: {}", e))?;

        {
            let mut device_sink_guard = self.device_sink.lock();
            let mut player_guard = self.player.lock();

            if device_sink_guard.is_none() {
                let mut device_sink = DeviceSinkBuilder::open_default_sink()
                    .map_err(|e| anyhow!("Failed to open default audio output device: {e}"))?;
                device_sink.log_on_drop(false);
                *device_sink_guard = Some(device_sink);
            }

            let device_sink = device_sink_guard
                .as_ref()
                .expect("device sink just initialized");
            if player_guard.is_none() {
                *player_guard = Some(Player::connect_new(device_sink.mixer()));
            }

            let player = player_guard.as_ref().expect("player just initialized");
            player.stop();
            player.clear();
            player.set_volume(*self.volume.lock());
            player.append(decoded.buffer);
            player.play();
        }

        // Update state
        *self.current_track.lock() = Some(track.clone());

        let duration_secs = decoded.duration.unwrap_or(track.duration as u64);
        let duration = Duration::from_secs(duration_secs);

        {
            let mut tracker = self.position_tracker.lock();
            tracker.stop();
            tracker.start(duration);
        }

        *self.state.lock() = PlaybackState::Playing {
            position: 0,
            duration: duration_secs,
        };

        info!("Successfully started playing: {}", track.title);

        Ok(())
    }

    /// Pause playback
    pub fn pause(&self) -> Result<()> {
        let player_guard = self.player.lock();
        if let Some(player) = player_guard.as_ref() {
            player.pause();

            let mut tracker = self.position_tracker.lock();
            tracker.pause();

            let position = tracker.current_position().as_secs();
            let duration = tracker.duration().as_secs();

            *self.state.lock() = PlaybackState::Paused { position, duration };

            info!("Playback paused at {}s", position);
            Ok(())
        } else {
            Err(anyhow!("No active playback to pause"))
        }
    }

    /// Resume playback
    pub fn resume(&self) -> Result<()> {
        let player_guard = self.player.lock();
        if let Some(player) = player_guard.as_ref() {
            player.play();

            let mut tracker = self.position_tracker.lock();
            tracker.resume();

            let position = tracker.current_position().as_secs();
            let duration = tracker.duration().as_secs();

            *self.state.lock() = PlaybackState::Playing { position, duration };

            info!("Playback resumed from {}s", position);
            Ok(())
        } else {
            Err(anyhow!("No active playback to resume"))
        }
    }

    /// Stop playback
    pub fn stop(&self) -> Result<()> {
        if let Some(player) = self.player.lock().as_ref() {
            player.stop();
            player.clear();
        }

        *self.current_track.lock() = None;
        self.position_tracker.lock().stop();
        *self.state.lock() = PlaybackState::Stopped;

        info!("Playback stopped");
        Ok(())
    }

    /// Seek to a specific position
    pub fn seek(&self, position: Duration) -> Result<()> {
        let player_guard = self.player.lock();
        let Some(player) = player_guard.as_ref() else {
            return Err(anyhow!("No active playback to seek"));
        };

        player
            .try_seek(position)
            .map_err(|e| anyhow!("Failed to seek playback: {e}"))?;

        let mut tracker = self.position_tracker.lock();
        tracker.seek(position);

        let position_secs = position.as_secs();
        let duration_secs = tracker.duration().as_secs();

        let new_state = if tracker.is_playing {
            PlaybackState::Playing {
                position: position_secs,
                duration: duration_secs,
            }
        } else {
            PlaybackState::Paused {
                position: position_secs,
                duration: duration_secs,
            }
        };

        *self.state.lock() = new_state;

        Ok(())
    }

    /// Set volume (0.0 to 1.0)
    pub fn set_volume(&self, volume: f32) -> Result<()> {
        let clamped = volume.clamp(0.0, 1.0);
        *self.volume.lock() = clamped;

        if let Some(player) = self.player.lock().as_ref() {
            player.set_volume(clamped);
        }

        info!("Volume set to {:.0}%", clamped * 100.0);
        Ok(())
    }

    /// Get current volume
    pub fn volume(&self) -> f32 {
        *self.volume.lock()
    }

    /// Get current playback state
    pub fn state(&self) -> PlaybackState {
        self.state.lock().clone()
    }

    /// Get current track
    pub fn current_track(&self) -> Option<Track> {
        self.current_track.lock().clone()
    }

    /// Check if currently playing
    pub fn is_playing(&self) -> bool {
        self.state.lock().is_playing()
    }

    /// Check if paused
    pub fn is_paused(&self) -> bool {
        self.state.lock().is_paused()
    }

    /// Get current position
    pub fn position(&self) -> Duration {
        self.position_tracker.lock().current_position()
    }

    /// Get play queue
    pub fn queue(&self) -> Arc<Mutex<PlayQueue>> {
        Arc::clone(&self.queue)
    }

    /// Play next track in queue
    pub fn next(&self) -> Result<()> {
        let mut queue = self.queue.lock();
        if let Some(track) = queue.next() {
            let track = track.clone();
            drop(queue); // Release lock before playing
            self.play(&track)?;
            Ok(())
        } else {
            self.stop()?;
            Err(anyhow!("No next track available"))
        }
    }

    /// Play previous track in queue
    pub fn previous(&self) -> Result<()> {
        let mut queue = self.queue.lock();
        if let Some(track) = queue.previous() {
            let track = track.clone();
            drop(queue); // Release lock before playing
            self.play(&track)?;
            Ok(())
        } else {
            Err(anyhow!("No previous track available"))
        }
    }

    /// Set play mode
    pub fn set_play_mode(&self, mode: PlayMode) {
        self.queue.lock().set_mode(mode);
        info!("Play mode set to {:?}", mode);
    }

    /// Get play mode
    pub fn play_mode(&self) -> PlayMode {
        self.queue.lock().mode()
    }
}

impl Default for AudioPlayer {
    fn default() -> Self {
        Self::new().expect("Failed to create audio player")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_position_tracker() {
        let mut tracker = PositionTracker::new();

        tracker.start(Duration::from_secs(100));
        assert!(tracker.is_playing);

        std::thread::sleep(Duration::from_millis(100));
        let pos = tracker.current_position();
        assert!(pos.as_millis() >= 100);

        tracker.pause();
        assert!(!tracker.is_playing);
        let paused_pos = tracker.current_position();

        std::thread::sleep(Duration::from_millis(100));
        let still_paused = tracker.current_position();
        assert_eq!(paused_pos.as_millis(), still_paused.as_millis());
    }

    #[test]
    fn test_audio_player_creation() {
        let player = AudioPlayer::new();
        assert!(player.is_ok());

        let player = player.unwrap();
        assert_eq!(player.volume(), 1.0);
        assert!(!player.is_playing());
    }
}
