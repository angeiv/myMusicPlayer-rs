//! Library service for managing music library and metadata

use chrono::Utc;
use lofty::{
    file::AudioFile,
    prelude::{ItemKey, TaggedFileExt},
    read_from_path,
    tag::Accessor,
};
use log::{debug, error, info, warn};
use rayon::prelude::*;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;
use uuid::Uuid;
use walkdir::WalkDir;

use crate::models::{Album, Artist, Track};
use crate::utils;

/// Supported audio file extensions
const SUPPORTED_EXTENSIONS: &[&str] = &[
    "mp3", "flac", "m4a", "m4b", "m4p", "m4r", "m4v", "mp4", "ogg", "oga", "wav", "aiff", "aif",
    "aifc",
];

/// Library service for managing music files and metadata
pub struct LibraryService {
    tracks: HashMap<Uuid, Track>,
    albums: HashMap<Uuid, Album>,
    artists: HashMap<Uuid, Artist>,
    track_paths: HashMap<PathBuf, Uuid>,
    paths: Vec<PathBuf>,
    last_scan: Option<SystemTime>,
    track_by_id: HashMap<Uuid, usize>, // Maps track ID to index in tracks vector
    album_by_name_artist: HashMap<(String, String), Uuid>, // Maps (album, artist) to album ID
    artist_by_name: HashMap<String, Uuid>, // Maps artist name to artist ID
}

impl Default for LibraryService {
    fn default() -> Self {
        Self {
            tracks: HashMap::new(),
            albums: HashMap::new(),
            artists: HashMap::new(),
            track_paths: HashMap::new(),
            paths: Vec::new(),
            last_scan: None,
            track_by_id: HashMap::new(),
            album_by_name_artist: HashMap::new(),
            artist_by_name: HashMap::new(),
        }
    }
}

impl LibraryService {
    /// Create a new LibraryService
    pub fn new() -> Self {
        Self::default()
    }

    /// Scan a directory for music files and extract metadata
    pub fn scan_directory<P: AsRef<Path>>(&mut self, path: P) -> Result<usize, String> {
        let path = path.as_ref();
        info!("Scanning directory: {}", path.display());

        if !path.exists() {
            return Err(format!("Path does not exist: {}", path.display()));
        }

        if !path.is_dir() {
            return Err(format!("Path is not a directory: {}", path.display()));
        }

        // Collect all supported audio files
        let mut files = Vec::new();

        for entry in WalkDir::new(path)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
        {
            let path = entry.path();
            if let Some(ext) = path.extension() {
                if let Some(ext_str) = ext.to_str() {
                    if SUPPORTED_EXTENSIONS.contains(&ext_str.to_lowercase().as_str()) {
                        files.push(path.to_path_buf());
                    }
                }
            }
        }

        info!("Found {} audio files", files.len());

        // Process files in parallel
        let new_tracks: Vec<Track> = files
            .par_iter()
            .filter_map(|path| match self.process_audio_file(path) {
                Ok(track) => Some(track),
                Err(e) => {
                    warn!("Failed to process {}: {}", path.display(), e);
                    None
                }
            })
            .collect();

        // Add new tracks to the library
        let mut added = 0;
        for (idx, track) in new_tracks.into_iter().enumerate() {
            let path = track.path.clone();
            let track_id = track.id;

            if !self.track_paths.contains_key(&path) {
                // Add track and update indices
                self.tracks.insert(track_id, track);
                self.track_paths.insert(path, track_id);
                self.track_by_id.insert(track_id, idx);

                // Update album and artist indices
                if let Some(album) = &self.tracks[&track_id].album {
                    if let Some(artist) = &self.tracks[&track_id].artist {
                        let album_key = (album.clone(), artist.clone());
                        self.album_by_name_artist
                            .entry(album_key)
                            .or_insert_with(|| Uuid::new_v4());
                    }
                }

                if let Some(artist) = &self.tracks[&track_id].artist {
                    self.artist_by_name
                        .entry(artist.clone())
                        .or_insert_with(|| Uuid::new_v4());
                }

                added += 1;
            }
        }

        self.last_scan = Some(SystemTime::now());
        info!("Added {} new tracks to the library", added);

        Ok(added)
    }

    /// Process an audio file and extract metadata
    fn process_audio_file<P: AsRef<Path>>(&self, path: P) -> Result<Track, String> {
        let path = path.as_ref();

        // Read metadata using lofty
        let tagged_file = match read_from_path(path) {
            Ok(tagged_file) => tagged_file,
            Err(e) => return Err(format!("Failed to read audio file: {}", e)),
        };

        let properties = tagged_file.properties();
        let tag = match tagged_file.primary_tag() {
            Some(tag) => tag,
            None => return Err("No primary tag found".to_string()),
        };

        // Extract metadata
        let title = tag.title().map(|s| s.to_string()).unwrap_or_else(|| {
            path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Unknown Track")
                .to_string()
        });

        let artist = tag.artist().map(|s| s.to_string());
        let album = tag.album().map(|s| s.to_string());
        let album_artist = tag.get_string(&ItemKey::AlbumArtist).map(|s| s.to_string());

        let track_number = tag.track();
        let disc_number = tag.disk();
        let year = tag.year().map(|y| y as i32);
        let genre = tag.genre().map(|s| s.to_string());

        // Extract duration
        let duration = properties.duration().as_secs() as u32;

        // Get file size
        let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);

