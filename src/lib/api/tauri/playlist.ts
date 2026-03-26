import { invoke } from '@tauri-apps/api/core';

import type { Playlist, Track } from '../../types';

type AddTracksToPlaylistPayload = {
  added?: number;
  total?: number;
  failed_track_ids?: string[];
  failedTrackIds?: string[];
};

export type AddTracksToPlaylistResult = {
  added: number;
  total: number;
  failedTrackIds: string[];
};

export async function createPlaylist(name: string): Promise<string> {
  return invoke<string>('create_playlist', { name });
}

export async function getPlaylists(): Promise<Playlist[]> {
  const payload = await invoke<Playlist[] | undefined>('get_playlists');
  return payload ?? [];
}

export async function getPlaylist(id: string): Promise<Playlist | null> {
  const payload = await invoke<Playlist | undefined>('get_playlist', { id });
  return payload ?? null;
}

export async function getPlaylistTracks(id: string): Promise<Track[]> {
  const payload = await invoke<Track[] | undefined>('get_playlist_tracks', { id });
  return payload ?? [];
}

export async function addToPlaylist(playlistId: string, trackId: string): Promise<void> {
  await invoke('add_to_playlist', { playlistId, trackId });
}

export async function addTracksToPlaylist(
  playlistId: string,
  trackIds: string[]
): Promise<AddTracksToPlaylistResult> {
  const payload = await invoke<AddTracksToPlaylistPayload | undefined>('add_tracks_to_playlist', {
    playlistId,
    trackIds,
  });

  return {
    added: payload?.added ?? 0,
    total: payload?.total ?? trackIds.length,
    failedTrackIds: payload?.failedTrackIds ?? payload?.failed_track_ids ?? [],
  };
}

export async function removeFromPlaylist(playlistId: string, trackIndex: number): Promise<Track | null> {
  const payload = await invoke<Track | null>('remove_from_playlist', { playlistId, trackIndex });
  return payload ?? null;
}

export async function updatePlaylistMetadata(
  id: string,
  name: string | null,
  description: string | null
): Promise<void> {
  await invoke('update_playlist_metadata', { id, name, description });
}

