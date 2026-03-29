//! Playlist service for managing playlists

mod store;

use log::info;
use std::collections::HashMap;
use std::path::Path;
use uuid::Uuid;

use crate::models::Playlist;

use self::store::PlaylistStore;

/// Playlist service for managing playlists
pub struct PlaylistService {
    store: PlaylistStore,
    playlists: HashMap<Uuid, Playlist>,
    playlist_names: HashMap<String, Uuid>,
}

impl Default for PlaylistService {
    fn default() -> Self {
        Self::open_in_memory().expect("in-memory playlist service should initialize")
    }
}

impl PlaylistService {
    /// Create a new PlaylistService backed by the application data database.
    pub fn new() -> Result<Self, String> {
        let mut path = crate::utils::app_data_dir()
            .ok_or_else(|| "Failed to locate app data directory".to_string())?;
        crate::utils::ensure_dir_exists(&path).map_err(|e| {
            format!(
                "Failed to create app data directory {}: {e}",
                path.display()
            )
        })?;
        path.push("library.sqlite");
        Self::open(&path)
    }

    /// Create a playlist service backed by the database at the provided path.
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, String> {
        let store = PlaylistStore::open(path.as_ref()).map_err(|e| e.to_string())?;
        Self::from_store(store)
    }

    fn open_in_memory() -> Result<Self, String> {
        let store = PlaylistStore::open_in_memory().map_err(|e| e.to_string())?;
        Self::from_store(store)
    }

    fn from_store(store: PlaylistStore) -> Result<Self, String> {
        let loaded = store.load_all().map_err(|e| e.to_string())?;
        let mut playlists = HashMap::new();
        let mut playlist_names = HashMap::new();

        for playlist in loaded {
            playlist_names.insert(playlist.name.to_lowercase(), playlist.id);
            playlists.insert(playlist.id, playlist);
        }

        Ok(Self {
            store,
            playlists,
            playlist_names,
        })
    }

    /// Create a new playlist
    pub fn create_playlist(&mut self, name: &str) -> Result<Uuid, String> {
        if name.trim().is_empty() {
            return Err("Playlist name cannot be empty".to_string());
        }

        let key = name.to_lowercase();
        if self.playlist_names.contains_key(&key) {
            return Err(format!("A playlist named '{}' already exists", name));
        }

        let id = Uuid::new_v4();
        let playlist = Playlist::with_id(id, name);

        self.store
            .save_playlist(&playlist)
            .map_err(|e| e.to_string())?;
        self.playlist_names.insert(key, id);
        self.playlists.insert(id, playlist);

        info!("Created playlist '{}' with ID: {}", name, id);

        Ok(id)
    }

    /// Delete a playlist
    pub fn delete_playlist(&mut self, id: &Uuid) -> Result<(), String> {
        let playlist = self
            .playlists
            .get(id)
            .cloned()
            .ok_or_else(|| "Playlist not found".to_string())?;

        self.store.delete_playlist(id).map_err(|e| e.to_string())?;
        self.playlists.remove(id);
        self.playlist_names.remove(&playlist.name.to_lowercase());

        info!("Deleted playlist '{}' with ID: {}", playlist.name, id);
        Ok(())
    }

    /// Add a track to a playlist
    pub fn add_to_playlist(&mut self, playlist_id: &Uuid, track_id: Uuid) -> Result<(), String> {
        let added = self.add_tracks_to_playlist(playlist_id, &[track_id])?;
        if added == 1 {
            Ok(())
        } else {
            Err("Failed to add track to playlist".to_string())
        }
    }

    /// Add multiple tracks to a playlist in order
    pub fn add_tracks_to_playlist(
        &mut self,
        playlist_id: &Uuid,
        track_ids: &[Uuid],
    ) -> Result<usize, String> {
        let mut next_playlist = self
            .playlists
            .get(playlist_id)
            .cloned()
            .ok_or_else(|| "Playlist not found".to_string())?;

        for track_id in track_ids {
            next_playlist.add_track(*track_id);
        }

        self.store
            .save_playlist(&next_playlist)
            .map_err(|e| e.to_string())?;
        let playlist_name = next_playlist.name.clone();
        self.playlists.insert(*playlist_id, next_playlist);

        info!(
            "Added {} tracks to playlist '{}'",
            track_ids.len(),
            playlist_name
        );
        Ok(track_ids.len())
    }

    /// Remove a track from a playlist
    pub fn remove_from_playlist(
        &mut self,
        playlist_id: &Uuid,
        track_index: usize,
    ) -> Result<Option<Uuid>, String> {
        let mut next_playlist = self
            .playlists
            .get(playlist_id)
            .cloned()
            .ok_or_else(|| "Playlist not found".to_string())?;
        let result = next_playlist.remove_track(track_index);

        self.store
            .save_playlist(&next_playlist)
            .map_err(|e| e.to_string())?;
        let playlist_name = next_playlist.name.clone();
        self.playlists.insert(*playlist_id, next_playlist);

        if result.is_some() {
            info!("Removed track from playlist '{}'", playlist_name);
        }

        Ok(result)
    }

