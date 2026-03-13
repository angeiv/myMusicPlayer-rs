//! Library-related Tauri commands for the music player

use log::{error, info};
use std::path::PathBuf;
use tauri::State;
use uuid::Uuid;

use crate::AppState;
use crate::models::{Album, Artist, Track};

type LibrarySearchResult = (Vec<Track>, Vec<Album>, Vec<Artist>);

/// Scan a directory for music files and add them to the library
#[tauri::command]
pub async fn scan_directory(path: PathBuf, state: State<'_, AppState>) -> Result<usize, String> {
    info!("Scanning directory: {}", path.display());

    let mut library = state.library.lock().map_err(|e| {
        error!("Failed to acquire library lock: {}", e);
        "Failed to access library service".to_string()
    })?;

    library.scan_directory(&path).map_err(|e| {
        error!("Failed to scan directory: {}", e);
        e.to_string()
    })
}

/// Get all tracks in the library
#[tauri::command]
pub async fn get_tracks(state: State<'_, AppState>) -> Result<Vec<Track>, String> {
    let library = state.library.lock().map_err(|e| {
        error!("Failed to acquire library lock: {}", e);
        "Failed to access library service".to_string()
    })?;

    library.get_tracks().map_err(|e| {
        error!("Failed to load tracks: {}", e);
        e.to_string()
    })
}

/// Get a specific track by ID
#[tauri::command]
pub async fn get_track(id: String, state: State<'_, AppState>) -> Result<Option<Track>, String> {
    let library = state.library.lock().map_err(|e| {
        error!("Failed to acquire library lock: {}", e);
        "Failed to access library service".to_string()
    })?;

    let track_id = Uuid::parse_str(&id).map_err(|e| format!("Invalid track ID: {}", e))?;

    library.get_track(track_id).map_err(|e| {
        error!("Failed to load track {}: {}", id, e);
        e.to_string()
    })
}

/// Get all albums in the library
#[tauri::command]
pub async fn get_albums(state: State<'_, AppState>) -> Result<Vec<Album>, String> {
    let library = state.library.lock().map_err(|e| {
        error!("Failed to acquire library lock: {}", e);
        "Failed to access library service".to_string()
    })?;

    library.get_albums().map_err(|e| {
        error!("Failed to load albums: {}", e);
        e.to_string()
    })
}

/// Get a specific album by ID
#[tauri::command]
pub async fn get_album(id: String, state: State<'_, AppState>) -> Result<Option<Album>, String> {
    let library = state.library.lock().map_err(|e| {
        error!("Failed to acquire library lock: {}", e);
        "Failed to access library service".to_string()
    })?;

    let album_id = Uuid::parse_str(&id).map_err(|e| format!("Invalid album ID: {}", e))?;

    library.get_album(album_id).map_err(|e| {
        error!("Failed to load album {}: {}", id, e);
        e.to_string()
    })
}

/// Get all artists in the library
#[tauri::command]
pub async fn get_artists(state: State<'_, AppState>) -> Result<Vec<Artist>, String> {
    let library = state.library.lock().map_err(|e| {
        error!("Failed to acquire library lock: {}", e);
        "Failed to access library service".to_string()
    })?;

    library.get_artists().map_err(|e| {
        error!("Failed to load artists: {}", e);
        e.to_string()
    })
}

/// Get a specific artist by ID
#[tauri::command]
pub async fn get_artist(id: String, state: State<'_, AppState>) -> Result<Option<Artist>, String> {
    let library = state.library.lock().map_err(|e| {
        error!("Failed to acquire library lock: {}", e);
        "Failed to access library service".to_string()
    })?;

    let artist_id = Uuid::parse_str(&id).map_err(|e| format!("Invalid artist ID: {}", e))?;

    library.get_artist(artist_id).map_err(|e| {
        error!("Failed to load artist {}: {}", id, e);
        e.to_string()
    })
}

/// Get tracks by album ID
#[tauri::command]
pub async fn get_tracks_by_album(
    album_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<Track>, String> {
    let library = state.library.lock().map_err(|e| {
        error!("Failed to acquire library lock: {}", e);
        "Failed to access library service".to_string()
    })?;

    let album_uuid = Uuid::parse_str(&album_id).map_err(|e| format!("Invalid album ID: {}", e))?;

    library.get_tracks_by_album(&album_uuid).map_err(|e| {
        error!("Failed to load tracks for album {}: {}", album_id, e);
        e.to_string()
    })
}

/// Get tracks by artist ID
#[tauri::command]
pub async fn get_tracks_by_artist(
    artist_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<Track>, String> {
    let library = state.library.lock().map_err(|e| {
        error!("Failed to acquire library lock: {}", e);
        "Failed to access library service".to_string()
    })?;

    let artist_uuid =
        Uuid::parse_str(&artist_id).map_err(|e| format!("Invalid artist ID: {}", e))?;

    library.get_tracks_by_artist(&artist_uuid).map_err(|e| {
        error!("Failed to load tracks for artist {}: {}", artist_id, e);
        e.to_string()
    })
}

/// Get albums by artist ID
#[tauri::command]
pub async fn get_albums_by_artist(
    artist_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<Album>, String> {
    let library = state.library.lock().map_err(|e| {
        error!("Failed to acquire library lock: {}", e);
        "Failed to access library service".to_string()
    })?;

    let artist_uuid =
        Uuid::parse_str(&artist_id).map_err(|e| format!("Invalid artist ID: {}", e))?;

    library.get_albums_by_artist(&artist_uuid).map_err(|e| {
        error!("Failed to load albums for artist {}: {}", artist_id, e);
        e.to_string()
    })
}

/// Search the library for tracks, albums, and artists
#[tauri::command]
pub async fn search(
    query: String,
    state: State<'_, AppState>,
) -> Result<LibrarySearchResult, String> {
    if query.trim().is_empty() {
        return Ok((Vec::new(), Vec::new(), Vec::new()));
    }

    let query = query.to_lowercase();
    let library = state.library.lock().map_err(|e| {
        error!("Failed to acquire library lock: {}", e);
        "Failed to access library service".to_string()
    })?;

    // Simple case-insensitive search implementation
    library.search(&query).map_err(|e| {
        error!("Failed to search library: {}", e);
        e.to_string()
    })
}
