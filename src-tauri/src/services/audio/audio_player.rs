//! Enhanced audio player with persistent stream and position tracking
#![allow(dead_code)] // 该实现目前未接入主流程，保留备用

use super::decoder::decode_audio;
use super::play_queue::{PlayMode, PlayQueue};
use crate::models::{playback_state::PlaybackState, track::Track};
use anyhow::{Result, anyhow};
use log::{error, info, warn};
use parking_lot::Mutex;
use rodio::{OutputStream, OutputStreamHandle, Sink};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Audio player with persistent stream and position tracking
pub struct AudioPlayer {
    /// Output stream (must be kept alive)
    _stream: OutputStream,
    /// Stream handle for creating sinks
    stream_handle: OutputStreamHandle,
    /// Current audio sink
    sink: Arc<Mutex<Option<Sink>>>,
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
        let (_stream, stream_handle) = OutputStream::try_default()
            .map_err(|e| anyhow!("Failed to create audio output stream: {}", e))?;

        Ok(Self {
            _stream,
            stream_handle,
            sink: Arc::new(Mutex::new(None)),
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

        // Create a new sink
        let new_sink = Sink::try_new(&self.stream_handle)
            .map_err(|e| anyhow!("Failed to create audio sink: {}", e))?;

        // Set volume
        let volume = *self.volume.lock();
        new_sink.set_volume(volume);

        // Append the decoded audio
        new_sink.append(decoded.buffer);

        // Replace the old sink
        {
            let mut sink = self.sink.lock();
            if let Some(old_sink) = sink.take() {
                old_sink.stop();
            }
            *sink = Some(new_sink);
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

        // Start monitoring for track end
        self.start_track_end_monitor();

        Ok(())
    }

    /// Pause playback
    pub fn pause(&self) -> Result<()> {
        let sink = self.sink.lock();
        if let Some(sink) = sink.as_ref() {
            sink.pause();

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
        let sink = self.sink.lock();
        if let Some(sink) = sink.as_ref() {
            sink.play();

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
        let mut sink = self.sink.lock();
        if let Some(s) = sink.take() {
            s.stop();
        }

        *self.current_track.lock() = None;
        self.position_tracker.lock().stop();
        *self.state.lock() = PlaybackState::Stopped;

        info!("Playback stopped");
        Ok(())
    }

    /// Seek to a specific position
    pub fn seek(&self, position: Duration) -> Result<()> {
        // Note: Rodio's Sink doesn't support seeking directly
        // We need to reload the track and skip to the position
        // For now, we'll just update the position tracker
        // A full implementation would require reloading the audio

        warn!("Seeking is not fully implemented yet. Position tracking updated.");

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

        let sink = self.sink.lock();
        if let Some(sink) = sink.as_ref() {
            sink.set_volume(clamped);
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

    /// Start monitoring for track end
    fn start_track_end_monitor(&self) {
        let sink = Arc::clone(&self.sink);
        let player = AudioPlayerHandle {
            queue: Arc::clone(&self.queue),
            current_track: Arc::clone(&self.current_track),
            state: Arc::clone(&self.state),
            position_tracker: Arc::clone(&self.position_tracker),
            stream_handle: self.stream_handle.clone(),
            volume: Arc::clone(&self.volume),
        };

        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(100));

            loop {
                std::thread::sleep(Duration::from_millis(500));

                let sink_guard = sink.lock();
                let is_empty = sink_guard.as_ref().is_none_or(|s| s.empty());
                drop(sink_guard);

                if is_empty {
                    // Track ended, play next
                    if let Err(e) = player.play_next_on_end() {
                        error!("Failed to play next track: {}", e);
                        break;
                    }
                    break;
                }
            }
        });
    }
}

/// Handle for playing next track from background thread
struct AudioPlayerHandle {
    queue: Arc<Mutex<PlayQueue>>,
    current_track: Arc<Mutex<Option<Track>>>,
    state: Arc<Mutex<PlaybackState>>,
    position_tracker: Arc<Mutex<PositionTracker>>,
    stream_handle: OutputStreamHandle,
    volume: Arc<Mutex<f32>>,
}

impl AudioPlayerHandle {
    fn play_next_on_end(&self) -> Result<()> {
        let mut queue = self.queue.lock();
        if let Some(track) = queue.next() {
            let track = track.clone();
            drop(queue);

            // Decode and play
            let decoded = decode_audio(&track.path)?;
            let new_sink = Sink::try_new(&self.stream_handle)?;

            let volume = *self.volume.lock();
            new_sink.set_volume(volume);
            new_sink.append(decoded.buffer);

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

            info!("Auto-playing next track: {}", track.title);
            Ok(())
        } else {
            // No more tracks, stop
            *self.current_track.lock() = None;
            self.position_tracker.lock().stop();
            *self.state.lock() = PlaybackState::Stopped;
            Ok(())
        }
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
