//! Thread-safe audio player using message passing

use super::decoder::decode_audio;
use super::play_queue::{PlayMode, PlayQueue};
use crate::models::{playback_state::PlaybackState, track::Track};
use anyhow::{Result, anyhow};
use crossbeam_channel::{Receiver, Sender, bounded};
use log::{error, info};
use parking_lot::Mutex;
use rodio::{OutputStream, OutputStreamHandle, Sink};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

/// Commands that can be sent to the audio player thread
#[derive(Debug)]
enum PlayerCommand {
    Play(Box<Track>),
    Pause,
    Resume,
    Stop,
    Seek {
        position: Duration,
        response_tx: Sender<Result<()>>,
    },
    SetVolume(f32),
    Next,
    Previous,
    SetPlayMode(PlayMode),
    SetQueue(Vec<Track>),
    AddToQueue(Vec<Track>),
    ClearQueue,
}

/// State information from the player
#[derive(Debug, Clone)]
pub struct PlayerState {
    pub current_track: Option<Track>,
    pub playback_state: PlaybackState,
    pub volume: f32,
    pub play_mode: PlayMode,
    pub queue_length: usize,
    pub position: Duration,
}

/// Thread-safe audio player handle
pub struct AudioPlayerHandle {
    command_tx: Sender<PlayerCommand>,
    state: Arc<Mutex<PlayerState>>,
}

impl AudioPlayerHandle {
    /// Create a new audio player (spawns a background thread)
    pub fn new() -> Result<Self> {
        let (command_tx, command_rx) = bounded(100);

        let state = Arc::new(Mutex::new(PlayerState {
            current_track: None,
            playback_state: PlaybackState::Stopped,
            volume: 1.0,
            play_mode: PlayMode::Sequential,
            queue_length: 0,
            position: Duration::ZERO,
        }));

        let state_clone = Arc::clone(&state);

        // Spawn the audio player thread
        thread::spawn(move || {
            if let Err(e) = run_player_thread(command_rx, state_clone) {
                error!("Audio player thread error: {}", e);
            }
        });

        Ok(Self { command_tx, state })
    }

    /// Play a track
    pub fn play(&self, track: &Track) -> Result<()> {
        self.command_tx
            .send(PlayerCommand::Play(Box::new(track.clone())))
            .map_err(|e| anyhow!("Failed to send play command: {}", e))
    }

    /// Pause playback
    pub fn pause(&self) -> Result<()> {
        self.command_tx
            .send(PlayerCommand::Pause)
            .map_err(|e| anyhow!("Failed to send pause command: {}", e))
    }

    /// Resume playback
    pub fn resume(&self) -> Result<()> {
        self.command_tx
            .send(PlayerCommand::Resume)
            .map_err(|e| anyhow!("Failed to send resume command: {}", e))
    }

    /// Stop playback
    pub fn stop(&self) -> Result<()> {
        self.command_tx
            .send(PlayerCommand::Stop)
            .map_err(|e| anyhow!("Failed to send stop command: {}", e))
    }

    /// Seek to a position
    pub fn seek(&self, position: Duration) -> Result<()> {
        let (response_tx, response_rx) = bounded(1);

        self.command_tx
            .send(PlayerCommand::Seek {
                position,
                response_tx,
            })
            .map_err(|e| anyhow!("Failed to send seek command: {}", e))?;

        response_rx
            .recv()
            .map_err(|e| anyhow!("Failed to receive seek result: {}", e))?
    }

    /// Set volume
    pub fn set_volume(&self, volume: f32) -> Result<()> {
        let clamped = volume.clamp(0.0, 1.0);
        self.state.lock().volume = clamped;
        self.command_tx
            .send(PlayerCommand::SetVolume(clamped))
            .map_err(|e| anyhow!("Failed to send set volume command: {}", e))
    }

    /// Play next track
    pub fn next(&self) -> Result<()> {
        self.command_tx
            .send(PlayerCommand::Next)
            .map_err(|e| anyhow!("Failed to send next command: {}", e))
    }

    /// Play previous track
    pub fn previous(&self) -> Result<()> {
        self.command_tx
            .send(PlayerCommand::Previous)
            .map_err(|e| anyhow!("Failed to send previous command: {}", e))
    }

    /// Set play mode
    pub fn set_play_mode(&self, mode: PlayMode) -> Result<()> {
        self.command_tx
            .send(PlayerCommand::SetPlayMode(mode))
            .map_err(|e| anyhow!("Failed to send set play mode command: {}", e))
    }

