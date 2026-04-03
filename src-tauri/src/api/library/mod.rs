//! Library-related Tauri commands for the music player

use log::{error, info};
use std::{
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::Ordering,
    },
};
use tauri::State;
use uuid::Uuid;

use crate::AppState;
use crate::models::{Album, Artist, Track};
use crate::services::library::{
    LibraryScanState, LibraryService, ScanErrorKind, ScanErrorSample, ScanMode, ScanPhase,
    ScanStatus, WatcherCoordinatorState, dedupe_overlapping_roots, is_dangerous_root,
    is_scan_phase_active, now_ms,
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

type ScanTerminalHook = Arc<dyn Fn(ScanPhase) + Send + Sync + 'static>;

fn watcher_terminal_hook(
    library: Arc<Mutex<LibraryService>>,
    library_scan: Arc<Mutex<LibraryScanState>>,
    library_watcher: Arc<Mutex<WatcherCoordinatorState>>,
) -> ScanTerminalHook {
    Arc::new(move |phase| {
        let library_for_launch = library.clone();
        let library_scan_for_launch = library_scan.clone();
        let watcher_for_launch = library_watcher.clone();

        let mut watcher = match library_watcher.lock() {
            Ok(guard) => guard,
            Err(poisoned) => {
                error!("Watcher state lock poisoned during scan callback");
                poisoned.into_inner()
            }
        };

        if let Err(err) = watcher.handle_scan_terminal(phase, |roots| {
            launch_library_scan(
                roots,
                Some(ScanMode::Incremental),
                library_for_launch.clone(),
                library_scan_for_launch.clone(),
                Some(watcher_terminal_hook(
                    library_for_launch.clone(),
                    library_scan_for_launch.clone(),
                    watcher_for_launch.clone(),
                )),
            )
        }) {
            error!("Failed to queue watcher follow-up scan: {}", err);
        }
    })
}

fn resolve_scan_mode(
    mode: Option<ScanMode>,
    library: &Arc<Mutex<LibraryService>>,
) -> Result<ScanMode, String> {
    match mode {
        Some(mode) => Ok(mode),
        None => {
            let library = library.lock().map_err(|e| {
                error!("Failed to acquire library lock: {}", e);
                "Failed to access library service".to_string()
            })?;

            if library.has_library_tracks().map_err(|e| {
                error!("Failed to query library occupancy: {}", e);
                e.to_string()
            })? {
                Ok(ScanMode::Incremental)
            } else {
                Ok(ScanMode::Full)
            }
        }
    }
}

fn launch_library_scan(
    paths: Vec<PathBuf>,
    mode: Option<ScanMode>,
    library: Arc<Mutex<LibraryService>>,
    library_scan: Arc<Mutex<LibraryScanState>>,
    on_terminal: Option<ScanTerminalHook>,
) -> Result<(), String> {
    let resolved_mode = resolve_scan_mode(mode, &library)?;

    info!(
        "Starting {:?} library scan for {} path(s)",
        resolved_mode,
        paths.len()
    );

    {
        let scan = library_scan.lock().map_err(|e| {
            error!("Failed to acquire library_scan lock: {}", e);
            "Failed to access library scan state".to_string()
        })?;

        if is_scan_phase_active(scan.status.phase) {
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
        let mut scan = library_scan.lock().map_err(|e| {
            error!("Failed to acquire library_scan lock: {}", e);
            "Failed to access library scan state".to_string()
        })?;

        if is_scan_phase_active(scan.status.phase) {
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
        let mut scan = library_scan.lock().map_err(|e| {
            error!("Failed to acquire library_scan lock: {}", e);
            "Failed to access library scan state".to_string()
        })?;

        if is_scan_phase_active(scan.status.phase) {
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

    let library_for_thread = library.clone();
    let library_scan_for_thread = library_scan.clone();

    std::thread::spawn(move || {
        let scan_result = {
            let mut library = match library_for_thread.lock() {
                Ok(guard) => guard,
                Err(poisoned) => {
                    error!("Library lock poisoned during scan");
                    poisoned.into_inner()
                }
            };

            let library_scan_for_progress = library_scan_for_thread.clone();
            library.scan_roots_with_control(&valid_roots, &cancel_flag, sample_limit, |progress| {
                let mut scan = match library_scan_for_progress.lock() {
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
                let phase = if summary.cancelled {
                    ScanPhase::Cancelled
                } else {
                    ScanPhase::Completed
                };

                {
                    let mut scan = match library_scan_for_thread.lock() {
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
                    scan.status.sample_errors.extend(summary.sample_errors);
                    scan.status.sample_errors.truncate(sample_limit);
                    scan.status.error_count = invalid_count + summary.error_count;
                }

                if let Some(callback) = on_terminal.as_ref() {
                    callback(phase);
                }
            }
            Err(err) => {
                error!("Library scan failed: {}", err);

                {
                    let mut scan = match library_scan_for_thread.lock() {
                        Ok(guard) => guard,
                        Err(poisoned) => poisoned.into_inner(),
                    };

                    scan.status.phase = ScanPhase::Failed;
                    scan.status.ended_at_ms = Some(now_ms());
                    scan.status.error_count += 1;
                    scan.status.sample_errors.push(ScanErrorSample {
                        path: "<scan>".to_string(),
                        message: err.to_string(),
                        kind: ScanErrorKind::Persist,
                    });

                    if scan.status.sample_errors.len() > sample_limit {
                        let excess = scan.status.sample_errors.len() - sample_limit;
                        scan.status.sample_errors.drain(0..excess);
                    }
                }

                if let Some(callback) = on_terminal.as_ref() {
                    callback(ScanPhase::Failed);
                }
            }
        }
    });

    Ok(())
}

#[allow(dead_code)]
pub(crate) fn schedule_watcher_dirty_roots(
    state: &AppState,
    dirty_roots: &[PathBuf],
) -> Result<(), String> {
    let scan_phase = {
        let scan = state.library_scan.lock().map_err(|e| {
            error!("Failed to acquire library_scan lock: {}", e);
            "Failed to access library scan state".to_string()
        })?;
        scan.status.phase
    };

    let library = state.library.clone();
    let library_scan = state.library_scan.clone();
    let library_watcher = state.library_watcher.clone();

    let mut watcher = state.library_watcher.lock().map_err(|e| {
        error!("Failed to acquire watcher state lock: {}", e);
        "Failed to access watcher coordinator state".to_string()
    })?;

    watcher.schedule_dirty_roots(scan_phase, dirty_roots, |roots| {
        launch_library_scan(
            roots,
            Some(ScanMode::Incremental),
            library.clone(),
            library_scan.clone(),
            Some(watcher_terminal_hook(
                library.clone(),
                library_scan.clone(),
                library_watcher.clone(),
            )),
        )
    })?;

    Ok(())
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
    launch_library_scan(
        paths,
        mode,
        state.library.clone(),
        state.library_scan.clone(),
        Some(watcher_terminal_hook(
            state.library.clone(),
            state.library_scan.clone(),
            state.library_watcher.clone(),
        )),
    )
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
