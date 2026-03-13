//! Play queue implementation for managing playback order

use crate::models::track::Track;
use rand::seq::SliceRandom;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Play mode for the queue
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum PlayMode {
    /// Play tracks in order
    #[default]
    Sequential,
    /// Play tracks in random order
    Random,
    /// Repeat the current track
    SingleRepeat,
    /// Repeat the entire queue
    ListRepeat,
}

/// Play queue for managing track playback order
#[derive(Debug, Clone)]
pub struct PlayQueue {
    /// All tracks in the queue
    tracks: Vec<Track>,
    /// Current track index
    current_index: Option<usize>,
    /// Play history for "previous" functionality
    history: Vec<usize>,
    /// Current play mode
    mode: PlayMode,
    /// Shuffled indices for random mode
    shuffled_indices: Vec<usize>,
}

impl Default for PlayQueue {
    fn default() -> Self {
        Self::new()
    }
}

impl PlayQueue {
    /// Create a new empty play queue
    pub fn new() -> Self {
        Self {
            tracks: Vec::new(),
            current_index: None,
            history: Vec::new(),
            mode: PlayMode::Sequential,
            shuffled_indices: Vec::new(),
        }
    }

    /// Set the tracks in the queue
    pub fn set_tracks(&mut self, tracks: Vec<Track>) {
        self.tracks = tracks;
        self.current_index = if self.tracks.is_empty() {
            None
        } else {
            Some(0)
        };
        self.history.clear();
        self.regenerate_shuffle();
    }

    /// Add a track to the end of the queue
    #[allow(dead_code)]
    pub fn add_track(&mut self, track: Track) {
        self.tracks.push(track);
        if self.current_index.is_none() && !self.tracks.is_empty() {
            self.current_index = Some(0);
        }
        self.regenerate_shuffle();
    }

    /// Add multiple tracks to the end of the queue
    pub fn add_tracks(&mut self, tracks: Vec<Track>) {
        self.tracks.extend(tracks);
        if self.current_index.is_none() && !self.tracks.is_empty() {
            self.current_index = Some(0);
        }
        self.regenerate_shuffle();
    }

    /// Insert a track at a specific position
    #[allow(dead_code)]
    pub fn insert_track(&mut self, index: usize, track: Track) {
        if index <= self.tracks.len() {
            self.tracks.insert(index, track);
            // Adjust current index if needed
            if let Some(current) = self.current_index
                && index <= current
            {
                self.current_index = Some(current + 1);
            }
            self.regenerate_shuffle();
        }
    }

    /// Remove a track by index
    #[allow(dead_code)]
    pub fn remove_track(&mut self, index: usize) -> Option<Track> {
        if index < self.tracks.len() {
            let track = self.tracks.remove(index);

            // Adjust current index if needed
            if let Some(current) = self.current_index {
                if index < current {
                    self.current_index = Some(current - 1);
                } else if index == current {
                    // If we removed the current track, stay at the same index
                    // (which now points to the next track)
                    if self.tracks.is_empty() {
                        self.current_index = None;
                    } else if current >= self.tracks.len() {
                        self.current_index = Some(self.tracks.len() - 1);
                    }
                }
            }

            self.regenerate_shuffle();
            Some(track)
        } else {
            None
        }
    }

    /// Remove a track by ID
    #[allow(dead_code)]
    pub fn remove_track_by_id(&mut self, track_id: Uuid) -> Option<Track> {
        if let Some(index) = self.tracks.iter().position(|t| t.id == track_id) {
            self.remove_track(index)
        } else {
            None
        }
    }

    /// Clear all tracks from the queue
    pub fn clear(&mut self) {
        self.tracks.clear();
        self.current_index = None;
        self.history.clear();
        self.shuffled_indices.clear();
    }

    /// Get the current track
    pub fn current_track(&self) -> Option<&Track> {
        self.current_index.and_then(|index| self.tracks.get(index))
    }

    /// Get the current track index
    #[allow(dead_code)]
    pub fn current_index(&self) -> Option<usize> {
        self.current_index
    }

    /// Get all tracks in the queue
    #[allow(dead_code)]
    pub fn tracks(&self) -> &[Track] {
        &self.tracks
    }

    /// Get the number of tracks in the queue
    pub fn len(&self) -> usize {
        self.tracks.len()
    }

    /// Check if the queue is empty
    #[allow(dead_code)]
    pub fn is_empty(&self) -> bool {
        self.tracks.is_empty()
    }

