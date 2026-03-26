//! Playlist-related Tauri commands for the music player

use log::{error, info};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::AppState;
use crate::models::{Playlist, Track};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AddTracksToPlaylistResult {
    pub added: usize,
    pub total: usize,
    pub failed_track_ids: Vec<String>,
}

/// Create a new playlist
#[tauri::command]
pub async fn create_playlist(name: String, state: State<'_, AppState>) -> Result<String, String> {
    info!("Creating new playlist: {}", name);

    let mut playlists = state.playlists.lock().map_err(|e| {
        error!("Failed to acquire playlists lock: {}", e);
        "Failed to access playlists service".to_string()
    })?;

    let id = playlists.create_playlist(&name).map_err(|e| {
        error!("Failed to create playlist: {}", e);
        format!("Failed to create playlist: {}", e)
    })?;

    Ok(id.to_string())
}

/// Delete a playlist
#[tauri::command]
pub async fn delete_playlist(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let playlist_id = Uuid::parse_str(&id).map_err(|e| format!("Invalid playlist ID: {}", e))?;

    info!("Deleting playlist: {}", id);

    let mut playlists = state.playlists.lock().map_err(|e| {
        error!("Failed to acquire playlists lock: {}", e);
        "Failed to access playlists service".to_string()
    })?;

    playlists.delete_playlist(&playlist_id).map_err(|e| {
        error!("Failed to delete playlist: {}", e);
        format!("Failed to delete playlist: {}", e)
    })
}

/// Add a track to a playlist
#[tauri::command]
pub async fn add_to_playlist(
    playlist_id: String,
    track_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let playlist_uuid =
        Uuid::parse_str(&playlist_id).map_err(|e| format!("Invalid playlist ID: {}", e))?;
    let track_uuid = Uuid::parse_str(&track_id).map_err(|e| format!("Invalid track ID: {}", e))?;

    info!("Adding track to playlist: {}", playlist_id);

    // Ensure the track exists before adding it to a playlist
    {
        let library = state.library.lock().map_err(|e| {
            error!("Failed to acquire library lock: {}", e);
            "Failed to access library service".to_string()
        })?;

        library
            .get_track(track_uuid)
            .map_err(|e| {
                error!("Failed to load track {}: {}", track_id, e);
                e.to_string()
            })?
            .ok_or_else(|| "Track not found".to_string())?;
    }

    let mut playlists = state.playlists.lock().map_err(|e| {
        error!("Failed to acquire playlists lock: {}", e);
        "Failed to access playlists service".to_string()
    })?;

    playlists
        .add_to_playlist(&playlist_uuid, track_uuid)
        .map_err(|e| {
            error!("Failed to add track to playlist: {}", e);
            e
        })
}

