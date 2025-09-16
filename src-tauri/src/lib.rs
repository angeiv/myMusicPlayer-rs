//! Main entry point for the Tauri application

use std::sync::{Arc, Mutex};
use tauri::Manager;
use tauri_plugin_log::Target;

// Import our modules
mod api;
mod models;
mod services {
    pub mod audio;
    pub mod library;
    pub mod playlist;
}
mod utils;

// Re-exports
pub use models::*;
pub use services::*;

// Re-export for the prelude
pub use tauri::Builder;

/// Application state shared across all commands
#[derive(Default)]
pub struct AppState {
    pub audio: Arc<Mutex<services::audio::AudioService>>,
    pub library: Arc<Mutex<services::library::LibraryService>>,
    pub playlists: Arc<Mutex<services::playlist::PlaylistService>>,
}

/// Initialize the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
        .manage(AppState {
            audio: Arc::new(Mutex::new(services::audio::AudioService::new())),
            library: Arc::new(Mutex::new(services::library::LibraryService::new())),
            playlists: Arc::new(Mutex::new(services::playlist::PlaylistService::new())),
        })
        // Setup
        .setup(|app| {
            // Initialize application directories
            if let Err(e) = utils::init_app_dirs() {
                log::error!("Failed to initialize application directories: {}", e);
                return Err(e.into());
            }

            Ok(())
        })
        // Register command handlers
        .invoke_handler(tauri::generate_handler![
            // Config commands
            crate::api::config::get_config,
            crate::api::config::save_config,
            crate::api::config::add_library_path,
            crate::api::config::remove_library_path,
            // Audio commands
            crate::api::audio::play,
            crate::api::audio::play_file,
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
            // Library commands
            crate::api::library::scan_directory,
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
    use tauri::Manager;
    use tauri::test::{mock_context, noop_assets};

    #[test]
    fn test_app_initialization() {
        // This is a simple test to verify the app can be created
        let app = tauri::Builder::default()
            .manage(AppState {
                audio: Arc::new(Mutex::new(services::audio::AudioService::new())),
                library: Arc::new(Mutex::new(services::library::LibraryService::new())),
                playlists: Arc::new(Mutex::new(services::playlist::PlaylistService::new())),
            })
            .build(mock_context!())
            .unwrap();

        assert!(app.state::<AppState>().audio.try_lock().is_ok());
        assert!(app.state::<AppState>().library.try_lock().is_ok());
        assert!(app.state::<AppState>().playlists.try_lock().is_ok());
    }
}
