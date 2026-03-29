use crate::models::Config;
use crate::utils;
use log::{error, info};
use serde::Deserialize;
use std::path::{Path, PathBuf};
use tauri::State;
use tauri_plugin_dialog::DialogExt;

use crate::AppState;

fn lock_config(state: &AppState) -> std::sync::MutexGuard<'_, ()> {
    match state.config_lock.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            error!("Config lock poisoned; continuing with inner value");
            poisoned.into_inner()
        }
    }
}

#[tauri::command]
pub async fn get_config(state: State<'_, AppState>) -> Result<Config, String> {
    let _guard = lock_config(&state);
    load_config().map_err(|e| {
        error!("Failed to load config: {e}");
        e
    })
}

#[tauri::command]
pub async fn save_config(config: Config, state: State<'_, AppState>) -> Result<(), String> {
    let _guard = lock_config(&state);
    save_config_to_disk(&config).map_err(|e| {
        error!("Failed to save config: {e}");
        e
    })
}

#[derive(Debug, Deserialize)]
pub struct SetLastSessionPayload {
    #[serde(alias = "lastTrackId")]
    pub last_track_id: Option<String>,
    #[serde(alias = "lastPositionSeconds")]
    pub last_position_seconds: u64,
}

#[tauri::command]
pub async fn set_last_session(
    payload: SetLastSessionPayload,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let _guard = lock_config(&state);

    let mut config = load_config()?;
    config.last_track_id = payload.last_track_id;
    config.last_position_seconds = if config.last_track_id.is_some() {
        payload.last_position_seconds
    } else {
        0
    };
    save_config_to_disk(&config)
}

#[tauri::command]
pub async fn get_library_paths(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let _guard = lock_config(&state);

    let config = load_config()?;
    Ok(config
        .library_paths
        .into_iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect())
}

#[tauri::command]
pub async fn add_library_path(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let requested = PathBuf::from(path);
    let resolved = resolve_path(&requested).map_err(|e| {
        error!(
            "Failed to resolve library path {}: {e}",
            requested.display()
        );
        e
    })?;

    if !resolved.is_dir() {
        return Err(format!(
            "Selected path is not a directory: {}",
            resolved.display()
        ));
    }

    add_library_path_inner(&state, resolved)
}

fn add_library_path_inner(state: &AppState, resolved: PathBuf) -> Result<(), String> {
    let _guard = lock_config(state);

    let mut config = load_config()?;
    if config.library_paths.iter().any(|p| p == &resolved) {
        return Ok(());
    }

    info!("Adding library path: {}", resolved.display());
    config.library_paths.push(resolved);
    save_config_to_disk(&config)
}

#[tauri::command]
pub async fn remove_library_path(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let requested = PathBuf::from(path);
    let resolved = resolve_path(&requested).unwrap_or(requested);

    let _guard = lock_config(&state);

    let mut config = load_config()?;
    let before = config.library_paths.len();
    config.library_paths.retain(|p| p != &resolved);

    if config.library_paths.len() == before {
        return Ok(());
    }

    info!("Removed library path: {}", resolved.display());
    save_config_to_disk(&config)
}

#[tauri::command]
pub async fn pick_and_add_library_folder(
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let selected = window.dialog().file().blocking_pick_folder();

    let Some(folder_path) = selected else {
        return Ok(());
    };

    let folder_path = folder_path
        .into_path()
        .map_err(|e| format!("Failed to resolve selected folder path: {e}"))?;

    let resolved = resolve_path(&folder_path).unwrap_or(folder_path.clone());
    if !resolved.is_dir() {
        return Err(format!(
            "Selected path is not a directory: {}",
            resolved.display()
        ));
    }

    add_library_path_inner(&state, resolved.clone())?;
    crate::api::library::scan_directory(resolved, state).await?;
    Ok(())
}

fn config_path() -> Result<PathBuf, String> {
    let dir =
        utils::app_config_dir().ok_or_else(|| "Failed to locate config directory".to_string())?;
    utils::ensure_dir_exists(&dir)
        .map_err(|e| format!("Failed to create config directory {}: {e}", dir.display()))?;
    Ok(dir.join("config.json"))
}

fn load_config() -> Result<Config, String> {
    let path = config_path()?;
    load_config_from_path(&path)
}

fn save_config_to_disk(config: &Config) -> Result<(), String> {
    let path = config_path()?;
    save_config_to_path_atomic(&path, config)
}

fn load_config_from_path(path: &Path) -> Result<Config, String> {
    let data = match std::fs::read(path) {
        Ok(data) => data,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Config::default());
        }
        Err(err) => {
            return Err(format!(
                "Failed to read config file {}: {err}",
                path.display()
            ));
        }
    };

    match serde_json::from_slice(&data) {
        Ok(config) => Ok(config),
        Err(e) => {
            error!(
                "Failed to parse config file {}: {e}. Backing up and falling back to defaults.",
                path.display()
            );

            let default_config = Config::default();

            let file_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("config.json");
            let backup_path = path.with_file_name(format!("{file_name}.broken-{}", now_unix_ms()));

            if let Err(err) = std::fs::write(&backup_path, &data) {
                error!(
                    "Failed to write broken config backup {}: {err}",
                    backup_path.display()
                );
            } else {
                info!(
                    "Backed up broken config {} to {}",
                    path.display(),
                    backup_path.display()
                );
            }

            if let Err(err) = save_config_to_path_atomic(path, &default_config) {
                error!(
                    "Failed to write repaired config file {}: {err}",
                    path.display()
                );
            }

            let dir = path.parent().unwrap_or_else(|| Path::new("."));
            cleanup_broken_backups(dir, 5);

            Ok(default_config)
        }
    }
}

