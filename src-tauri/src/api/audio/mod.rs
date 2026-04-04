//! Audio-related Tauri commands for the music player

use crate::AppState;
use crate::models::{PlaybackState, Track};
use crate::services::audio::VisualizationData;
use crate::services::audio::lyrics::load_local_lyrics;
use log::{error, info};
use serde::Deserialize;
use std::path::PathBuf;
use std::time::Duration;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

/// Play a track
#[tauri::command]
pub async fn play(track: Track, state: State<'_, AppState>) -> Result<(), String> {
    let mut audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to access audio service".to_string()
    })?;

    audio.play(&track).map_err(|e| {
        error!("Failed to play track: {}", e);
        format!("Failed to play track: {}", e)
    })
}

/// Play a file by path
#[tauri::command]
pub async fn play_file(file_path: String, state: State<'_, AppState>) -> Result<(), String> {
    info!("Playing file: {}", file_path);

    // Create a temporary track for the file
    let path = PathBuf::from(&file_path);
    if !path.is_file() {
        return Err(format!("Selected path is not a file: {}", path.display()));
    }

    let track = build_temp_track_for_file(path);

    let mut audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to acquire audio lock".to_string()
    })?;

    audio.play(&track).map_err(|e| {
        error!("Failed to play file: {}", e);
        format!("Failed to play file: {}", e)
    })
}

fn build_temp_track_for_file(path: PathBuf) -> Track {
    let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);

    Track {
        id: uuid::Uuid::new_v4(),
        title: path
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Unknown".to_string()),
        duration: 0, // TODO: Extract from metadata
        track_number: None,
        disc_number: None,
        path: path.clone(),
        library_root: None,
        size,
        file_mtime_ms: None,
        format: path
            .extension()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "unknown".to_string()),
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
        lyrics: load_local_lyrics(&path),
        availability: crate::models::TrackAvailability::Available,
        missing_since: None,
        play_count: 0,
        last_played: None,
        date_added: chrono::Utc::now(),
    }
}

#[tauri::command]
pub async fn pick_and_play_file(
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let selected = window
        .dialog()
        .file()
        .add_filter("Audio", &["mp3", "flac", "wav", "aac", "ogg", "m4a"])
        .blocking_pick_file();

    let Some(file_path) = selected else {
        return Ok(());
    };

    let path = file_path
        .into_path()
        .map_err(|e| format!("Failed to resolve selected file path: {e}"))?;

    play_file(path.to_string_lossy().into_owned(), state).await
}

/// Pause the current playback
#[tauri::command]
pub async fn pause(state: State<'_, AppState>) -> Result<(), String> {
    let mut audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to access audio service".to_string()
    })?;

    audio.pause().map_err(|e| {
        error!("Failed to pause playback: {}", e);
        "Failed to pause playback".to_string()
    })
}

/// Resume the current playback
#[tauri::command]
pub async fn resume(state: State<'_, AppState>) -> Result<(), String> {
    let mut audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to access audio service".to_string()
    })?;

    audio.resume().map_err(|e| {
        error!("Failed to resume playback: {}", e);
        "Failed to resume playback".to_string()
    })
}

/// Stop the current playback
#[tauri::command]
pub async fn stop(state: State<'_, AppState>) -> Result<(), String> {
    let mut audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to access audio service".to_string()
    })?;

    audio.stop().map_err(|e| {
        error!("Failed to stop playback: {}", e);
        "Failed to stop playback".to_string()
    })
}

/// Seek to a specific position in the current track (in seconds)
#[tauri::command]
pub async fn seek(position: u64, state: State<'_, AppState>) -> Result<(), String> {
    let mut audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to access audio service".to_string()
    })?;

    audio.seek(Duration::from_secs(position)).map_err(|e| {
        error!("Failed to seek to position {}: {}", position, e);
        format!("Failed to seek to position: {}", e)
    })
}

/// Set the volume (0.0 to 1.0)
#[tauri::command]
pub async fn set_volume(volume: f32, state: State<'_, AppState>) -> Result<(), String> {
    let mut audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to access audio service".to_string()
    })?;

    audio.set_volume(volume).map_err(|e| {
        error!("Failed to set volume to {}: {}", volume, e);
        format!("Failed to set volume: {}", e)
    })
}