    /// Replace the full ordered track list for a playlist.
    pub fn set_playlist_tracks(
        &mut self,
        playlist_id: &Uuid,
        track_ids: Vec<Uuid>,
    ) -> Result<(), String> {
        let mut next_playlist = self
            .playlists
            .get(playlist_id)
            .cloned()
            .ok_or_else(|| "Playlist not found".to_string())?;

        next_playlist.track_ids = track_ids;
        next_playlist.updated_at = chrono::Utc::now();

        self.store
            .save_playlist(&next_playlist)
            .map_err(|e| e.to_string())?;
        self.playlists.insert(*playlist_id, next_playlist);
        Ok(())
    }

    /// Reorder tracks in a playlist.
    pub fn reorder_playlist_tracks(
        &mut self,
        playlist_id: &Uuid,
        from_index: usize,
        to_index: usize,
    ) -> Result<(), String> {
        let mut next_playlist = self
            .playlists
            .get(playlist_id)
            .cloned()
            .ok_or_else(|| "Playlist not found".to_string())?;

        if from_index >= next_playlist.track_ids.len() || to_index >= next_playlist.track_ids.len()
        {
            return Err("Index out of bounds".to_string());
        }

        if from_index == to_index {
            return Ok(());
        }

        let track_id = next_playlist.track_ids.remove(from_index);
        next_playlist.track_ids.insert(to_index, track_id);
        next_playlist.updated_at = chrono::Utc::now();

        self.store
            .save_playlist(&next_playlist)
            .map_err(|e| e.to_string())?;
        self.playlists.insert(*playlist_id, next_playlist);
        Ok(())
    }

    /// Get a playlist by ID
    pub fn get_playlist(&self, id: &Uuid) -> Option<&Playlist> {
        self.playlists.get(id)
    }

    /// Update playlist metadata
    pub fn update_playlist_metadata(
        &mut self,
        id: &Uuid,
        name: Option<&str>,
        description: Option<&str>,
    ) -> Result<(), String> {
        let current = self
            .playlists
            .get(id)
            .cloned()
            .ok_or_else(|| "Playlist not found".to_string())?;

        let mut next_playlist = current.clone();
        if let Some(new_name) = name
            && !new_name.trim().is_empty()
            && new_name != current.name
        {
            let new_key = new_name.to_lowercase();
            if self
                .playlist_names
                .get(&new_key)
                .is_some_and(|existing| existing != id)
            {
                return Err(format!("A playlist named '{}' already exists", new_name));
            }

            next_playlist.name = new_name.to_string();
            next_playlist.updated_at = chrono::Utc::now();
        }

        if let Some(desc) = description {
            next_playlist.description = Some(desc.to_string());
            next_playlist.updated_at = chrono::Utc::now();
        }

        self.store
            .save_playlist(&next_playlist)
            .map_err(|e| e.to_string())?;

        self.playlist_names.remove(&current.name.to_lowercase());
        self.playlist_names
            .insert(next_playlist.name.to_lowercase(), *id);
        let playlist_name = next_playlist.name.clone();
        self.playlists.insert(*id, next_playlist);

        info!("Updated metadata for playlist '{}'", playlist_name);
        Ok(())
    }

    /// Get all playlists
    pub fn get_playlists(&self) -> Vec<&Playlist> {
        self.playlists.values().collect()
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
    use tempfile::tempdir;

    #[test]
    fn test_create_playlist_returns_same_id_as_playlist_record() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("library.sqlite");
        let mut service = PlaylistService::open(&db_path).unwrap();

        let playlist_id = service.create_playlist("Road Trip").unwrap();
        let playlist = service.get_playlist(&playlist_id).unwrap();

        assert_eq!(playlist.id, playlist_id);
    }

    #[test]
    fn test_playlist_data_persists_across_service_reopen() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("library.sqlite");
        let track_ids = vec![Uuid::new_v4(), Uuid::new_v4()];

        let playlist_id = {
            let mut service = PlaylistService::open(&db_path).unwrap();
            let playlist_id = service.create_playlist("After Hours").unwrap();
            let added = service
                .add_tracks_to_playlist(&playlist_id, &track_ids)
                .unwrap();
            assert_eq!(added, track_ids.len());
            playlist_id
        };

        let reopened = PlaylistService::open(&db_path).unwrap();
        let playlist = reopened.get_playlist(&playlist_id).unwrap();