fn save_config_to_path_atomic(path: &Path, config: &Config) -> Result<(), String> {
    let dir = path.parent().ok_or_else(|| {
        format!(
            "Failed to determine parent directory for config file {}",
            path.display()
        )
    })?;

    utils::ensure_dir_exists(dir)
        .map_err(|e| format!("Failed to create config directory {}: {e}", dir.display()))?;

    let data = serde_json::to_vec_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {e}"))?;

    let file_name = path.file_name().and_then(|n| n.to_str()).ok_or_else(|| {
        format!(
            "Failed to determine file name for config file {}",
            path.display()
        )
    })?;
    let tmp_path = dir.join(format!("{file_name}.tmp"));

    std::fs::write(&tmp_path, &data).map_err(|e| {
        format!(
            "Failed to write temp config file {}: {e}",
            tmp_path.display()
        )
    })?;

    match std::fs::rename(&tmp_path, path) {
        Ok(()) => Ok(()),
        Err(rename_err) => {
            // On Windows, rename-over-existing may fail with "already exists"; best-effort
            // fallback: remove then rename. Only do this when we are confident the failure is due
            // to the destination existing to avoid deleting a good config on unrelated errors.
            let dest_exists_err = rename_err.kind() == std::io::ErrorKind::AlreadyExists
                || (cfg!(windows) && rename_err.raw_os_error() == Some(183));

            if dest_exists_err && path.exists() {
                std::fs::remove_file(path).map_err(|e| {
                    let _ = std::fs::remove_file(&tmp_path);
                    format!(
                        "Failed to remove existing config file {}: {e}",
                        path.display()
                    )
                })?;
                std::fs::rename(&tmp_path, path).map_err(|e| {
                    let _ = std::fs::remove_file(&tmp_path);
                    format!(
                        "Failed to move temp config file {} to {}: {e}",
                        tmp_path.display(),
                        path.display()
                    )
                })
            } else {
                let _ = std::fs::remove_file(&tmp_path);
                Err(format!(
                    "Failed to move temp config file {} to {}: {rename_err}",
                    tmp_path.display(),
                    path.display()
                ))
            }
        }
    }
}

fn now_unix_ms() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn cleanup_broken_backups(dir: &Path, keep: usize) {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(err) => {
            error!("Failed to read config directory {}: {err}", dir.display());
            return;
        }
    };

    let mut backups: Vec<(u128, PathBuf)> = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let Some(rest) = name.strip_prefix("config.json.broken-") else {
            continue;
        };

        let sort_key = match rest.parse::<u128>() {
            Ok(ts) => ts,
            Err(_) => entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|mtime| mtime.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis())
                .unwrap_or(0),
        };

        backups.push((sort_key, entry.path()));
    }

    // Newest first.
    backups.sort_by(|(a, _), (b, _)| b.cmp(a));

    if backups.len() <= keep {
        return;
    }

    for (_, path) in backups.into_iter().skip(keep) {
        if let Err(err) = std::fs::remove_file(&path) {
            error!(
                "Failed to remove broken config backup {}: {err}",
                path.display()
            );
        }
    }
}

fn resolve_path(path: &Path) -> Result<PathBuf, String> {
    match std::fs::canonicalize(path) {
        Ok(resolved) => Ok(resolved),
        Err(_) => Ok(path.to_path_buf()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn corrupt_config_is_backed_up_and_repaired() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(&path, b"{not json").unwrap();

        let config = load_config_from_path(&path).expect("should repair and return default");
        assert_eq!(config.theme, "system");
        assert_eq!(config.play_mode, "sequential");

        // new config.json should be valid JSON
        let repaired = std::fs::read(&path).unwrap();
        let decoded: Config = serde_json::from_slice(&repaired).unwrap();
        assert_eq!(decoded.play_mode, "sequential");

        // backup exists
        let backups: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|name| name.starts_with("config.json.broken-"))
            .collect();
        assert_eq!(backups.len(), 1);
    }

    #[test]
    fn missing_config_returns_default() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.json");
        assert!(!path.exists());

        let config = load_config_from_path(&path).expect("missing file should return default");
        assert_eq!(config.play_mode, "sequential");
    }

    #[test]
    fn cleanup_broken_backups_keeps_latest_5() {
        let dir = tempdir().unwrap();

        for i in 0..6u128 {
            let path = dir.path().join(format!("config.json.broken-{}", 1000 + i));
            std::fs::write(path, b"broken").unwrap();
        }

        let non_numeric = dir.path().join("config.json.broken-not-a-number");
        std::fs::write(non_numeric, b"broken").unwrap();

        cleanup_broken_backups(dir.path(), 5);

        let backups: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|name| name.starts_with("config.json.broken-"))
            .collect();
        assert_eq!(backups.len(), 5);
    }
}
