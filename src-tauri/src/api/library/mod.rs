//! Library-related Tauri commands for the music player

use log::{error, info};
use std::{path::PathBuf, sync::atomic::Ordering};
use tauri::State;
use uuid::Uuid;

use crate::AppState;
use crate::models::{Album, Artist, Track};
use crate::services::library::{
    ScanErrorKind, ScanErrorSample, ScanMode, ScanPhase, ScanStatus, dedupe_overlapping_roots,
    is_dangerous_root, now_ms,
};

type LibrarySearchResult = (Vec<Track>, Vec<Album>, Vec<Artist>);

const SAMPLE_ERROR_LIMIT: usize = 20;

fn push_error_sample(
    error_count: &mut u64,
    sample_errors: &mut Vec<ScanErrorSample>,
    sample_limit: usize,
    kind: ScanErrorKind,
    path: String,
    message: String,
) {
    *error_count += 1;

    if sample_errors.len() < sample_limit {
        sample_errors.push(ScanErrorSample {
            path,
            message,
            kind,
        });
    }
}

fn reset_scan_status(
    status: &mut ScanStatus,
    phase: ScanPhase,
    mode: Option<ScanMode>,
    started_at_ms: Option<i64>,
    error_count: u64,
    sample_errors: Vec<ScanErrorSample>,
) {
    status.phase = phase;
    status.mode = mode;
    status.started_at_ms = started_at_ms;
    status.ended_at_ms = None;
    status.current_path = None;
    status.processed_files = 0;
    status.inserted_tracks = 0;
    status.changed_tracks = 0;
    status.unchanged_files = 0;
    status.restored_tracks = 0;
    status.missing_tracks = 0;
    status.error_count = error_count;
    status.sample_errors = sample_errors;
}

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

/// Return whether the library currently has any persisted tracks.
#[tauri::command]
pub async fn has_library_tracks(state: State<'_, AppState>) -> Result<bool, String> {
    let library = state.library.lock().map_err(|e| {
        error!("Failed to acquire library lock: {}", e);
        "Failed to access library service".to_string()
    })?;

    library.has_library_tracks().map_err(|e| {
        error!("Failed to query library occupancy: {}", e);
        e.to_string()
    })
}

/// Get current library scan status
#[tauri::command]
pub async fn get_library_scan_status(state: State<'_, AppState>) -> Result<ScanStatus, String> {
    let scan = state.library_scan.lock().map_err(|e| {
        error!("Failed to acquire library_scan lock: {}", e);
        "Failed to access library scan state".to_string()
    })?;

    Ok(scan.status.clone())
}

/// Request cancellation of a running library scan
#[tauri::command]
pub async fn cancel_library_scan(state: State<'_, AppState>) -> Result<(), String> {
    let mut scan = state.library_scan.lock().map_err(|e| {
        error!("Failed to acquire library_scan lock: {}", e);
        "Failed to access library scan state".to_string()
    })?;

    if scan.status.phase == ScanPhase::Running {
        scan.cancel_flag.store(true, Ordering::SeqCst);
        scan.status.phase = ScanPhase::Cancelling;
    }

    Ok(())
}

