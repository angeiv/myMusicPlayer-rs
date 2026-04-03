//! Main entry point for the Tauri application

use anyhow::Context;
use std::sync::{Arc, Mutex};
use tauri::Manager;
use tauri_plugin_log::Target;

// Import our modules
mod api;
mod models;
pub mod native_uat;
mod services {
    pub mod audio;
    pub mod library;
    pub mod playlist;
}
mod utils;

// Re-exports
pub use models::*;

// Re-export for the prelude
pub use tauri::Builder;

/// Application state shared across all commands
pub struct AppState {
    pub audio: Arc<Mutex<services::audio::AudioService>>,
    pub library: Arc<Mutex<services::library::LibraryService>>,
    pub playlists: Arc<Mutex<services::playlist::PlaylistService>>,
    pub library_scan: Arc<Mutex<services::library::LibraryScanState>>,
    pub library_watcher: Arc<Mutex<services::library::WatcherCoordinatorState>>,
    pub library_watcher_runtime: Arc<Mutex<services::library::LibraryWatcherRuntime>>,
    pub config_lock: Arc<Mutex<()>>,
}

impl AppState {
    fn initialize() -> anyhow::Result<Self> {
        Ok(Self {
            audio: Arc::new(Mutex::new(services::audio::AudioService::new())),
            library: Arc::new(Mutex::new(
                services::library::LibraryService::new()
                    .context("Failed to initialize library service")?,
            )),
            playlists: Arc::new(Mutex::new(
                services::playlist::PlaylistService::new()
                    .map_err(anyhow::Error::msg)
                    .context("Failed to initialize playlist service")?,
            )),
            library_scan: Arc::new(Mutex::new(services::library::LibraryScanState::new_idle())),
            library_watcher: Arc::new(
                Mutex::new(services::library::WatcherCoordinatorState::new()),
            ),
            library_watcher_runtime: Arc::new(Mutex::new(
                services::library::LibraryWatcherRuntime::new(),
            )),
            config_lock: Arc::new(Mutex::new(())),
        })
    }
}

/// Initialize the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState::initialize().expect("Failed to initialize application state");

    tauri::Builder::default()
        // Setup logging
        .plugin(
            tauri_plugin_log::Builder::default()
                .targets([
                    Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("music-player".to_string()),
                    }),
                    Target::new(tauri_plugin_log::TargetKind::Stdout),
                    Target::new(tauri_plugin_log::TargetKind::Webview),
                ])
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .build::<tauri::Wry>(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        // Initialize application state
        .manage(app_state)
        // Setup
        .setup(|_app| {
            // 可选：在开发环境或启用 devtools 特性时打开 DevTools（受环境变量控制）
            #[cfg(any(debug_assertions, feature = "devtools"))]
            {
                let open_devtools = std::env::var("TAURI_OPEN_DEVTOOLS")
                    .map(|v| matches!(v.as_str(), "1" | "true" | "TRUE"))
                    .unwrap_or(false);
                if open_devtools && let Some(w) = _app.get_webview_window("main") {
                    w.open_devtools();
                    let _ = w.set_focus();
                }
            }
            // Initialize application directories
            if let Err(e) = utils::init_app_dirs() {
                log::error!("Failed to initialize application directories: {}", e);
                return Err(e.into());
            }

            if let Err(err) = crate::api::config::refresh_library_watcher_from_persisted_config(
                _app.state::<AppState>().inner(),
            ) {
                log::error!(
                    "Failed to refresh library watcher from persisted config: {}",
                    err
                );
            }

            Ok(())
        })
        // Register command handlers
        .invoke_handler(tauri::generate_handler![
            // Config commands
            crate::api::config::get_config,
            crate::api::config::get_library_paths,
            crate::api::config::save_config,
            crate::api::config::set_last_session,
            crate::api::config::add_library_path,
            crate::api::config::remove_library_path,
            crate::api::config::pick_and_add_library_folder,
            // Misc
            crate::api::misc::greet,
            // Audio commands
            crate::api::audio::play,
            crate::api::audio::play_file,
            crate::api::audio::pick_and_play_file,
            crate::api::audio::pause,
            crate::api::audio::resume,
            crate::api::audio::stop,
            crate::api::audio::seek,
            crate::api::audio::set_volume,
            crate::api::audio::get_volume,
            crate::api::audio::get_playback_state,
            crate::api::audio::get_current_track,
            crate::api::audio::toggle_play_pause,
            crate::api::audio::is_playing,
            crate::api::audio::get_visualization_data,
            crate::api::audio::next_track,
            crate::api::audio::previous_track,
            crate::api::audio::set_play_mode,
            crate::api::audio::get_play_mode,
            crate::api::audio::set_queue,
            crate::api::audio::get_queue,
            crate::api::audio::add_to_queue,
            crate::api::audio::clear_queue,
            crate::api::audio::remove_from_queue,
            crate::api::audio::get_position,
            crate::api::audio::get_output_devices,
            crate::api::audio::set_output_device,
            crate::api::audio::get_output_device,
            // Library commands
            crate::api::library::scan_directory,
            crate::api::library::has_library_tracks,
            crate::api::library::start_library_scan,
            crate::api::library::get_library_scan_status,
            crate::api::library::get_library_watcher_status,
            crate::api::library::cancel_library_scan,
            crate::api::library::get_tracks,
            crate::api::library::get_track,
            crate::api::library::get_albums,
            crate::api::library::get_album,
            crate::api::library::get_artists,
            crate::api::library::get_artist,
            crate::api::library::get_tracks_by_album,
            crate::api::library::get_tracks_by_artist,
            crate::api::library::get_albums_by_artist,
            crate::api::library::search,
            // Playlist commands
            crate::api::playlist::create_playlist,
            crate::api::playlist::delete_playlist,
            crate::api::playlist::add_to_playlist,
            crate::api::playlist::add_tracks_to_playlist,
            crate::api::playlist::remove_from_playlist,
            crate::api::playlist::get_playlist,
            crate::api::playlist::get_playlists,
            crate::api::playlist::update_playlist_metadata,
            crate::api::playlist::reorder_playlist_tracks,
            crate::api::playlist::get_playlist_tracks,
            crate::api::playlist::set_playlist_tracks,
            crate::api::playlist::get_playlist_count,
        ])
        // Run the application
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// Tests module
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_state_initializes() {
        let state = AppState::initialize().expect("app state should initialize");

        assert!(state.audio.try_lock().is_ok());
        assert!(state.library.try_lock().is_ok());
        assert!(state.playlists.try_lock().is_ok());
        assert!(state.library_scan.try_lock().is_ok());
        assert!(state.library_watcher.try_lock().is_ok());
        assert!(state.library_watcher_runtime.try_lock().is_ok());
        assert!(state.config_lock.try_lock().is_ok());
    }
}
