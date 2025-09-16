//! Audio-related Tauri commands for the music player

use tauri::State;
use std::sync::Mutex;
use std::time::Duration;
use log::{error, info};
use crate::models::{Track, PlaybackState};
use crate::services::audio::{AudioService, VisualizationData};
use crate::AppState;

/// Play a track
#[tauri::command]
pub async fn play(
    track: Track,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut audio = state.audio.lock()
        .map_err(|e| {
            error!("Failed to acquire audio lock: {}", e);
            "Failed to access audio service".to_string()
        })?;

    audio.play(&track)
        .map_err(|e| {
            error!("Failed to play track: {}", e);
            format!("Failed to play track: {}", e)
        })
}

/// Play a file by path
#[tauri::command]
pub async fn play_file(
    file_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    info!("Playing file: {}", file_path);

    // Create a temporary track for the file
    let path = std::path::PathBuf::from(&file_path);
    let track = Track {
        id: uuid::Uuid::new_v4(),
        title: path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_string(),
        duration: 0, // TODO: Extract from metadata
        track_number: None,
        disc_number: None,
        path: path.clone(),
        size: 0, // TODO: Get file size
        format: path.extension()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string(),
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

    let mut audio = state.audio.lock()
        .map_err(|e| {
            error!("Failed to acquire audio lock: {}", e);
            "Failed to acquire audio lock".to_string()
        })?;

    audio.play(&track)
        .map_err(|e| {
            error!("Failed to play file: {}", e);
            format!("Failed to play file: {}", e)
        })
}

/// Pause the current playback
#[tauri::command]
pub async fn pause(state: State<'_, AppState>) -> Result<(), String> {
    let mut audio = state.audio.lock()
        .map_err(|e| {
            error!("Failed to acquire audio lock: {}", e);
            "Failed to access audio service".to_string()
        })?;
        
    audio.pause()
        .map_err(|e| {
            error!("Failed to pause playback: {}", e);
            "Failed to pause playback".to_string()
        })
}

/// Resume the current playback
#[tauri::command]
pub async fn resume(state: State<'_, AppState>) -> Result<(), String> {
    let mut audio = state.audio.lock()
        .map_err(|e| {
            error!("Failed to acquire audio lock: {}", e);
            "Failed to access audio service".to_string()
        })?;
        
    audio.resume()
        .map_err(|e| {
            error!("Failed to resume playback: {}", e);
            "Failed to resume playback".to_string()
        })
}

/// Stop the current playback
#[tauri::command]
pub async fn stop(state: State<'_, AppState>) -> Result<(), String> {
    let mut audio = state.audio.lock()
        .map_err(|e| {
            error!("Failed to acquire audio lock: {}", e);
            "Failed to access audio service".to_string()
        })?;
        
    audio.stop()
        .map_err(|e| {
            error!("Failed to stop playback: {}", e);
            "Failed to stop playback".to_string()
        })
}

/// Seek to a specific position in the current track (in seconds)
#[tauri::command]
pub async fn seek(
    position: u64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut audio = state.audio.lock()
        .map_err(|e| {
            error!("Failed to acquire audio lock: {}", e);
            "Failed to access audio service".to_string()
        })?;
        
    audio.seek(Duration::from_secs(position))
        .map_err(|e| {
            error!("Failed to seek to position {}: {}", position, e);
            format!("Failed to seek to position: {}", e)
        })
}

/// Set the volume (0.0 to 1.0)
#[tauri::command]
pub async fn set_volume(
    volume: f32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut audio = state.audio.lock()
        .map_err(|e| {
            error!("Failed to acquire audio lock: {}", e);
            "Failed to access audio service".to_string()
        })?;
        
    audio.set_volume(volume)
        .map_err(|e| {
            error!("Failed to set volume to {}: {}", volume, e);
            format!("Failed to set volume: {}", e)
        })
}

/// Get the current playback state
#[tauri::command]
pub async fn get_state(
    state: State<'_, AppState>,
) -> Result<PlaybackState, String> {
    let audio = state.audio.lock()
        .map_err(|e| {
            error!("Failed to acquire audio lock: {}", e);
            "Failed to access audio service".to_string()
        })?;

    Ok(audio.get_state())
}

/// Get the current playback state (alias for get_state)
#[tauri::command]
pub async fn get_playback_state(
    state: State<'_, AppState>,
) -> Result<PlaybackState, String> {
    get_state(state).await
}

/// Get the current track
#[tauri::command]
pub async fn get_current_track(
    state: State<'_, AppState>,
) -> Result<Option<Track>, String> {
    let audio = state.audio.lock()
        .map_err(|e| {
            error!("Failed to acquire audio lock: {}", e);
            "Failed to access audio service".to_string()
        })?;
        
    Ok(audio.current_track().cloned())
}

/// Check if audio is currently playing
#[tauri::command]
pub async fn is_playing(
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let audio = state.audio.lock()
        .map_err(|e| {
            error!("Failed to acquire audio lock: {}", e);
            "Failed to access audio service".to_string()
        })?;
        
    Ok(audio.is_playing())
}

/// Get the current volume (0.0 to 1.0)
#[tauri::command]
pub async fn get_volume(
    state: State<'_, AppState>,
) -> Result<f32, String> {
    let audio = state.audio.lock()
        .map_err(|e| {
            error!("Failed to acquire audio lock: {}", e);
            "Failed to access audio service".to_string()
        })?;
        
    Ok(audio.volume())
}

/// Toggle play/pause
#[tauri::command]
pub async fn toggle_play_pause(
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let mut audio = state.audio.lock()
        .map_err(|e| {
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
    state: State<'_, AppState>,
) -> Result<VisualizationData, String> {
    // For now, return mock data since we haven't integrated the analyzer yet
    // In a real implementation, this would get data from the audio analyzer

    let frequency_spectrum: Vec<f32> = (0..128)
        .map(|i| {
            let freq = i as f32 / 128.0;
            (freq * std::f32::consts::PI * 4.0).sin().abs() * 0.5 +
            (std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as f32 * 0.01 + freq * 10.0).sin().abs() * 0.5
        })
        .collect();

    let waveform: Vec<f32> = (0..256)
        .map(|i| {
            let t = i as f32 / 256.0;
            (t * std::f32::consts::PI * 8.0 +
             std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as f32 * 0.01).sin() * 0.8
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