    /// Set the play queue
    pub fn set_queue(&self, tracks: Vec<Track>) -> Result<()> {
        self.command_tx
            .send(PlayerCommand::SetQueue(tracks))
            .map_err(|e| anyhow!("Failed to send set queue command: {}", e))
    }

    /// Add tracks to queue
    pub fn add_to_queue(&self, tracks: Vec<Track>) -> Result<()> {
        self.command_tx
            .send(PlayerCommand::AddToQueue(tracks))
            .map_err(|e| anyhow!("Failed to send add to queue command: {}", e))
    }

    /// Clear the queue
    pub fn clear_queue(&self) -> Result<()> {
        self.command_tx
            .send(PlayerCommand::ClearQueue)
            .map_err(|e| anyhow!("Failed to send clear queue command: {}", e))
    }

    /// Get current state
    pub fn state(&self) -> PlayerState {
        self.state.lock().clone()
    }

    /// Get current track
    pub fn current_track(&self) -> Option<Track> {
        self.state.lock().current_track.clone()
    }

    /// Check if playing
    pub fn is_playing(&self) -> bool {
        self.state.lock().playback_state.is_playing()
    }

    /// Get volume
    pub fn volume(&self) -> f32 {
        self.state.lock().volume
    }

    /// Get play mode
    pub fn play_mode(&self) -> PlayMode {
        self.state.lock().play_mode
    }

    /// Get position
    pub fn position(&self) -> Duration {
        self.state.lock().position
    }
}

/// Run the audio player in a dedicated thread
fn run_player_thread(
    command_rx: Receiver<PlayerCommand>,
    state: Arc<Mutex<PlayerState>>,
) -> Result<()> {
    // Create audio output stream (must stay in this thread)
    let (_stream, stream_handle) = OutputStream::try_default()
        .map_err(|e| anyhow!("Failed to create audio output stream: {}", e))?;

    let mut sink: Option<Sink> = None;
    let mut queue = PlayQueue::new();
    let mut volume = 1.0f32;
    let mut position_tracker = PositionTracker::new();

    info!("Audio player thread started");

    loop {
        // Check if current track ended
        if let Some(ref s) = sink
            && s.empty()
            && position_tracker.is_playing
        {
            info!("Track ended, playing next");
            if let Some(track) = queue.next() {
                let track = track.clone();
                if let Err(e) = play_track_internal(
                    &track,
                    &stream_handle,
                    &mut sink,
                    volume,
                    &mut position_tracker,
                    &state,
                    &mut queue,
                ) {
                    error!("Failed to auto-play next track: {}", e);
                }
            } else {
                // No more tracks
                sink = None;
                position_tracker.stop();
                update_state(
                    &state,
                    None,
                    PlaybackState::Stopped,
                    volume,
                    &queue,
                    &position_tracker,
                );
            }
        }

        // Update position periodically
        if position_tracker.is_playing {
            let pos = position_tracker.current_position();
            let dur = position_tracker.duration();
            state.lock().position = pos;
            state.lock().playback_state = PlaybackState::Playing {
                position: pos.as_secs(),
                duration: dur.as_secs(),
            };
        }

        // Process commands (with timeout to allow position updates)
        match command_rx.recv_timeout(Duration::from_millis(100)) {
            Ok(cmd) => match cmd {
                PlayerCommand::Play(track) => {
                    if let Err(e) = play_track_internal(
                        track.as_ref(),
                        &stream_handle,
                        &mut sink,
                        volume,
                        &mut position_tracker,
                        &state,
                        &mut queue,
                    ) {
                        error!("Failed to play track: {}", e);
                        update_state(
                            &state,
                            None,
                            PlaybackState::Error(e.to_string()),
                            volume,
                            &queue,
                            &position_tracker,
                        );
                    }
                }
                PlayerCommand::Pause => {
                    if let Some(ref s) = sink {
                        s.pause();
                        position_tracker.pause();
                        let pos = position_tracker.current_position().as_secs();
                        let dur = position_tracker.duration().as_secs();
                        let current = state.lock().current_track.clone();
                        update_state(
                            &state,
                            current,
                            PlaybackState::Paused {
                                position: pos,
                                duration: dur,
                            },
                            volume,
                            &queue,
                            &position_tracker,
                        );
                        info!("Playback paused");
                    }
                }
                PlayerCommand::Resume => {
                    if let Some(ref s) = sink {
                        s.play();
                        position_tracker.resume();
                        let pos = position_tracker.current_position().as_secs();
                        let dur = position_tracker.duration().as_secs();
                        let current = state.lock().current_track.clone();
                        update_state(
                            &state,
                            current,
                            PlaybackState::Playing {
                                position: pos,
                                duration: dur,
                            },
                            volume,
                            &queue,
                            &position_tracker,
                        );
                        info!("Playback resumed");
                    }
                }
                PlayerCommand::Stop => {
                    if let Some(s) = sink.take() {
                        s.stop();
                    }
                    position_tracker.stop();
                    update_state(
                        &state,
                        None,
                        PlaybackState::Stopped,
                        volume,
                        &queue,
                        &position_tracker,
                    );
                    info!("Playback stopped");
                }
                PlayerCommand::Seek {
                    position,
                    response_tx,
                } => {
                    let seek_result = handle_seek(
                        &mut sink,
                        position,
                        &mut position_tracker,
                        &state,
                        &queue,
                        volume,
                    );

                    if let Err(ref error) = seek_result {
                        error!("Failed to seek to {}s: {}", position.as_secs(), error);
                    }

                    let _ = response_tx.send(seek_result);
                }
                PlayerCommand::SetVolume(vol) => {
                    volume = vol.clamp(0.0, 1.0);
                    if let Some(ref s) = sink {
                        s.set_volume(volume);
                    }
                    state.lock().volume = volume;
                    info!("Volume set to {:.0}%", volume * 100.0);
                }
                PlayerCommand::Next => {
                    if let Some(track) = queue.next() {
                        let track = track.clone();
                        if let Err(e) = play_track_internal(
                            &track,
                            &stream_handle,
                            &mut sink,
                            volume,
                            &mut position_tracker,
                            &state,
                            &mut queue,
                        ) {
                            error!("Failed to play next track: {}", e);
                        }
                    }
                }
                PlayerCommand::Previous => {
                    if let Some(track) = queue.previous() {
                        let track = track.clone();
                        if let Err(e) = play_track_internal(
                            &track,
                            &stream_handle,
                            &mut sink,
                            volume,
                            &mut position_tracker,
                            &state,
                            &mut queue,
                        ) {
                            error!("Failed to play previous track: {}", e);
                        }
                    }
                }
                PlayerCommand::SetPlayMode(mode) => {
                    queue.set_mode(mode);
                    state.lock().play_mode = mode;
                    info!("Play mode set to {:?}", mode);
                }
                PlayerCommand::SetQueue(tracks) => {
                    queue.set_tracks(tracks);
                    state.lock().queue_length = queue.len();
                    info!("Queue set with {} tracks", queue.len());
                }
                PlayerCommand::AddToQueue(tracks) => {
                    queue.add_tracks(tracks);
                    state.lock().queue_length = queue.len();
                    info!("Added tracks to queue, new size: {}", queue.len());
                }
                PlayerCommand::ClearQueue => {
                    queue.clear();
                    state.lock().queue_length = 0;
                    info!("Queue cleared");
                }
            },
            Err(crossbeam_channel::RecvTimeoutError::Timeout) => {
                // Normal timeout, continue loop
            }
            Err(crossbeam_channel::RecvTimeoutError::Disconnected) => {
                info!("Audio player thread shutting down");
                break;
            }
        }
    }

    Ok(())
}

