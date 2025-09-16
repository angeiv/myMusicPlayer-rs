//! Playlist-related Tauri commands for the music player

use tauri::State;
use std::sync::Mutex;
use log::{error, info};
use uuid::Uuid;
use serde::{Serialize, Deserialize};

use crate::models::{Playlist, Track};
use crate::AppState;

/// Create a new playlist
#[tauri::command]
pub async fn create_playlist(
    name: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    info!("Creating new playlist: {}", name);
    
    let mut playlists = state.playlists.lock()
        .map_err(|e| {
            error!("Failed to acquire playlists lock: {}", e);
            "Failed to access playlists service".to_string()
        })?;
    
    let id = playlists.create_playlist(&name)
        .map_err(|e| {
            error!("Failed to create playlist: {}", e);
            format!("Failed to create playlist: {}", e)
        })?;
    
    Ok(id.to_string())
}

/// Delete a playlist
#[tauri::command]
pub async fn delete_playlist(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let playlist_id = Uuid::parse_str(&id)
        .map_err(|e| format!("Invalid playlist ID: {}", e))?;
    
    info!("Deleting playlist: {}", id);
    
    let mut playlists = state.playlists.lock()
        .map_err(|e| {
            error!("Failed to acquire playlists lock: {}", e);
            "Failed to access playlists service".to_string()
        })?;
    
    playlists.delete_playlist(&playlist_id)
        .map_err(|e| {
            error!("Failed to delete playlist: {}", e);
            format!("Failed to delete playlist: {}", e)
        })
}

/// Add a track to a playlist
#[tauri::command]
pub async fn add_to_playlist(
    playlist_id: String,
    track: Track,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let playlist_uuid = Uuid::parse_str(&playlist_id)
        .map_err(|e| format!("Invalid playlist ID: {}", e))?;
    
    info!("Adding track to playlist: {}", playlist_id);
    
    let mut playlists = state.playlists.lock()
        .map_err(|e| {
            error!("Failed to acquire playlists lock: {}", e);
            "Failed to access playlists service".to_string()
        })?;
    
    playlists.add_to_playlist(&playlist_uuid, track)
        .map_err(|e| {
            error!("Failed to add track to playlist: {}", e);
            format!("Failed to add track to playlist: {}", e)
        })
}

/// Remove a track from a playlist
#[tauri::command]
pub async fn remove_from_playlist(
    playlist_id: String,
    track_index: usize,
    state: State<'_, AppState>,
) -> Result<Option<Track>, String> {
    let playlist_uuid = Uuid::parse_str(&playlist_id)
        .map_err(|e| format!("Invalid playlist ID: {}", e))?;
    
    info!("Removing track at index {} from playlist: {}", track_index, playlist_id);
    
    let mut playlists = state.playlists.lock()
        .map_err(|e| {
            error!("Failed to acquire playlists lock: {}", e);
            "Failed to access playlists service".to_string()
        })?;
    
    playlists.remove_from_playlist(&playlist_uuid, track_index)
        .map_err(|e| {
            error!("Failed to remove track from playlist: {}", e);
            format!("Failed to remove track from playlist: {}", e)
        })
}

/// Get a playlist by ID
#[tauri::command]
pub async fn get_playlist(
    id: String,
    state: State<'_, AppState>,
) -> Result<Option<Playlist>, String> {
    let playlist_id = Uuid::parse_str(&id)
        .map_err(|e| format!("Invalid playlist ID: {}", e))?;
    
    let playlists = state.playlists.lock()
        .map_err(|e| {
            error!("Failed to acquire playlists lock: {}", e);
            "Failed to access playlists service".to_string()
        })?;
    
    Ok(playlists.get_playlist(&playlist_id).cloned())
}

/// Get all playlists
#[tauri::command]
pub async fn get_playlists(
    state: State<'_, AppState>,
) -> Result<Vec<Playlist>, String> {
    let playlists = state.playlists.lock()
        .map_err(|e| {
            error!("Failed to acquire playlists lock: {}", e);
            "Failed to access playlists service".to_string()
        })?;
    
    Ok(playlists.get_playlists().into_iter().cloned().collect())
}

