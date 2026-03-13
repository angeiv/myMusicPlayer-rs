#![allow(dead_code)]

//! Utility functions for the Tauri backend

use log::warn;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// Get the file name without extension from a path
pub fn file_stem(path: &Path) -> Option<String> {
    path.file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
}

/// Get the file extension from a path (without the dot)
pub fn file_extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
}

/// Get the last modified time of a file
pub fn file_modified_time(path: &Path) -> Option<SystemTime> {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .map_err(|e| {
            warn!("Failed to get modified time for {}: {}", path.display(), e);
            e
        })
        .ok()
}

/// Get the file size in bytes
pub fn file_size(path: &Path) -> Option<u64> {
    std::fs::metadata(path)
        .map(|m| m.len())
        .map_err(|e| {
            warn!("Failed to get file size for {}: {}", path.display(), e);
            e
        })
        .ok()
}

/// Get the application data directory
pub fn app_data_dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|mut dir| {
        dir.push("music-player-rs");
        dir
    })
}

/// Get the application config directory
pub fn app_config_dir() -> Option<PathBuf> {
    dirs::config_dir().map(|mut dir| {
        dir.push("music-player-rs");
        dir
    })
}

/// Ensure a directory exists, creating it if necessary
pub fn ensure_dir_exists(dir: &Path) -> std::io::Result<()> {
    if !dir.exists() {
        std::fs::create_dir_all(dir)?;
    }
    Ok(())
}

/// Format duration in seconds as HH:MM:SS or MM:SS
pub fn format_duration(seconds: u64) -> String {
    let hours = seconds / 3600;
    let minutes = (seconds % 3600) / 60;
    let seconds = seconds % 60;

    if hours > 0 {
        format!("{:02}:{:02}:{:02}", hours, minutes, seconds)
    } else {
        format!("{:02}:{:02}", minutes, seconds)
    }
}

/// Parse a duration string in the format HH:MM:SS or MM:SS into seconds
pub fn parse_duration(duration: &str) -> Option<u64> {
    let parts: Vec<&str> = duration.split(':').collect();

    match parts.len() {
        // MM:SS
        2 => {
            let minutes: u64 = parts[0].parse().ok()?;
            let seconds: u64 = parts[1].parse().ok()?;
            Some(minutes * 60 + seconds)
        }
        // HH:MM:SS
        3 => {
            let hours: u64 = parts[0].parse().ok()?;
            let minutes: u64 = parts[1].parse().ok()?;
            let seconds: u64 = parts[2].parse().ok()?;
            Some(hours * 3600 + minutes * 60 + seconds)
        }
        _ => None,
    }
}

/// Initialize application directories
pub fn init_app_dirs() -> anyhow::Result<()> {
    if let Some(data_dir) = app_data_dir() {
        ensure_dir_exists(&data_dir)?;
    }

    if let Some(config_dir) = app_config_dir() {
        ensure_dir_exists(&config_dir)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_duration() {
        assert_eq!(format_duration(0), "00:00");
        assert_eq!(format_duration(5), "00:05");
        assert_eq!(format_duration(65), "01:05");
        assert_eq!(format_duration(3600), "01:00:00");
        assert_eq!(format_duration(3665), "01:01:05");
    }

    #[test]
    fn test_parse_duration() {
        assert_eq!(parse_duration("00:00"), Some(0));
        assert_eq!(parse_duration("00:05"), Some(5));
        assert_eq!(parse_duration("01:05"), Some(65));
        assert_eq!(parse_duration("01:00:00"), Some(3600));
        assert_eq!(parse_duration("01:01:05"), Some(3665));
        assert_eq!(parse_duration("invalid"), None);
        assert_eq!(parse_duration("1:2:3:4"), None);
    }
}