fn play_track_internal(
    track: &Track,
    stream_handle: &OutputStreamHandle,
    sink: &mut Option<Sink>,
    volume: f32,
    position_tracker: &mut PositionTracker,
    state: &Arc<Mutex<PlayerState>>,
    queue: &mut PlayQueue,
) -> Result<()> {
    info!("Playing track: {} - {}", track.title, track.path.display());

    // Decode the audio
    let decoded = decode_audio(&track.path)?;

    // Create new sink
    let new_sink = Sink::try_new(stream_handle)?;
    new_sink.set_volume(volume);
    new_sink.append(decoded.buffer);

    // Replace old sink
    if let Some(old_sink) = sink.take() {
        old_sink.stop();
    }
    *sink = Some(new_sink);

    // Update position tracker
    let duration_secs = decoded.duration.unwrap_or(track.duration as u64);
    let duration = Duration::from_secs(duration_secs);
    position_tracker.stop();
    position_tracker.start(duration);

    // Update state
    update_state(
        state,
        Some(track.clone()),
        PlaybackState::Playing {
            position: 0,
            duration: duration_secs,
        },
        volume,
        queue,
        position_tracker,
    );

    info!("Successfully started playing: {}", track.title);
    Ok(())
}

fn update_state(
    state: &Arc<Mutex<PlayerState>>,
    track: Option<Track>,
    playback_state: PlaybackState,
    volume: f32,
    queue: &PlayQueue,
    position_tracker: &PositionTracker,
) {
    let mut s = state.lock();
    s.current_track = track;
    s.playback_state = playback_state;
    s.volume = volume;
    s.queue_length = queue.len();
    s.play_mode = queue.mode();
    s.position = position_tracker.current_position();
}