        // Create track
        let track = Track {
            id: Uuid::new_v4(),
            title,
            duration,
            track_number,
            disc_number,
            path: path.to_path_buf(),
            size,
            format: utils::file_extension(path).unwrap_or_else(|| "unknown".to_string()),
            bitrate: properties.audio_bitrate().unwrap_or(0) as u32,
            sample_rate: properties.sample_rate().unwrap_or(44100) as u32,
            channels: properties.channels().unwrap_or(2) as u16,
            artist,
            album_artist,
            album,
            year,
            genre,
            artwork: None, // TODO: Extract artwork
            lyrics: None,  // TODO: Extract lyrics
            play_count: 0,
            last_played: None,
            date_added: Utc::now(),
        };

        Ok(track)
    }

    /// Get all tracks in the library
    pub fn get_tracks(&self) -> Vec<Track> {
        self.tracks.values().cloned().collect()
    }

    /// Get a track by ID
    pub fn get_track(&self, id: Uuid) -> Option<&Track> {
        self.track_by_id.get(&id).map(|&idx| &self.tracks[&id])
    }

    /// Get all albums in the library
    pub fn get_albums(&self) -> Vec<Album> {
        self.albums.values().cloned().collect()
    }

    /// Get an album by ID
    pub fn get_album(&self, id: Uuid) -> Option<&Album> {
        self.albums.get(&id)
    }

    /// Get an album by name and artist
    pub fn get_album_by_name_artist(&self, name: &str, artist: &str) -> Option<&Album> {
        self.album_by_name_artist
            .get(&(name.to_string(), artist.to_string()))
            .and_then(|id| self.albums.get(id))
    }

    /// Get all artists in the library
    pub fn get_artists(&self) -> Vec<Artist> {
        self.artists.values().cloned().collect()
    }

    /// Get an artist by ID
    pub fn get_artist(&self, id: Uuid) -> Option<&Artist> {
        self.artists.get(&id)
    }

    /// Get an artist by name
    pub fn get_artist_by_name(&self, name: &str) -> Option<&Artist> {
        self.artist_by_name
            .get(name)
            .and_then(|id| self.artists.get(id))
    }

    /// Get the last scan time
    pub fn last_scan(&self) -> Option<SystemTime> {
        self.last_scan
    }

    /// Get tracks by album ID
    pub fn get_tracks_by_album(&self, album_id: &Uuid) -> Vec<Track> {
        // For now, we'll match by album title since we don't have album_id in Track
        // In a real implementation, you'd want to add album_id field to Track
        if let Some(album) = self.albums.get(album_id) {
            self.tracks
                .values()
                .filter(|track| track.album.as_ref() == Some(&album.title))
                .cloned()
                .collect()
        } else {
            Vec::new()
        }
    }

    /// Get tracks by artist ID
    pub fn get_tracks_by_artist(&self, artist_id: &Uuid) -> Vec<Track> {
        // For now, we'll match by artist name since we don't have artist_id in Track
        // In a real implementation, you'd want to add artist_id field to Track
        if let Some(artist) = self.artists.get(artist_id) {
            self.tracks
                .values()
                .filter(|track| track.artist.as_ref() == Some(&artist.name))
                .cloned()
                .collect()
        } else {
            Vec::new()
        }
    }

    /// Get albums by artist ID
    pub fn get_albums_by_artist(&self, artist_id: &Uuid) -> Vec<Album> {
        // For now, we'll match by artist name since we don't have artist_id in Album
        // In a real implementation, you'd want to add artist_id field to Album
        if let Some(artist) = self.artists.get(artist_id) {
            self.albums
                .values()
                .filter(|album| album.artist == artist.name)
                .cloned()
                .collect()
        } else {
            Vec::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_scan_empty_directory() {
        let temp_dir = tempdir().unwrap();
        let mut library = LibraryService::default();

        let result = library.scan_directory(temp_dir.path());
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 0);
        assert_eq!(library.get_tracks().len(), 0);
    }

    #[test]
    fn test_scan_nonexistent_directory() {
        let temp_dir = tempdir().unwrap();
        let path = temp_dir.path().join("nonexistent");
        let mut library = LibraryService::default();

        let result = library.scan_directory(&path);
        assert!(result.is_err());
    }

    // Note: More comprehensive tests would require actual audio files
    // or mock file system operations
}
