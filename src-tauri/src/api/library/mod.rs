//! Library-related Tauri commands for the music player

use tauri::State;
use std::path::PathBuf;
use std::sync::Mutex;
use log::{error, info};
use uuid::Uuid;

use crate::models::{Track, Album, Artist};
use crate::AppState;

/// Scan a directory for music files and add them to the library
#[tauri::command]
pub async fn scan_directory(
    path: PathBuf,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    info!("Scanning directory: {}", path.display());
    
    let mut library = state.library.lock()
        .map_err(|e| {
            error!("Failed to acquire library lock: {}", e);
            "Failed to access library service".to_string()
        })?;
    
    library.scan_directory(&path)
        .map_err(|e| {
            error!("Failed to scan directory: {}", e);
            format!("Failed to scan directory: {}", e)
        })
}

/// Get all tracks in the library
#[tauri::command]
pub async fn get_tracks(
    state: State<'_, AppState>,
) -> Result<Vec<Track>, String> {
    let library = state.library.lock()
        .map_err(|e| {
            error!("Failed to acquire library lock: {}", e);
            "Failed to access library service".to_string()
        })?;
    
    Ok(library.get_tracks())
}

/// Get a specific track by ID
#[tauri::command]
pub async fn get_track(
    id: String,
    state: State<'_, AppState>,
) -> Result<Option<Track>, String> {
    let library = state.library.lock()
        .map_err(|e| {
            error!("Failed to acquire library lock: {}", e);
            "Failed to access library service".to_string()
        })?;
    
    let track_id = Uuid::parse_str(&id)
        .map_err(|e| format!("Invalid track ID: {}", e))?;
    
    Ok(library.get_track(track_id).cloned())
}

/// Get all albums in the library
#[tauri::command]
pub async fn get_albums(
    state: State<'_, AppState>,
) -> Result<Vec<Album>, String> {
    let library = state.library.lock()
        .map_err(|e| {
            error!("Failed to acquire library lock: {}", e);
            "Failed to access library service".to_string()
        })?;
    
    Ok(library.get_albums())
}

/// Get a specific album by ID
#[tauri::command]
pub async fn get_album(
    id: String,
    state: State<'_, AppState>,
) -> Result<Option<Album>, String> {
    let library = state.library.lock()
        .map_err(|e| {
            error!("Failed to acquire library lock: {}", e);
            "Failed to access library service".to_string()
        })?;
    
    let album_id = Uuid::parse_str(&id)
        .map_err(|e| format!("Invalid album ID: {}", e))?;
    
    Ok(library.get_album(album_id).cloned())
}

/// Get all artists in the library
#[tauri::command]
pub async fn get_artists(
    state: State<'_, AppState>,
) -> Result<Vec<Artist>, String> {
    let library = state.library.lock()
        .map_err(|e| {
            error!("Failed to acquire library lock: {}", e);
            "Failed to access library service".to_string()
        })?;
    
    Ok(library.get_artists())
}

/// Get a specific artist by ID
#[tauri::command]
pub async fn get_artist(
    id: String,
    state: State<'_, AppState>,
) -> Result<Option<Artist>, String> {
    let library = state.library.lock()
        .map_err(|e| {
            error!("Failed to acquire library lock: {}", e);
            "Failed to access library service".to_string()
        })?;
    
    let artist_id = Uuid::parse_str(&id)
        .map_err(|e| format!("Invalid artist ID: {}", e))?;
    
    Ok(library.get_artist(artist_id).cloned())
}

/// Get tracks by album ID
#[tauri::command]
pub async fn get_tracks_by_album(
    album_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<Track>, String> {
    let library = state.library.lock()
        .map_err(|e| {
            error!("Failed to acquire library lock: {}", e);
            "Failed to access library service".to_string()
        })?;
    
    let album_uuid = Uuid::parse_str(&album_id)
        .map_err(|e| format!("Invalid album ID: {}", e))?;
    
    Ok(library.get_tracks_by_album(&album_uuid))
}

/// Get tracks by artist ID
#[tauri::command]
pub async fn get_tracks_by_artist(
    artist_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<Track>, String> {
    let library = state.library.lock()
        .map_err(|e| {
            error!("Failed to acquire library lock: {}", e);
            "Failed to access library service".to_string()
        })?;
    
    let artist_uuid = Uuid::parse_str(&artist_id)
        .map_err(|e| format!("Invalid artist ID: {}", e))?;
    
    Ok(library.get_tracks_by_artist(&artist_uuid))
}

/// Get albums by artist ID
#[tauri::command]
pub async fn get_albums_by_artist(
    artist_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<Album>, String> {
    let library = state.library.lock()
        .map_err(|e| {
            error!("Failed to acquire library lock: {}", e);
            "Failed to access library service".to_string()
        })?;
    
    let artist_uuid = Uuid::parse_str(&artist_id)
        .map_err(|e| format!("Invalid artist ID: {}", e))?;
    
    Ok(library.get_albums_by_artist(&artist_uuid))
}

/// Search the library for tracks, albums, and artists
#[tauri::command]
pub async fn search(
    query: String,
    state: State<'_, AppState>,
) -> Result<(Vec<Track>, Vec<Album>, Vec<Artist>), String> {
    if query.trim().is_empty() {
        return Ok((Vec::new(), Vec::new(), Vec::new()));
    }
    
    let query = query.to_lowercase();
    let library = state.library.lock()
        .map_err(|e| {
            error!("Failed to acquire library lock: {}", e);
            "Failed to access library service".to_string()
        })?;
    
    // Simple case-insensitive search implementation
    let tracks: Vec<Track> = library.get_tracks()
        .iter()
        .filter(|track| 
            track.title.to_lowercase().contains(&query) ||
            track.artist.as_ref().map_or(false, |a| a.to_lowercase().contains(&query)) ||
            track.album.as_ref().map_or(false, |a| a.to_lowercase().contains(&query)))
        .cloned()
        .collect();
    
    let albums: Vec<Album> = library.get_albums()
        .iter()
        .filter(|album| 
            album.title.to_lowercase().contains(&query) ||
            album.artist.to_lowercase().contains(&query))
        .cloned()
        .collect();
    
    let artists: Vec<Artist> = library.get_artists()
        .iter()
        .filter(|artist| artist.name.to_lowercase().contains(&query))
        .cloned()
        .collect();
    
    Ok((tracks, albums, artists))
}