/// Update playlist metadata
#[tauri::command]
pub async fn update_playlist_metadata(
    id: String,
    name: Option<String>,
    description: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let playlist_id = Uuid::parse_str(&id)
        .map_err(|e| format!("Invalid playlist ID: {}", e))?;
    
    info!("Updating playlist metadata: {}", id);
    
    let mut playlists = state.playlists.lock()
        .map_err(|e| {
            error!("Failed to acquire playlists lock: {}", e);
            "Failed to access playlists service".to_string()
        })?;
    
    playlists.update_playlist_metadata(&playlist_id, name.as_deref(), description.as_deref())
        .map_err(|e| {
            error!("Failed to update playlist metadata: {}", e);
            format!("Failed to update playlist metadata: {}", e)
        })
}

/// Reorder tracks in a playlist
#[tauri::command]
pub async fn reorder_playlist_tracks(
    id: String,
    from_index: usize,
    to_index: usize,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let playlist_id = Uuid::parse_str(&id)
        .map_err(|e| format!("Invalid playlist ID: {}", e))?;
    
    info!("Reordering tracks in playlist: {} ({} -> {})", id, from_index, to_index);
    
    let mut playlists = state.playlists.lock()
        .map_err(|e| {
            error!("Failed to acquire playlists lock: {}", e);
            "Failed to access playlists service".to_string()
        })?;
    
    // Get the playlist
    let playlist = playlists.get_playlist_mut(&playlist_id)
        .ok_or_else(|| "Playlist not found".to_string())?;
    
    // Check bounds
    if from_index >= playlist.tracks.len() || to_index >= playlist.tracks.len() {
        return Err("Index out of bounds".to_string());
    }
    
    // Reorder tracks
    if from_index < to_index {
        // Move item to the right
        for i in from_index..to_index {
            playlist.tracks.swap(i, i + 1);
        }
    } else if from_index > to_index {
        // Move item to the left
        for i in (to_index..from_index).rev() {
            playlist.tracks.swap(i, i + 1);
        }
    }
    
    Ok(())
}

/// Get tracks in a playlist
#[tauri::command]
pub async fn get_playlist_tracks(
    id: String,
    state: State<'_, AppState>,
) -> Result<Vec<Track>, String> {
    let playlist_id = Uuid::parse_str(&id)
        .map_err(|e| format!("Invalid playlist ID: {}", e))?;
    
    let playlists = state.playlists.lock()
        .map_err(|e| {
            error!("Failed to acquire playlists lock: {}", e);
            "Failed to access playlists service".to_string()
        })?;
    
    let playlist = playlists.get_playlist(&playlist_id)
        .ok_or_else(|| "Playlist not found".to_string())?;
    
    Ok(playlist.tracks.clone())
}

/// Set tracks in a playlist (replaces all existing tracks)
#[tauri::command]
pub async fn set_playlist_tracks(
    id: String,
    tracks: Vec<Track>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let playlist_id = Uuid::parse_str(&id)
        .map_err(|e| format!("Invalid playlist ID: {}", e))?;
    
    info!("Setting {} tracks in playlist: {}", tracks.len(), id);
    
    let mut playlists = state.playlists.lock()
        .map_err(|e| {
            error!("Failed to acquire playlists lock: {}", e);
            "Failed to access playlists service".to_string()
        })?;
    
    let playlist = playlists.get_playlist_mut(&playlist_id)
        .ok_or_else(|| "Playlist not found".to_string())?;
    
    playlist.tracks = tracks;
    
    Ok(())
}

/// Get the number of playlists
#[tauri::command]
pub async fn get_playlist_count(
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let playlists = state.playlists.lock()
        .map_err(|e| {
            error!("Failed to acquire playlists lock: {}", e);
            "Failed to access playlists service".to_string()
        })?;
    
    Ok(playlists.count())
}
