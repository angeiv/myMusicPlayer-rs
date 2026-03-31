//! Thread-safe audio player using message passing

use super::{
    lyrics::load_local_lyrics,
    play_queue::{PlayMode, PlayQueue},
};
use crate::models::{playback_state::PlaybackState, track::Track};
use anyhow::{Context, Result, anyhow};
use cpal::traits::{DeviceTrait, HostTrait};
use crossbeam_channel::{Receiver, Sender, bounded};
use log::{error, info};
use parking_lot::Mutex;
use rodio::{Decoder, DeviceSinkBuilder, Player, Source};
use std::str::FromStr;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use std::{fs::File, io::BufReader};
use uuid::Uuid;

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
    RemoveFromQueue {
        track_id: Uuid,
        response_tx: Sender<Result<()>>,
    },
    GetQueue {
        response_tx: Sender<Vec<Track>>,
    },
    ListOutputDevices {
        response_tx: Sender<Result<Vec<OutputDeviceInfo>>>,
    },
    SetOutputDevice {
        device_id: Option<String>,
        response_tx: Sender<Result<()>>,
    },
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
    pub output_device_id: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct OutputDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[cfg_attr(test, allow(dead_code))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AudioBackend {
    Os,
    InMemory,
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
            output_device_id: None,
        }));

        let state_clone = Arc::clone(&state);

        #[cfg(test)]
        let backend = AudioBackend::InMemory;
        #[cfg(not(test))]
        let backend = AudioBackend::Os;

        // Spawn the audio player thread
        thread::spawn(move || {
            if let Err(e) = run_player_thread(command_rx, state_clone, backend) {
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

    /// Remove a track from the queue by ID.
    pub fn remove_from_queue(&self, track_id: Uuid) -> Result<()> {
        let (response_tx, response_rx) = bounded(1);
        self.command_tx
            .send(PlayerCommand::RemoveFromQueue {
                track_id,
                response_tx,
            })
            .map_err(|e| anyhow!("Failed to send remove from queue command: {e}"))?;

        response_rx
            .recv()
            .map_err(|e| anyhow!("Failed to receive remove from queue result: {e}"))?
    }

    pub fn get_queue(&self) -> Result<Vec<Track>> {
        let (response_tx, response_rx) = bounded(1);
        self.command_tx
            .send(PlayerCommand::GetQueue { response_tx })
            .map_err(|e| anyhow!("Failed to send get queue command: {e}"))?;

        response_rx
            .recv()
            .map_err(|e| anyhow!("Failed to receive queue response: {e}"))
    }

    pub fn list_output_devices(&self) -> Result<Vec<OutputDeviceInfo>> {
        let (response_tx, response_rx) = bounded(1);
        self.command_tx
            .send(PlayerCommand::ListOutputDevices { response_tx })
            .map_err(|e| anyhow!("Failed to send list output devices command: {e}"))?;

        response_rx
            .recv()
            .map_err(|e| anyhow!("Failed to receive output device list: {e}"))?
    }

    pub fn set_output_device(&self, device_id: Option<String>) -> Result<()> {
        let (response_tx, response_rx) = bounded(1);
        self.command_tx
            .send(PlayerCommand::SetOutputDevice {
                device_id,
                response_tx,
            })
            .map_err(|e| anyhow!("Failed to send set output device command: {e}"))?;

        response_rx
            .recv()
            .map_err(|e| anyhow!("Failed to receive set output device result: {e}"))?
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

    pub fn output_device_id(&self) -> Option<String> {
        self.state.lock().output_device_id.clone()
    }
}

/// Run the audio player in a dedicated thread
fn run_player_thread(
    command_rx: Receiver<PlayerCommand>,
    state: Arc<Mutex<PlayerState>>,
    backend: AudioBackend,
) -> Result<()> {
    let mut device_sink = match backend {
        AudioBackend::Os => Some(
            DeviceSinkBuilder::open_default_sink()
                .map_err(|e| anyhow!("Failed to open default audio output device: {e}"))?,
        ),
        AudioBackend::InMemory => None,
    };

    if let Some(sink) = device_sink.as_mut() {
        sink.log_on_drop(false);
    }
    state.lock().output_device_id = None;

    let (mut player, mock_output) = match device_sink.as_ref() {
        Some(sink) => (Player::connect_new(sink.mixer()), None),
        None => {
            let (player, output) = Player::new();
            (player, Some(output))
        }
    };

    let mock_drive_thread = mock_output.map(|mut output| {
        thread::spawn(move || {
            loop {
                for _ in 0..2048 {
                    if output.next().is_none() {
                        return;
                    }
                }
                thread::sleep(Duration::from_millis(8));
            }
        })
    });
    let mut queue = PlayQueue::new();
    let mut volume = 1.0f32;
    let mut position_tracker = PositionTracker::new();

    info!("Audio player thread started");

    loop {
        // Check if current track ended
        if player.empty() && position_tracker.is_playing {
            info!("Track ended, playing next");
            if let Some(track) = queue.next() {
                let track = track.clone();
                if let Err(e) = play_track_internal(
                    &track,
                    &player,
                    volume,
                    &mut position_tracker,
                    &state,
                    &mut queue,
                ) {
                    error!("Failed to auto-play next track: {}", e);
                }
            } else {
                // No more tracks
                player.stop();
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
                        &player,
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
                    if state.lock().current_track.is_some() {
                        player.pause();
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
                    if state.lock().current_track.is_some() {
                        player.play();
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
                    player.stop();
                    player.clear();
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
                        &player,
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
                    player.set_volume(volume);
                    state.lock().volume = volume;
                    info!("Volume set to {:.0}%", volume * 100.0);
                }
                PlayerCommand::Next => {
                    if let Some(track) = queue.next() {
                        let track = track.clone();
                        if let Err(e) = play_track_internal(
                            &track,
                            &player,
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
                            &player,
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
                PlayerCommand::RemoveFromQueue {
                    track_id,
                    response_tx,
                } => {
                    let remove_result = if state
                        .lock()
                        .current_track
                        .as_ref()
                        .is_some_and(|track| track.id == track_id)
                    {
                        Err(anyhow!("Cannot remove the current track from the queue"))
                    } else if queue.remove_track_by_id(track_id).is_none() {
                        Err(anyhow!("Track not found in the queue"))
                    } else {
                        state.lock().queue_length = queue.len();
                        Ok(())
                    };

                    let _ = response_tx.send(remove_result);
                }
                PlayerCommand::GetQueue { response_tx } => {
                    let _ = response_tx.send(queue.tracks().to_vec());
                }
                PlayerCommand::ListOutputDevices { response_tx } => {
                    if backend == AudioBackend::InMemory {
                        let _ = response_tx.send(Ok(Vec::new()));
                        continue;
                    }

                    let host = cpal::default_host();
                    let default_id = host
                        .default_output_device()
                        .and_then(|d| d.id().ok())
                        .map(|id| id.to_string());

                    let mut devices = Vec::new();
                    match host.output_devices() {
                        Ok(iter) => {
                            for device in iter {
                                let Ok(desc) = device.description() else {
                                    continue;
                                };
                                let name = desc.name().trim().to_string();
                                if name.is_empty() {
                                    continue;
                                }
                                let Ok(device_id) = device.id() else {
                                    continue;
                                };
                                let id_string = device_id.to_string();
                                let is_default = default_id
                                    .as_ref()
                                    .map(|d| d == &id_string)
                                    .unwrap_or(false);

                                devices.push(OutputDeviceInfo {
                                    id: id_string,
                                    name,
                                    is_default,
                                });
                            }

                            devices.sort_by(|a, b| {
                                b.is_default
                                    .cmp(&a.is_default)
                                    .then_with(|| a.name.cmp(&b.name))
                            });
                            let _ = response_tx.send(Ok(devices));
                        }
                        Err(err) => {
                            let _ = response_tx
                                .send(Err(anyhow!("Failed to enumerate output devices: {err}")));
                        }
                    }
                }
                PlayerCommand::SetOutputDevice {
                    device_id,
                    response_tx,
                } => {
                    if backend == AudioBackend::InMemory {
                        let _ = response_tx.send(Ok(()));
                        continue;
                    }

                    let next_sink = match device_id.as_deref() {
                        None => DeviceSinkBuilder::open_default_sink()
                            .map(|sink| (None, sink))
                            .map_err(|e| anyhow!("Failed to open default output device: {e}")),
                        Some(id) if id.eq_ignore_ascii_case("default") => {
                            DeviceSinkBuilder::open_default_sink()
                                .map(|sink| (None, sink))
                                .map_err(|e| anyhow!("Failed to open default output device: {e}"))
                        }
                        Some(id) => {
                            let requested = id.trim();
                            if requested.is_empty() {
                                DeviceSinkBuilder::open_default_sink()
                                    .map(|sink| (None, sink))
                                    .map_err(|e| {
                                        anyhow!("Failed to open default output device: {e}")
                                    })
                            } else {
                                let host = cpal::default_host();
                                let maybe_by_id = cpal::DeviceId::from_str(requested)
                                    .ok()
                                    .and_then(|id| host.device_by_id(&id));

                                let device = if let Some(device) = maybe_by_id {
                                    device
                                } else {
                                    let mut devices = host
                                        .output_devices()
                                        .context("Failed to enumerate output devices")?;
                                    devices
                                        .find(|d| {
                                            d.description()
                                                .map(|desc| desc.name() == requested)
                                                .unwrap_or(false)
                                        })
                                        .with_context(|| {
                                            format!("Output device not found: {requested}")
                                        })?
                                };

                                let selected_id = device
                                    .id()
                                    .map(|id| id.to_string())
                                    .unwrap_or_else(|_| requested.to_string());

                                let builder =
                                    DeviceSinkBuilder::from_device(device).map_err(|e| {
                                        anyhow!("Failed to open output device '{requested}': {e}")
                                    })?;
                                builder
                                    .open_sink_or_fallback()
                                    .map(|sink| (Some(selected_id), sink))
                                    .map_err(|e| {
                                        anyhow!(
                                            "Failed to start stream for output device '{requested}': {e}"
                                        )
                                    })
                            }
                        }
                    };

                    match next_sink {
                        Ok((selected_id, mut new_sink)) => {
                            new_sink.log_on_drop(false);
                            player.stop();
                            player.clear();
                            position_tracker.stop();

                            device_sink = Some(new_sink);
                            let sink = device_sink
                                .as_ref()
                                .context("Missing device sink after switching output")?;
                            player = Player::connect_new(sink.mixer());
                            player.set_volume(volume);
                            state.lock().output_device_id = selected_id.clone();

                            update_state(
                                &state,
                                None,
                                PlaybackState::Stopped,
                                volume,
                                &queue,
                                &position_tracker,
                            );
                            info!(
                                "Switched output device to {}",
                                selected_id.as_deref().unwrap_or("(system default)")
                            );
                            let _ = response_tx.send(Ok(()));
                        }
                        Err(err) => {
                            error!("Failed to switch output device: {err}");
                            let _ = response_tx.send(Err(err));
                        }
                    }
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

    if let Some(handle) = mock_drive_thread {
        let _ = handle.join();
    }

    Ok(())
}

fn play_track_internal(
    track: &Track,
    player: &Player,
    volume: f32,
    position_tracker: &mut PositionTracker,
    state: &Arc<Mutex<PlayerState>>,
    queue: &mut PlayQueue,
) -> Result<()> {
    info!("Playing track: {} - {}", track.title, track.path.display());

    if track
        .path
        .extension()
        .and_then(|s| s.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("ape"))
        .unwrap_or(false)
    {
        return Err(anyhow!(
            "APE format is currently unsupported. Consider converting '{}' to a supported format.",
            track.path.display()
        ));
    }

    player.stop();
    player.clear();

    let file = File::open(&track.path)
        .with_context(|| format!("Failed to open audio file {}", track.path.display()))?;
    let byte_len = file
        .metadata()
        .map(|m| m.len())
        .with_context(|| format!("Failed to read metadata for {}", track.path.display()))?;
    let decoder = Decoder::builder()
        .with_data(BufReader::new(file))
        .with_byte_len(byte_len)
        .with_coarse_seek(true)
        .build()
        .map_err(|e| anyhow!("Failed to create decoder for {}: {e}", track.path.display()))?;

    let duration_secs = decoder
        .total_duration()
        .filter(|d| !d.is_zero())
        .map(|d| d.as_secs())
        .unwrap_or(track.duration as u64);
    let sample_rate = decoder.sample_rate().get();
    let channels = decoder.channels().get();

    player.set_volume(volume);
    player.append(decoder);
    player.play();

    // Update position tracker
    let duration = Duration::from_secs(duration_secs);
    position_tracker.stop();
    position_tracker.start(duration);

    let mut enriched_track = track.clone();
    enriched_track =
        prepare_track_for_playback(&enriched_track, duration_secs, sample_rate, channels);

    if queue.is_empty() {
        queue.set_tracks(vec![enriched_track.clone()]);
    } else if !queue.select_track_by_id(enriched_track.id) {
        queue.add_track(enriched_track.clone());
        let _ = queue.select_track_by_id(enriched_track.id);
    }

    // Update state
    update_state(
        state,
        Some(enriched_track),
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

fn prepare_track_for_playback(
    track: &Track,
    duration_secs: u64,
    sample_rate: u32,
    channels: u16,
) -> Track {
    let mut enriched_track = track.clone();
    enriched_track.duration = duration_secs.min(u64::from(u32::MAX)) as u32;
    enriched_track.sample_rate = sample_rate;
    enriched_track.channels = channels;
    enriched_track.lyrics = load_local_lyrics(&enriched_track.path);
    enriched_track
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
    player: &Player,
    position: Duration,
    position_tracker: &mut PositionTracker,
    state: &Arc<Mutex<PlayerState>>,
    queue: &PlayQueue,
    volume: f32,
) -> Result<()> {
    let target = clamp_seek_target(position, position_tracker.duration());
    let current = state.lock().current_track.clone();

    if current.is_none() {
        return Err(anyhow!("No active playback to seek"));
    }

    if player.try_seek(target).is_err() {
        let track = current
            .clone()
            .context("Missing current track while seeking")?;
        let was_playing = position_tracker.is_playing;

        let file = File::open(&track.path)
            .with_context(|| format!("Failed to open audio file {}", track.path.display()))?;
        let byte_len = file
            .metadata()
            .map(|m| m.len())
            .with_context(|| format!("Failed to read metadata for {}", track.path.display()))?;

        let mut decoder = Decoder::builder()
            .with_data(BufReader::new(file))
            .with_byte_len(byte_len)
            .with_coarse_seek(true)
            .build()
            .map_err(|e| anyhow!("Failed to create decoder for {}: {e}", track.path.display()))?;

        let decoder = if decoder.try_seek(target).is_ok() {
            decoder.skip_duration(Duration::ZERO)
        } else {
            let file = File::open(&track.path)
                .with_context(|| format!("Failed to open audio file {}", track.path.display()))?;
            let byte_len = file
                .metadata()
                .map(|m| m.len())
                .with_context(|| format!("Failed to read metadata for {}", track.path.display()))?;
            let decoder = Decoder::builder()
                .with_data(BufReader::new(file))
                .with_byte_len(byte_len)
                .with_coarse_seek(true)
                .build()
                .map_err(|e| {
                    anyhow!("Failed to create decoder for {}: {e}", track.path.display())
                })?;
            decoder.skip_duration(target)
        };

        player.stop();
        player.clear();

        player.set_volume(volume);
        player.append(decoder);
        if was_playing {
            player.play();
        } else {
            player.pause();
        }
        info!("Fallback seek: rebuilt decoder at {}s", target.as_secs());
    }

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
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn clamp_seek_target_caps_to_track_duration() {
        let duration = Duration::from_secs(180);

        assert_eq!(
            clamp_seek_target(Duration::from_secs(30), duration),
            Duration::from_secs(30)
        );
        assert_eq!(
            clamp_seek_target(Duration::from_secs(999), duration),
            duration
        );
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
    fn handle_seek_updates_player_position_and_state() {
        let (player, mut output) = Player::new();

        let source = SamplesBuffer::new(
            rodio::nz!(2),
            rodio::nz!(44_100),
            vec![0.0f32; 44_100 * 2 * 3],
        );
        player.append(source);
        player.play();

        let drive_thread = std::thread::spawn(move || {
            for _ in 0..50 {
                for _ in 0..2048 {
                    if output.next().is_none() {
                        return;
                    }
                }
                std::thread::sleep(Duration::from_millis(6));
            }
        });

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
            output_device_id: None,
        }));
        let queue = PlayQueue::new();

        handle_seek(
            &player,
            Duration::from_secs(2),
            &mut tracker,
            &state,
            &queue,
            1.0,
        )
        .unwrap();

        let _ = drive_thread.join();

        let seeked_position = tracker.current_position();
        assert!(
            seeked_position >= Duration::from_secs(2) && seeked_position < Duration::from_secs(3),
            "unexpected seeked position: {:?}",
            seeked_position
        );

        let updated_state = state.lock().clone();
        assert_eq!(
            updated_state.current_track.as_ref().map(|track| track.id),
            Some(current_track.id)
        );
        assert!(
            updated_state.position >= Duration::from_secs(2)
                && updated_state.position < Duration::from_secs(3),
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

    #[test]
    fn prepare_track_for_playback_preserves_lyrics_when_present() {
        let dir = tempdir().unwrap();
        let audio_path = dir.path().join("track.mp3");
        let lyrics_path = dir.path().join("track.lrc");
        fs::write(&audio_path, b"audio").unwrap();
        fs::write(&lyrics_path, b"[00:01.00]hello").unwrap();

        let track = Track {
            path: audio_path,
            ..Track::default()
        };

        let enriched = prepare_track_for_playback(&track, 180, 48_000, 2);

        assert_eq!(enriched.lyrics.as_deref(), Some("[00:01.00]hello"));
        assert_eq!(enriched.duration, 180);
        assert_eq!(enriched.sample_rate, 48_000);
        assert_eq!(enriched.channels, 2);
    }

    #[test]
    fn prepare_track_for_playback_returns_none_when_lyrics_are_missing() {
        let dir = tempdir().unwrap();
        let audio_path = dir.path().join("track.flac");
        fs::write(&audio_path, b"audio").unwrap();

        let track = Track {
            path: audio_path,
            ..Track::default()
        };

        let enriched = prepare_track_for_playback(&track, 120, 44_100, 2);

        assert_eq!(enriched.lyrics, None);
    }

    #[test]
    fn remove_from_queue_removes_non_current_track() {
        let handle = AudioPlayerHandle::new().unwrap();

        let track1 = Track {
            title: "Track 1".to_string(),
            ..Track::default()
        };
        let track2 = Track {
            title: "Track 2".to_string(),
            ..Track::default()
        };

        handle
            .set_queue(vec![track1.clone(), track2.clone()])
            .unwrap();
        let _ = handle.get_queue().unwrap();

        // Simulate current track without decoding audio.
        handle.state.lock().current_track = Some(track1.clone());

        handle.remove_from_queue(track2.id).unwrap();

        let queue = handle.get_queue().unwrap();
        assert_eq!(queue.len(), 1);
        assert_eq!(queue[0].id, track1.id);
        assert_eq!(handle.state.lock().queue_length, 1);
        assert_eq!(
            handle.state.lock().current_track.as_ref().map(|t| t.id),
            Some(track1.id)
        );
    }

    #[test]
    fn remove_from_queue_rejects_current_track() {
        let handle = AudioPlayerHandle::new().unwrap();

        let track1 = Track {
            title: "Track 1".to_string(),
            ..Track::default()
        };
        let track2 = Track {
            title: "Track 2".to_string(),
            ..Track::default()
        };

        handle
            .set_queue(vec![track1.clone(), track2.clone()])
            .unwrap();
        let _ = handle.get_queue().unwrap();

        // Simulate current track without decoding audio.
        handle.state.lock().current_track = Some(track1.clone());

        let result = handle.remove_from_queue(track1.id);
        assert!(result.is_err());

        let queue = handle.get_queue().unwrap();
        assert_eq!(queue.len(), 2);
        assert_eq!(queue[0].id, track1.id);
        assert_eq!(queue[1].id, track2.id);
        assert_eq!(handle.state.lock().queue_length, 2);
        assert_eq!(
            handle.state.lock().current_track.as_ref().map(|t| t.id),
            Some(track1.id)
        );
    }

    #[test]
    fn remove_from_queue_rejects_missing_track() {
        let handle = AudioPlayerHandle::new().unwrap();

        let track1 = Track {
            title: "Track 1".to_string(),
            ..Track::default()
        };
        let missing_track = Track {
            title: "Missing".to_string(),
            ..Track::default()
        };

        handle.set_queue(vec![track1.clone()]).unwrap();
        let _ = handle.get_queue().unwrap();

        // Simulate current track without decoding audio.
        handle.state.lock().current_track = Some(track1.clone());

        let result = handle.remove_from_queue(missing_track.id);
        assert!(result.is_err());

        let queue = handle.get_queue().unwrap();
        assert_eq!(queue.len(), 1);
        assert_eq!(queue[0].id, track1.id);
        assert_eq!(handle.state.lock().queue_length, 1);
        assert_eq!(
            handle.state.lock().current_track.as_ref().map(|t| t.id),
            Some(track1.id)
        );
    }
}