/// Add multiple tracks to a playlist, preserving order and reporting partial failures.
#[tauri::command]
pub async fn add_tracks_to_playlist(
    playlist_id: String,
    track_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<AddTracksToPlaylistResult, String> {
    let playlist_uuid =
        Uuid::parse_str(&playlist_id).map_err(|e| format!("Invalid playlist ID: {}", e))?;

    info!(
        "Adding {} tracks to playlist: {}",
        track_ids.len(),
        playlist_id
    );

    let mut valid_track_ids = Vec::with_capacity(track_ids.len());
    let mut failed_track_ids = Vec::new();

    {
        let library = state.library.lock().map_err(|e| {
            error!("Failed to acquire library lock: {}", e);
            "Failed to access library service".to_string()
        })?;

        for track_id in &track_ids {
            let track_uuid = match Uuid::parse_str(track_id) {
                Ok(uuid) => uuid,
                Err(_) => {
                    failed_track_ids.push(track_id.clone());
                    continue;
                }
            };

            let exists = library
                .get_track(track_uuid)
                .map_err(|e| {
                    error!("Failed to load track {}: {}", track_id, e);
                    e.to_string()
                })?
                .is_some();

            if exists {
                valid_track_ids.push(track_uuid);
            } else {
                failed_track_ids.push(track_id.clone());
            }
        }
    }

    let added = if valid_track_ids.is_empty() {
        0
    } else {
        let mut playlists = state.playlists.lock().map_err(|e| {
            error!("Failed to acquire playlists lock: {}", e);
            "Failed to access playlists service".to_string()
        })?;

        playlists
            .add_tracks_to_playlist(&playlist_uuid, &valid_track_ids)
            .map_err(|e| {
                error!("Failed to add tracks to playlist: {}", e);
                e
            })?
    };

    Ok(AddTracksToPlaylistResult {
        added,
        total: track_ids.len(),
        failed_track_ids,
    })
}

/// Remove a track from a playlist
#[tauri::command]
pub async fn remove_from_playlist(
    playlist_id: String,
    track_index: usize,
    state: State<'_, AppState>,
) -> Result<Option<Track>, String> {
    let playlist_uuid =
        Uuid::parse_str(&playlist_id).map_err(|e| format!("Invalid playlist ID: {}", e))?;

    info!(
        "Removing track at index {} from playlist: {}",
        track_index, playlist_id
    );

    let mut playlists = state.playlists.lock().map_err(|e| {
        error!("Failed to acquire playlists lock: {}", e);
        "Failed to access playlists service".to_string()
    })?;

    let removed_id = playlists
        .remove_from_playlist(&playlist_uuid, track_index)
        .map_err(|e| {
            error!("Failed to remove track from playlist: {}", e);
            e
        })?;

    drop(playlists);

    if let Some(track_id) = removed_id {
        let library = state.library.lock().map_err(|e| {
            error!("Failed to acquire library lock: {}", e);
            "Failed to access library service".to_string()
        })?;

        library.get_track(track_id).map_err(|e| {
            error!("Failed to load removed track {}: {}", track_id, e);
            e.to_string()
        })
    } else {
        Ok(None)
    }
}

/// Get a playlist by ID
#[tauri::command]
pub async fn get_playlist(
    id: String,
    state: State<'_, AppState>,
) -> Result<Option<Playlist>, String> {
    let playlist_id = Uuid::parse_str(&id).map_err(|e| format!("Invalid playlist ID: {}", e))?;

    let playlists = state.playlists.lock().map_err(|e| {
        error!("Failed to acquire playlists lock: {}", e);
        "Failed to access playlists service".to_string()
    })?;

    Ok(playlists.get_playlist(&playlist_id).cloned())
}

/// Get all playlists
#[tauri::command]
pub async fn get_playlists(state: State<'_, AppState>) -> Result<Vec<Playlist>, String> {
    let playlists = state.playlists.lock().map_err(|e| {
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
    let playlist_id = Uuid::parse_str(&id).map_err(|e| format!("Invalid playlist ID: {}", e))?;

    info!("Updating playlist metadata: {}", id);

    let mut playlists = state.playlists.lock().map_err(|e| {
        error!("Failed to acquire playlists lock: {}", e);
        "Failed to access playlists service".to_string()
    })?;

    playlists
        .update_playlist_metadata(&playlist_id, name.as_deref(), description.as_deref())
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
    let playlist_id = Uuid::parse_str(&id).map_err(|e| format!("Invalid playlist ID: {}", e))?;

    info!(
        "Reordering tracks in playlist: {} ({} -> {})",
        id, from_index, to_index
    );

    let mut playlists = state.playlists.lock().map_err(|e| {
        error!("Failed to acquire playlists lock: {}", e);
        "Failed to access playlists service".to_string()
    })?;

    // Get the playlist
    let playlist = playlists
        .get_playlist_mut(&playlist_id)
        .ok_or_else(|| "Playlist not found".to_string())?;

    // Check bounds
    if from_index >= playlist.track_ids.len() || to_index >= playlist.track_ids.len() {
        return Err("Index out of bounds".to_string());
    }

    // Reorder tracks
    if from_index < to_index {
        // Move item to the right
        for i in from_index..to_index {
            playlist.track_ids.swap(i, i + 1);
        }
    } else if from_index > to_index {
        // Move item to the left
        for i in (to_index..from_index).rev() {
            playlist.track_ids.swap(i, i + 1);
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
    let playlist_id = Uuid::parse_str(&id).map_err(|e| format!("Invalid playlist ID: {}", e))?;

    let playlists = state.playlists.lock().map_err(|e| {
        error!("Failed to acquire playlists lock: {}", e);
        "Failed to access playlists service".to_string()
    })?;

    let playlist = playlists
        .get_playlist(&playlist_id)
        .ok_or_else(|| "Playlist not found".to_string())?;

    let track_ids: Vec<Uuid> = playlist.track_ids.clone();

    drop(playlists);

    let library = state.library.lock().map_err(|e| {
        error!("Failed to acquire library lock: {}", e);
        "Failed to access library service".to_string()
    })?;

    let mut tracks = Vec::with_capacity(track_ids.len());
    for id in track_ids {
        if let Some(track) = library.get_track(id).map_err(|e| {
            error!("Failed to load track {}: {}", id, e);
            e.to_string()
        })? {
            tracks.push(track);
        }
    }

    Ok(tracks)
}

/// Set tracks in a playlist (replaces all existing tracks)
#[tauri::command]
pub async fn set_playlist_tracks(
    id: String,
    tracks: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let playlist_id = Uuid::parse_str(&id).map_err(|e| format!("Invalid playlist ID: {}", e))?;

    info!("Setting {} tracks in playlist: {}", tracks.len(), id);

    let mut playlists = state.playlists.lock().map_err(|e| {
        error!("Failed to acquire playlists lock: {}", e);
        "Failed to access playlists service".to_string()
    })?;

    let playlist = playlists
        .get_playlist_mut(&playlist_id)
        .ok_or_else(|| "Playlist not found".to_string())?;

    let parsed_ids: Result<Vec<Uuid>, String> = tracks
        .into_iter()
        .map(|id| Uuid::parse_str(&id).map_err(|e| format!("Invalid track ID: {}", e)))
        .collect();

    playlist.track_ids = parsed_ids?;

    Ok(())
}

/// Get the number of playlists
#[tauri::command]
pub async fn get_playlist_count(state: State<'_, AppState>) -> Result<usize, String> {
    let playlists = state.playlists.lock().map_err(|e| {
        error!("Failed to acquire playlists lock: {}", e);
        "Failed to access playlists service".to_string()
    })?;

    Ok(playlists.count())
}
