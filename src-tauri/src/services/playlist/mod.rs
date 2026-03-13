//! Playlist service for managing playlists

use log::info;
use std::collections::HashMap;
use uuid::Uuid;

use crate::models::Playlist;

/// Playlist service for managing playlists
#[derive(Default)]
pub struct PlaylistService {
    playlists: HashMap<Uuid, Playlist>,
    playlist_names: HashMap<String, Uuid>,
}

impl PlaylistService {
    /// Create a new PlaylistService
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a new playlist
    pub fn create_playlist(&mut self, name: &str) -> Result<Uuid, String> {
        if name.trim().is_empty() {
            return Err("Playlist name cannot be empty".to_string());
        }

        // Check if a playlist with this name already exists
        let key = name.to_lowercase();
        if self.playlist_names.contains_key(&key) {
            return Err(format!("A playlist named '{}' already exists", name));
        }

        let id = Uuid::new_v4();
        let playlist = Playlist::new(name);

        self.playlists.insert(id, playlist);
        self.playlist_names.insert(key, id);

        info!("Created playlist '{}' with ID: {}", name, id);

        Ok(id)
    }

    /// Delete a playlist
    pub fn delete_playlist(&mut self, id: &Uuid) -> Result<(), String> {
        if let Some(playlist) = self.playlists.remove(id) {
            self.playlist_names.remove(&playlist.name.to_lowercase());
            info!("Deleted playlist '{}' with ID: {}", playlist.name, id);
            Ok(())
        } else {
            Err("Playlist not found".to_string())
        }
    }

    /// Add a track to a playlist
    pub fn add_to_playlist(&mut self, playlist_id: &Uuid, track_id: Uuid) -> Result<(), String> {
        if let Some(playlist) = self.playlists.get_mut(playlist_id) {
            playlist.add_track(track_id);
            info!("Added track to playlist '{}'", playlist.name);
            Ok(())
        } else {
            Err("Playlist not found".to_string())
        }
    }

    /// Remove a track from a playlist
    pub fn remove_from_playlist(
        &mut self,
        playlist_id: &Uuid,
        track_index: usize,
    ) -> Result<Option<Uuid>, String> {
        if let Some(playlist) = self.playlists.get_mut(playlist_id) {
            let result = playlist.remove_track(track_index);
            if result.is_some() {
                info!("Removed track from playlist '{}'", playlist.name);
            }
            Ok(result)
        } else {
            Err("Playlist not found".to_string())
        }
    }

    /// Get a playlist by ID
    pub fn get_playlist(&self, id: &Uuid) -> Option<&Playlist> {
        self.playlists.get(id)
    }

    /// Get a mutable reference to a playlist by ID
    pub fn get_playlist_mut(&mut self, id: &Uuid) -> Option<&mut Playlist> {
        self.playlists.get_mut(id)
    }

    /// Get all playlists
    pub fn get_playlists(&self) -> Vec<&Playlist> {
        self.playlists.values().collect()
    }

    /// Update playlist metadata
    pub fn update_playlist_metadata(
        &mut self,
        id: &Uuid,
        name: Option<&str>,
        description: Option<&str>,
    ) -> Result<(), String> {
        if let Some(playlist) = self.playlists.get_mut(id) {
            if let Some(new_name) = name
                && !new_name.trim().is_empty()
                && new_name != playlist.name
            {
                // Check if the new name is already taken
                let new_key = new_name.to_lowercase();
                if self.playlist_names.contains_key(&new_key) {
                    return Err(format!("A playlist named '{}' already exists", new_name));
                }

                // Remove old name
                self.playlist_names.remove(&playlist.name.to_lowercase());

                // Update name
                playlist.name = new_name.to_string();
                self.playlist_names.insert(new_key, *id);
            }

            if let Some(desc) = description {
                playlist.description = Some(desc.to_string());
            }

            info!("Updated metadata for playlist '{}'", playlist.name);
            Ok(())
        } else {
            Err("Playlist not found".to_string())
        }
    }

    /// Find a playlist by name (case-insensitive)
    pub fn find_playlist_by_name(&self, name: &str) -> Option<&Playlist> {
        self.playlist_names
            .get(&name.to_lowercase())
            .and_then(|id| self.playlists.get(id))
    }

    /// Get the number of playlists
    pub fn count(&self) -> usize {
        self.playlists.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_create_playlist() {
        let mut service = PlaylistService::default();

        // Create a new playlist
        let result = service.create_playlist("My Playlist");
        assert!(result.is_ok());

        let _playlist_id = result.unwrap();
        assert_eq!(service.count(), 1);

        // Try to create a duplicate playlist
        let result = service.create_playlist("My Playlist");
        assert!(result.is_err());

        // Try to create a playlist with empty name
        let result = service.create_playlist("");
        assert!(result.is_err());
    }

    #[test]
    fn test_add_and_remove_tracks() {
        let mut service = PlaylistService::default();
        let playlist_id = service.create_playlist("Test").unwrap();
        let track_id = Uuid::new_v4();

        // Add a track
        assert!(service.add_to_playlist(&playlist_id, track_id).is_ok());

        // Check track count
        let playlist = service.get_playlist(&playlist_id).unwrap();
        assert_eq!(playlist.track_count(), 1);

        // Remove the track
        let result = service.remove_from_playlist(&playlist_id, 0);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), Some(track_id));

        // Check track count after removal
        let playlist = service.get_playlist(&playlist_id).unwrap();
        assert_eq!(playlist.track_count(), 0);

        // Try to remove non-existent track
        let result = service.remove_from_playlist(&playlist_id, 0);
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[test]
    fn test_update_playlist_metadata() {
        let mut service = PlaylistService::default();
        let playlist_id = service.create_playlist("Old Name").unwrap();

        // Update name
        assert!(
            service
                .update_playlist_metadata(&playlist_id, Some("New Name"), Some("A test playlist"))
                .is_ok()
        );

        let playlist = service.get_playlist(&playlist_id).unwrap();
        assert_eq!(playlist.name, "New Name");
        assert_eq!(playlist.description, Some("A test playlist".to_string()));

        // Try to update to existing name
        let another_id = service.create_playlist("Another Playlist").unwrap();
        let result = service.update_playlist_metadata(&another_id, Some("New Name"), None);
        assert!(result.is_err());
    }
}