/// Get the current playback state
#[tauri::command]
pub async fn get_state(state: State<'_, AppState>) -> Result<PlaybackState, String> {
    let audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to access audio service".to_string()
    })?;

    Ok(audio.get_state())
}

/// Get the current playback state (alias for get_state)
#[tauri::command]
pub async fn get_playback_state(state: State<'_, AppState>) -> Result<PlaybackState, String> {
    get_state(state).await
}

/// Get the current track
#[tauri::command]
pub async fn get_current_track(state: State<'_, AppState>) -> Result<Option<Track>, String> {
    let audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to access audio service".to_string()
    })?;

    Ok(audio.current_track())
}

/// Check if audio is currently playing
#[tauri::command]
pub async fn is_playing(state: State<'_, AppState>) -> Result<bool, String> {
    let audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to access audio service".to_string()
    })?;

    Ok(audio.is_playing())
}

/// Get the current volume (0.0 to 1.0)
#[tauri::command]
pub async fn get_volume(state: State<'_, AppState>) -> Result<f32, String> {
    let audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to access audio service".to_string()
    })?;

    Ok(audio.volume())
}

/// Toggle play/pause
#[tauri::command]
pub async fn toggle_play_pause(state: State<'_, AppState>) -> Result<bool, String> {
    let mut audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to access audio service".to_string()
    })?;

    let is_playing = audio.is_playing();

    if is_playing {
        audio.pause()?;
    } else {
        audio.resume()?;
    }

    Ok(!is_playing)
}

/// Get visualization data for audio analysis
#[tauri::command]
pub async fn get_visualization_data(
    _state: State<'_, AppState>,
) -> Result<VisualizationData, String> {
    // For now, return mock data since we haven't integrated the analyzer yet
    // In a real implementation, this would get data from the audio analyzer

    let frequency_spectrum: Vec<f32> = (0..128)
        .map(|i| {
            let freq = i as f32 / 128.0;
            (freq * std::f32::consts::PI * 4.0).sin().abs() * 0.5
                + (std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as f32
                    * 0.01
                    + freq * 10.0)
                    .sin()
                    .abs()
                    * 0.5
        })
        .collect();

    let waveform: Vec<f32> = (0..256)
        .map(|i| {
            let t = i as f32 / 256.0;
            (t * std::f32::consts::PI * 8.0
                + std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as f32
                    * 0.01)
                .sin()
                * 0.8
        })
        .collect();

    Ok(VisualizationData {
        frequency_spectrum,
        waveform,
        stats: crate::services::audio::VisualizationStats {
            rms: 0.3,
            peak: 0.8,
            spectral_centroid: 2000.0,
        },
    })
}

/// Play the next track in the queue
#[tauri::command]
pub async fn next_track(state: State<'_, AppState>) -> Result<(), String> {
    let mut audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to access audio service".to_string()
    })?;

    audio.next().map_err(|e| {
        error!("Failed to play next track: {}", e);
        format!("Failed to play next track: {}", e)
    })
}

/// Play the previous track in the queue
#[tauri::command]
pub async fn previous_track(state: State<'_, AppState>) -> Result<(), String> {
    let mut audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to access audio service".to_string()
    })?;

    audio.previous().map_err(|e| {
        error!("Failed to play previous track: {}", e);
        format!("Failed to play previous track: {}", e)
    })
}

/// Set the play mode
#[tauri::command]
pub async fn set_play_mode(mode: String, state: State<'_, AppState>) -> Result<(), String> {
    use crate::services::audio::PlayMode;

    let play_mode = match mode.as_str() {
        "sequential" => PlayMode::Sequential,
        "random" => PlayMode::Random,
        "single_repeat" => PlayMode::SingleRepeat,
        "list_repeat" => PlayMode::ListRepeat,
        _ => return Err(format!("Invalid play mode: {}", mode)),
    };

    let mut audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to access audio service".to_string()
    })?;

    audio.set_play_mode(play_mode);
    info!("Play mode set to: {}", mode);
    Ok(())
}