    /// Set the play mode
    pub fn set_mode(&mut self, mode: PlayMode) {
        self.mode = mode;
        if mode == PlayMode::Random {
            self.regenerate_shuffle();
        }
    }

    /// Get the current play mode
    pub fn mode(&self) -> PlayMode {
        self.mode
    }

    /// Move to the next track based on the current play mode
    pub fn next(&mut self) -> Option<&Track> {
        if self.tracks.is_empty() {
            return None;
        }

        let current = self.current_index?;

        // Save current position to history
        self.history.push(current);
        // Limit history size to prevent unbounded growth
        if self.history.len() > 100 {
            self.history.remove(0);
        }

        match self.mode {
            PlayMode::Sequential => {
                // Move to next track, or None if at the end
                if current + 1 < self.tracks.len() {
                    self.current_index = Some(current + 1);
                } else {
                    self.current_index = None;
                }
            }
            PlayMode::Random => {
                // Find current position in shuffled indices
                if let Some(shuffle_pos) = self.shuffled_indices.iter().position(|&i| i == current)
                {
                    if shuffle_pos + 1 < self.shuffled_indices.len() {
                        self.current_index = Some(self.shuffled_indices[shuffle_pos + 1]);
                    } else {
                        // End of shuffled list, regenerate and start over
                        self.regenerate_shuffle();
                        self.current_index = self.shuffled_indices.first().copied();
                    }
                } else {
                    // Current index not in shuffle, start from beginning
                    self.current_index = self.shuffled_indices.first().copied();
                }
            }
            PlayMode::SingleRepeat => {
                // Stay on the same track
                self.current_index = Some(current);
            }
            PlayMode::ListRepeat => {
                // Move to next track, or wrap to beginning
                if current + 1 < self.tracks.len() {
                    self.current_index = Some(current + 1);
                } else {
                    self.current_index = Some(0);
                }
            }
        }

        self.current_track()
    }

    /// Move to the previous track
    pub fn previous(&mut self) -> Option<&Track> {
        if self.tracks.is_empty() {
            return None;
        }

        // Try to get from history first
        if let Some(prev_index) = self.history.pop()
            && prev_index < self.tracks.len()
        {
            self.current_index = Some(prev_index);
            return self.current_track();
        }

        // If no history, move to previous track based on mode
        let current = self.current_index?;

        match self.mode {
            PlayMode::Sequential | PlayMode::SingleRepeat => {
                if current > 0 {
                    self.current_index = Some(current - 1);
                } else {
                    self.current_index = Some(0);
                }
            }
            PlayMode::Random => {
                // In random mode without history, just go to a random track
                if let Some(shuffle_pos) = self.shuffled_indices.iter().position(|&i| i == current)
                    && shuffle_pos > 0
                {
                    self.current_index = Some(self.shuffled_indices[shuffle_pos - 1]);
                }
            }
            PlayMode::ListRepeat => {
                if current > 0 {
                    self.current_index = Some(current - 1);
                } else {
                    // Wrap to end
                    self.current_index = Some(self.tracks.len() - 1);
                }
            }
        }

        self.current_track()
    }

    /// Jump to a specific track by index
    #[allow(dead_code)]
    pub fn jump_to(&mut self, index: usize) -> Option<&Track> {
        if index < self.tracks.len() {
            if let Some(current) = self.current_index {
                self.history.push(current);
                if self.history.len() > 100 {
                    self.history.remove(0);
                }
            }
            self.current_index = Some(index);
            self.current_track()
        } else {
            None
        }
    }

    /// Jump to a specific track by ID
    #[allow(dead_code)]
    pub fn jump_to_id(&mut self, track_id: Uuid) -> Option<&Track> {
        if let Some(index) = self.tracks.iter().position(|t| t.id == track_id) {
            self.jump_to(index)
        } else {
            None
        }
    }

    /// Regenerate the shuffled indices for random mode
    fn regenerate_shuffle(&mut self) {
        if self.mode == PlayMode::Random && !self.tracks.is_empty() {
            self.shuffled_indices = (0..self.tracks.len()).collect();
            let mut rng = rand::thread_rng();
            self.shuffled_indices.shuffle(&mut rng);
        }
    }

    /// Check if there is a next track available
    #[allow(dead_code)]
    pub fn has_next(&self) -> bool {
        if self.tracks.is_empty() {
            return false;
        }

        match self.mode {
            PlayMode::Sequential => {
                if let Some(current) = self.current_index {
                    current + 1 < self.tracks.len()
                } else {
                    false
                }
            }
            PlayMode::Random | PlayMode::SingleRepeat | PlayMode::ListRepeat => true,
        }
    }