fn handle_seek(
    sink: &mut Option<Sink>,
    position: Duration,
    position_tracker: &mut PositionTracker,
    state: &Arc<Mutex<PlayerState>>,
    queue: &PlayQueue,
    volume: f32,
) -> Result<()> {
    let target = clamp_seek_target(position, position_tracker.duration());
    let current = state.lock().current_track.clone();

    let Some(active_sink) = sink.as_ref() else {
        if current.is_none() {
            return Err(anyhow!("No active playback to seek"));
        }

        return Err(anyhow!("Cannot seek because the playback sink is unavailable"));
    };

    active_sink
        .try_seek(target)
        .map_err(|error| anyhow!("Failed to seek playback: {error}"))?;

    position_tracker.seek(target);

    let duration = position_tracker.duration().as_secs();
    let next_state = if position_tracker.is_playing {
        PlaybackState::Playing {
            position: target.as_secs(),
            duration,
        }
    } else {
        PlaybackState::Paused {
            position: target.as_secs(),
            duration,
        }
    };

    update_state(state, current, next_state, volume, queue, position_tracker);
    info!("Playback seeked to {}s", target.as_secs());

    Ok(())
}

fn clamp_seek_target(position: Duration, duration: Duration) -> Duration {
    if duration.is_zero() {
        Duration::ZERO
    } else {
        position.min(duration)
    }
}

/// Tracks playback position
#[derive(Debug, Clone)]
struct PositionTracker {
    start_time: Option<Instant>,
    paused_position: Duration,
    duration: Duration,
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
        self.paused_position = Duration::ZERO;
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

#[cfg(test)]
mod tests {
    use super::*;
    use rodio::buffer::SamplesBuffer;

    #[test]
    fn clamp_seek_target_caps_to_track_duration() {
        let duration = Duration::from_secs(180);

        assert_eq!(
            clamp_seek_target(Duration::from_secs(30), duration),
            Duration::from_secs(30)
        );
        assert_eq!(clamp_seek_target(Duration::from_secs(999), duration), duration);
    }

    #[test]
    fn clamp_seek_target_returns_zero_when_duration_is_unknown() {
        assert_eq!(
            clamp_seek_target(Duration::from_secs(30), Duration::ZERO),
            Duration::ZERO
        );
    }

    #[test]
    fn position_tracker_seek_preserves_pause_state() {
        let mut tracker = PositionTracker::new();
        tracker.start(Duration::from_secs(120));
        tracker.pause();

        tracker.seek(Duration::from_secs(45));

        assert!(!tracker.is_playing);
        assert_eq!(tracker.current_position(), Duration::from_secs(45));
    }

    #[test]
    fn handle_seek_updates_real_sink_position_and_state() {
        let (_stream, stream_handle) = OutputStream::try_default().unwrap();
        let sink = Sink::try_new(&stream_handle).unwrap();
        let source = SamplesBuffer::new(2, 44_100, vec![0.0f32; 44_100 * 2 * 3]);
        sink.append(source);

        let mut sink = Some(sink);
        let mut tracker = PositionTracker::new();
        tracker.start(Duration::from_secs(3));

        let current_track = Track::default();
        let state = Arc::new(Mutex::new(PlayerState {
            current_track: Some(current_track.clone()),
            playback_state: PlaybackState::Playing {
                position: 0,
                duration: 3,
            },
            volume: 1.0,
            play_mode: PlayMode::Sequential,
            queue_length: 0,
            position: Duration::ZERO,
        }));
        let queue = PlayQueue::new();

        handle_seek(
            &mut sink,
            Duration::from_secs(2),
            &mut tracker,
            &state,
            &queue,
            1.0,
        )
        .unwrap();

        let seeked_position = tracker.current_position();
        assert!(
            seeked_position >= Duration::from_secs(2)
                && seeked_position < Duration::from_secs(2) + Duration::from_millis(50),
            "unexpected seeked position: {:?}",
            seeked_position
        );

        let updated_state = state.lock().clone();
        assert_eq!(updated_state.current_track.as_ref().map(|track| track.id), Some(current_track.id));
        assert!(
            updated_state.position >= Duration::from_secs(2)
                && updated_state.position < Duration::from_secs(2) + Duration::from_millis(50),
            "unexpected state position: {:?}",
            updated_state.position
        );
        assert_eq!(
            updated_state.playback_state,
            PlaybackState::Playing {
                position: 2,
                duration: 3,
            }
        );
    }
}
