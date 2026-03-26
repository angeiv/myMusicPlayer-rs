import type { Playlist, Track } from '../../types';
import {
  addMockPlaylist,
  appendMockTrackToPlaylist,
  getMockPlaylistById,
  getMockPlaylistTracks,
  getMockPlaylists,
  removeMockTrackFromPlaylist,
  renameMockPlaylist,
} from '../../mocks/library';

export async function createPlaylist(name: string): Promise<string> {
  const playlist = addMockPlaylist(name);
  return playlist.id;
}

export async function getPlaylists(): Promise<Playlist[]> {
  return getMockPlaylists();
}

export async function getPlaylist(id: string): Promise<Playlist | null> {
  return getMockPlaylistById(id);
}

export async function getPlaylistTracks(id: string): Promise<Track[]> {
  return getMockPlaylistTracks(id);
}

export async function addToPlaylist(playlistId: string, trackId: string): Promise<void> {
  appendMockTrackToPlaylist(playlistId, trackId);
}

export async function removeFromPlaylist(playlistId: string, trackIndex: number): Promise<Track | null> {
  removeMockTrackFromPlaylist(playlistId, trackIndex);
  return null;
}

export async function updatePlaylistMetadata(
  id: string,
  name: string | null,
  _description: string | null
): Promise<void> {
  if (typeof name === 'string' && name.trim()) {
    renameMockPlaylist(id, name.trim());
  }
}