    /// Check if there is a previous track available
    #[allow(dead_code)]
    pub fn has_previous(&self) -> bool {
        if self.tracks.is_empty() {
            return false;
        }

        !self.history.is_empty() || self.current_index.is_some_and(|i| i > 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_track(title: &str) -> Track {
        Track {
            id: Uuid::new_v4(),
            title: title.to_string(),
            ..Default::default()
        }
    }

    #[test]
    fn test_empty_queue() {
        let queue = PlayQueue::new();
        assert!(queue.is_empty());
        assert_eq!(queue.len(), 0);
        assert!(queue.current_track().is_none());
    }

    #[test]
    fn test_set_tracks() {
        let mut queue = PlayQueue::new();
        let tracks = vec![
            create_test_track("Track 1"),
            create_test_track("Track 2"),
            create_test_track("Track 3"),
        ];
        queue.set_tracks(tracks);

        assert_eq!(queue.len(), 3);
        assert_eq!(queue.current_index(), Some(0));
        assert_eq!(queue.current_track().unwrap().title, "Track 1");
    }

    #[test]
    fn test_sequential_mode() {
        let mut queue = PlayQueue::new();
        queue.set_tracks(vec![
            create_test_track("Track 1"),
            create_test_track("Track 2"),
            create_test_track("Track 3"),
        ]);
        queue.set_mode(PlayMode::Sequential);

        assert_eq!(queue.current_track().unwrap().title, "Track 1");

        queue.next();
        assert_eq!(queue.current_track().unwrap().title, "Track 2");

        queue.next();
        assert_eq!(queue.current_track().unwrap().title, "Track 3");

        queue.next();
        assert!(queue.current_track().is_none());
    }

    #[test]
    fn test_list_repeat_mode() {
        let mut queue = PlayQueue::new();
        queue.set_tracks(vec![
            create_test_track("Track 1"),
            create_test_track("Track 2"),
        ]);
        queue.set_mode(PlayMode::ListRepeat);

        assert_eq!(queue.current_track().unwrap().title, "Track 1");

        queue.next();
        assert_eq!(queue.current_track().unwrap().title, "Track 2");

        queue.next();
        assert_eq!(queue.current_track().unwrap().title, "Track 1");
    }

    #[test]
    fn test_single_repeat_mode() {
        let mut queue = PlayQueue::new();
        queue.set_tracks(vec![
            create_test_track("Track 1"),
            create_test_track("Track 2"),
        ]);
        queue.set_mode(PlayMode::SingleRepeat);

        assert_eq!(queue.current_track().unwrap().title, "Track 1");

        queue.next();
        assert_eq!(queue.current_track().unwrap().title, "Track 1");

        queue.next();
        assert_eq!(queue.current_track().unwrap().title, "Track 1");
    }

    #[test]
    fn test_previous() {
        let mut queue = PlayQueue::new();
        queue.set_tracks(vec![
            create_test_track("Track 1"),
            create_test_track("Track 2"),
            create_test_track("Track 3"),
        ]);

        queue.next();
        queue.next();
        assert_eq!(queue.current_track().unwrap().title, "Track 3");

        queue.previous();
        assert_eq!(queue.current_track().unwrap().title, "Track 2");

        queue.previous();
        assert_eq!(queue.current_track().unwrap().title, "Track 1");
    }

    #[test]
    fn test_jump_to() {
        let mut queue = PlayQueue::new();
        queue.set_tracks(vec![
            create_test_track("Track 1"),
            create_test_track("Track 2"),
            create_test_track("Track 3"),
        ]);

        queue.jump_to(2);
        assert_eq!(queue.current_track().unwrap().title, "Track 3");

        queue.jump_to(0);
        assert_eq!(queue.current_track().unwrap().title, "Track 1");
    }

    #[test]
    fn test_add_remove_tracks() {
        let mut queue = PlayQueue::new();
        queue.add_track(create_test_track("Track 1"));
        assert_eq!(queue.len(), 1);

        queue.add_track(create_test_track("Track 2"));
        assert_eq!(queue.len(), 2);

        queue.remove_track(0);
        assert_eq!(queue.len(), 1);
        assert_eq!(queue.current_track().unwrap().title, "Track 2");
    }
}