/// Get the current play mode
#[tauri::command]
pub async fn get_play_mode(state: State<'_, AppState>) -> Result<String, String> {
    let audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to access audio service".to_string()
    })?;

    let mode = match audio.play_mode() {
        crate::services::audio::PlayMode::Sequential => "sequential",
        crate::services::audio::PlayMode::Random => "random",
        crate::services::audio::PlayMode::SingleRepeat => "single_repeat",
        crate::services::audio::PlayMode::ListRepeat => "list_repeat",
    };

    Ok(mode.to_string())
}

/// Set the play queue
#[tauri::command]
pub async fn set_queue(tracks: Vec<Track>, state: State<'_, AppState>) -> Result<(), String> {
    let audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to access audio service".to_string()
    })?;

    audio.set_queue(tracks)?;
    info!("Play queue updated");
    Ok(())
}

/// Get the current play queue
#[tauri::command]
pub async fn get_queue(state: State<'_, AppState>) -> Result<Vec<Track>, String> {
    let audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to access audio service".to_string()
    })?;

    audio.get_queue().map_err(|e| {
        error!("Failed to get queue: {}", e);
        e
    })
}

#[tauri::command]
pub async fn get_output_devices(
    state: State<'_, AppState>,
) -> Result<Vec<crate::services::audio::OutputDeviceInfo>, String> {
    let audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to access audio service".to_string()
    })?;

    audio.list_output_devices().map_err(|e| {
        error!("Failed to list output devices: {}", e);
        e
    })
}

#[tauri::command]
pub async fn set_output_device(
    payload: SetOutputDevicePayload,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to access audio service".to_string()
    })?;

    audio.set_output_device(payload.device_id).map_err(|e| {
        error!("Failed to set output device: {}", e);
        e
    })
}

#[derive(Debug, Deserialize)]
pub struct SetOutputDevicePayload {
    #[serde(alias = "deviceId")]
    pub device_id: Option<String>,
}

#[tauri::command]
pub async fn get_output_device(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to access audio service".to_string()
    })?;

    Ok(audio.output_device_id())
}

/// Add tracks to the play queue
#[tauri::command]
pub async fn add_to_queue(tracks: Vec<Track>, state: State<'_, AppState>) -> Result<(), String> {
    let audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to access audio service".to_string()
    })?;

    audio.add_to_queue(tracks)?;
    info!("Added tracks to queue");
    Ok(())
}

/// Clear the play queue
#[tauri::command]
pub async fn clear_queue(state: State<'_, AppState>) -> Result<(), String> {
    let audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to access audio service".to_string()
    })?;

    audio.clear_queue()?;
    info!("Play queue cleared");
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct RemoveFromQueuePayload {
    #[serde(alias = "trackId")]
    pub track_id: String,
}

/// Remove a track from the play queue
#[tauri::command]
pub async fn remove_from_queue(
    payload: RemoveFromQueuePayload,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let track_id =
        uuid::Uuid::parse_str(&payload.track_id).map_err(|_| "Invalid track id".to_string())?;

    let audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to access audio service".to_string()
    })?;

    audio.remove_from_queue(track_id).map_err(|e| {
        error!("Failed to remove from queue: {}", e);
        e
    })
}

/// Get the current playback position in seconds
#[tauri::command]
pub async fn get_position(state: State<'_, AppState>) -> Result<u64, String> {
    let audio = state.audio.lock().map_err(|e| {
        error!("Failed to acquire audio lock: {}", e);
        "Failed to access audio service".to_string()
    })?;

    Ok(audio.position().as_secs())
}

#[cfg(test)]
mod tests {
    use super::build_temp_track_for_file;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn build_temp_track_for_file_loads_companion_lrc() {
        let dir = tempdir().unwrap();
        let audio_path = dir.path().join("demo.mp3");
        let lyrics_path = dir.path().join("demo.lrc");
        fs::write(&audio_path, b"audio").unwrap();
        fs::write(&lyrics_path, b"[00:01.00]hello").unwrap();

        let track = build_temp_track_for_file(audio_path);

        assert_eq!(track.lyrics.as_deref(), Some("[00:01.00]hello"));
    }

    #[test]
    fn build_temp_track_for_file_sets_none_when_lrc_missing() {
        let dir = tempdir().unwrap();
        let audio_path = dir.path().join("demo.flac");
        fs::write(&audio_path, b"audio").unwrap();

        let track = build_temp_track_for_file(audio_path);

        assert_eq!(track.lyrics, None);
    }
}