        assert_eq!(playlist.name, "After Hours");
        assert_eq!(playlist.track_ids, track_ids);
    }

    #[test]
    fn test_update_playlist_metadata_persists_across_service_reopen() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("library.sqlite");

        let playlist_id = {
            let mut service = PlaylistService::open(&db_path).unwrap();
            let playlist_id = service.create_playlist("Old Name").unwrap();
            service
                .update_playlist_metadata(&playlist_id, Some("New Name"), Some("Late-night mix"))
                .unwrap();
            playlist_id
        };

        let reopened = PlaylistService::open(&db_path).unwrap();
        let playlist = reopened.get_playlist(&playlist_id).unwrap();
        assert_eq!(playlist.name, "New Name");
        assert_eq!(playlist.description.as_deref(), Some("Late-night mix"));
    }

    #[test]
    fn test_set_playlist_tracks_persists_across_service_reopen() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("library.sqlite");
        let track_ids = vec![Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4()];

        let playlist_id = {
            let mut service = PlaylistService::open(&db_path).unwrap();
            let playlist_id = service.create_playlist("Queue Draft").unwrap();
            service
                .set_playlist_tracks(&playlist_id, track_ids.clone())
                .unwrap();
            playlist_id
        };

        let reopened = PlaylistService::open(&db_path).unwrap();
        let playlist = reopened.get_playlist(&playlist_id).unwrap();
        assert_eq!(playlist.track_ids, track_ids);
    }

    #[test]
    fn test_reorder_playlist_tracks_persists_across_service_reopen() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("library.sqlite");
        let track_a = Uuid::new_v4();
        let track_b = Uuid::new_v4();
        let track_c = Uuid::new_v4();

        let playlist_id = {
            let mut service = PlaylistService::open(&db_path).unwrap();
            let playlist_id = service.create_playlist("Commute").unwrap();
            service
                .set_playlist_tracks(&playlist_id, vec![track_a, track_b, track_c])
                .unwrap();
            service.reorder_playlist_tracks(&playlist_id, 2, 0).unwrap();
            playlist_id
        };

        let reopened = PlaylistService::open(&db_path).unwrap();
        let playlist = reopened.get_playlist(&playlist_id).unwrap();
        assert_eq!(playlist.track_ids, vec![track_c, track_a, track_b]);
    }

    #[test]
    fn test_delete_playlist_persists_across_service_reopen() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("library.sqlite");

        let playlist_id = {
            let mut service = PlaylistService::open(&db_path).unwrap();
            let playlist_id = service.create_playlist("Disposable").unwrap();
            service.delete_playlist(&playlist_id).unwrap();
            playlist_id
        };

        let reopened = PlaylistService::open(&db_path).unwrap();
        assert!(reopened.get_playlist(&playlist_id).is_none());
    }

    #[test]
    fn test_create_playlist() {
        let mut service = PlaylistService::default();

        let result = service.create_playlist("My Playlist");
        assert!(result.is_ok());

        let _playlist_id = result.unwrap();
        assert_eq!(service.count(), 1);

        let result = service.create_playlist("My Playlist");
        assert!(result.is_err());

        let result = service.create_playlist("");
        assert!(result.is_err());
    }

    #[test]
    fn test_add_and_remove_tracks() {
        let mut service = PlaylistService::default();
        let playlist_id = service.create_playlist("Test").unwrap();
        let track_id = Uuid::new_v4();

        assert!(service.add_to_playlist(&playlist_id, track_id).is_ok());

        let playlist = service.get_playlist(&playlist_id).unwrap();
        assert_eq!(playlist.track_count(), 1);

        let result = service.remove_from_playlist(&playlist_id, 0);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), Some(track_id));

        let playlist = service.get_playlist(&playlist_id).unwrap();
        assert_eq!(playlist.track_count(), 0);

        let result = service.remove_from_playlist(&playlist_id, 0);
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[test]
    fn test_add_multiple_tracks() {
        let mut service = PlaylistService::default();
        let playlist_id = service.create_playlist("Batch Test").unwrap();
        let track_ids = vec![Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4()];

        let added = service
            .add_tracks_to_playlist(&playlist_id, &track_ids)
            .unwrap();

        assert_eq!(added, 3);
        let playlist = service.get_playlist(&playlist_id).unwrap();
        assert_eq!(playlist.track_ids, track_ids);
    }

    #[test]
    fn test_update_playlist_metadata() {
        let mut service = PlaylistService::default();
        let playlist_id = service.create_playlist("Old Name").unwrap();

        assert!(
            service
                .update_playlist_metadata(&playlist_id, Some("New Name"), Some("A test playlist"))
                .is_ok()
        );

        let playlist = service.get_playlist(&playlist_id).unwrap();
        assert_eq!(playlist.name, "New Name");
        assert_eq!(playlist.description, Some("A test playlist".to_string()));

        let another_id = service.create_playlist("Another Playlist").unwrap();
        let result = service.update_playlist_metadata(&another_id, Some("New Name"), None);
        assert!(result.is_err());
    }
}