/// Start a library scan for one or more roots.
#[tauri::command]
pub async fn start_library_scan(
    paths: Vec<PathBuf>,
    mode: Option<ScanMode>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let resolved_mode = match mode {
        Some(mode) => mode,
        None => {
            let library = state.library.lock().map_err(|e| {
                error!("Failed to acquire library lock: {}", e);
                "Failed to access library service".to_string()
            })?;

            library.has_library_tracks().map_err(|e| {
                error!("Failed to query library occupancy: {}", e);
                e.to_string()
            })?
            .then_some(ScanMode::Incremental)
            .unwrap_or(ScanMode::Full)
        }
    };

    info!(
        "Starting {:?} library scan for {} path(s)",
        resolved_mode,
        paths.len()
    );

    // Short-lock: reject if there's already an in-progress scan.
    {
        let scan = state.library_scan.lock().map_err(|e| {
            error!("Failed to acquire library_scan lock: {}", e);
            "Failed to access library scan state".to_string()
        })?;

        if matches!(
            scan.status.phase,
            ScanPhase::Running | ScanPhase::Cancelling
        ) {
            return Err("Library scan already running".to_string());
        }
    }

    let sample_limit = SAMPLE_ERROR_LIMIT;

    let mut valid_roots: Vec<PathBuf> = Vec::new();
    let mut invalid_count = 0u64;
    let mut invalid_samples: Vec<ScanErrorSample> = Vec::new();

    for raw_path in paths {
        let path = match raw_path.canonicalize() {
            Ok(canon) => canon,
            Err(_) => raw_path,
        };

        if !path.exists() || !path.is_dir() {
            push_error_sample(
                &mut invalid_count,
                &mut invalid_samples,
                sample_limit,
                ScanErrorKind::InvalidPath,
                path.display().to_string(),
                "Root path does not exist or is not a directory".to_string(),
            );
            continue;
        }

        if is_dangerous_root(&path) {
            push_error_sample(
                &mut invalid_count,
                &mut invalid_samples,
                sample_limit,
                ScanErrorKind::InvalidPath,
                path.display().to_string(),
                "Root path is considered dangerous and will not be scanned".to_string(),
            );
            continue;
        }

        valid_roots.push(path);
    }

    let valid_roots = dedupe_overlapping_roots(&valid_roots);

    if valid_roots.is_empty() {
        let mut scan = state.library_scan.lock().map_err(|e| {
            error!("Failed to acquire library_scan lock: {}", e);
            "Failed to access library scan state".to_string()
        })?;

        // Re-check under lock in case another request started a scan while we validated paths.
        if matches!(
            scan.status.phase,
            ScanPhase::Running | ScanPhase::Cancelling
        ) {
            return Err("Library scan already running".to_string());
        }

        scan.cancel_flag.store(false, Ordering::SeqCst);

        reset_scan_status(
            &mut scan.status,
            ScanPhase::Idle,
            Some(resolved_mode),
            None,
            invalid_count,
            invalid_samples,
        );

        return Err("No valid scan paths".to_string());
    }

    let started_at_ms = now_ms();

    let cancel_flag = {
        let mut scan = state.library_scan.lock().map_err(|e| {
            error!("Failed to acquire library_scan lock: {}", e);
            "Failed to access library scan state".to_string()
        })?;

        // Re-check under lock in case a second request raced in.
        if matches!(
            scan.status.phase,
            ScanPhase::Running | ScanPhase::Cancelling
        ) {
            return Err("Library scan already running".to_string());
        }

        scan.cancel_flag.store(false, Ordering::SeqCst);

        reset_scan_status(
            &mut scan.status,
            ScanPhase::Running,
            Some(resolved_mode),
            Some(started_at_ms),
            invalid_count,
            invalid_samples,
        );

        scan.cancel_flag.clone()
    };

    // Clone Arcs BEFORE moving into the background thread.
    let library = state.library.clone();
    let library_scan = state.library_scan.clone();

    std::thread::spawn(move || {
        let scan_result = {
            let mut library = match library.lock() {
                Ok(guard) => guard,
                Err(poisoned) => {
                    error!("Library lock poisoned during scan");
                    poisoned.into_inner()
                }
            };

            library.scan_roots_with_control(&valid_roots, &cancel_flag, sample_limit, |progress| {
                // IMPORTANT: keep the lock short; never hold it across the scan loop.
                let mut scan = match library_scan.lock() {
                    Ok(guard) => guard,
                    Err(poisoned) => poisoned.into_inner(),
                };

                scan.status.processed_files = progress.processed_files;
                scan.status.inserted_tracks = progress.inserted_tracks;
                scan.status.changed_tracks = progress.changed_tracks;
                scan.status.unchanged_files = progress.unchanged_files;
                scan.status.restored_tracks = progress.restored_tracks;
                scan.status.missing_tracks = progress.missing_tracks;
                scan.status.error_count = invalid_count + progress.error_count;
                scan.status.current_path = Some(progress.current_path.display().to_string());
            })
        };

        match scan_result {
            Ok(summary) => {
                let ended_at_ms = now_ms();

                let cancelled = summary.cancelled;
                let error_count = summary.error_count;
                let sample_errors = summary.sample_errors;

                let phase = if cancelled {
                    ScanPhase::Cancelled
                } else {
                    ScanPhase::Completed
                };

                let mut scan = match library_scan.lock() {
                    Ok(guard) => guard,
                    Err(poisoned) => poisoned.into_inner(),
                };

                scan.status.phase = phase;
                scan.status.ended_at_ms = Some(ended_at_ms);
                scan.status.processed_files = summary.processed_files;
                scan.status.inserted_tracks = summary.inserted_tracks;
                scan.status.changed_tracks = summary.changed_tracks;
                scan.status.unchanged_files = summary.unchanged_files;
                scan.status.restored_tracks = summary.restored_tracks;
                scan.status.missing_tracks = summary.missing_tracks;

                scan.status.sample_errors.extend(sample_errors);
                scan.status.sample_errors.truncate(sample_limit);
                scan.status.error_count = invalid_count + error_count;
            }
            Err(err) => {
                error!("Library scan failed: {}", err);

                let ended_at_ms = now_ms();

                let mut scan = match library_scan.lock() {
                    Ok(guard) => guard,
                    Err(poisoned) => poisoned.into_inner(),
                };

                scan.status.phase = ScanPhase::Failed;
                scan.status.ended_at_ms = Some(ended_at_ms);

                let status = &mut scan.status;

                status.error_count += 1;
                status.sample_errors.push(ScanErrorSample {
                    path: "<scan>".to_string(),
                    message: err.to_string(),
                    kind: ScanErrorKind::Persist,
                });

                if status.sample_errors.len() > sample_limit {
                    let excess = status.sample_errors.len() - sample_limit;
                    status.sample_errors.drain(0..excess);
                }
            }
        }
    });

    Ok(())
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
