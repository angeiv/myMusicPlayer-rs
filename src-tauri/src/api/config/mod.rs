use crate::models::Config;
use crate::utils;
use log::{error, info};
use serde::Deserialize;
use std::path::{Path, PathBuf};
use tauri::State;
use tauri_plugin_dialog::DialogExt;

use crate::AppState;

#[tauri::command]
pub async fn get_config() -> Result<Config, String> {
    load_config().map_err(|e| {
        error!("Failed to load config: {e}");
        e
    })
}

#[tauri::command]
pub async fn save_config(config: Config) -> Result<(), String> {
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
pub async fn set_last_session(payload: SetLastSessionPayload) -> Result<(), String> {
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
pub async fn get_library_paths() -> Result<Vec<String>, String> {
    let config = load_config()?;
    Ok(config
        .library_paths
        .into_iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect())
}

#[tauri::command]
pub async fn add_library_path(path: String) -> Result<(), String> {
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

    let mut config = load_config()?;
    if config.library_paths.iter().any(|p| p == &resolved) {
        return Ok(());
    }

    info!("Adding library path: {}", resolved.display());
    config.library_paths.push(resolved);
    save_config_to_disk(&config)
}

#[tauri::command]
pub async fn remove_library_path(path: String) -> Result<(), String> {
    let requested = PathBuf::from(path);
    let resolved = resolve_path(&requested).unwrap_or(requested);

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

    let folder_string = folder_path.to_string_lossy().into_owned();
    add_library_path(folder_string).await?;

    crate::api::library::scan_directory(folder_path, state).await?;
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
    if !path.exists() {
        return Ok(Config::default());
    }

    let data = std::fs::read(&path)
        .map_err(|e| format!("Failed to read config file {}: {e}", path.display()))?;
    serde_json::from_slice(&data)
        .map_err(|e| format!("Failed to parse config file {}: {e}", path.display()))
}

fn save_config_to_disk(config: &Config) -> Result<(), String> {
    let path = config_path()?;
    let data = serde_json::to_vec_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {e}"))?;
    std::fs::write(&path, data)
        .map_err(|e| format!("Failed to write config file {}: {e}", path.display()))
}

fn resolve_path(path: &Path) -> Result<PathBuf, String> {
    match std::fs::canonicalize(path) {
        Ok(resolved) => Ok(resolved),
        Err(_) => Ok(path.to_path_buf()),
    }
}
