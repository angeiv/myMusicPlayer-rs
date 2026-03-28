import { invoke } from '@tauri-apps/api/core';

import type { Album, Artist, ScanStatus, SearchResults, Track } from '../../types';
import { normalizeSearchResults } from '../../transport/search';

export async function scanDirectory(path: string): Promise<number> {
  return invoke<number>('scan_directory', { path });
}

export async function getTracks(): Promise<Track[]> {
  const payload = await invoke<Track[] | undefined>('get_tracks');
  return payload ?? [];
}

export async function getTrack(id: string): Promise<Track | null> {
  const payload = await invoke<Track | undefined>('get_track', { id });
  return payload ?? null;
}

export async function getAlbums(): Promise<Album[]> {
  const payload = await invoke<Album[] | undefined>('get_albums');
  return payload ?? [];
}

export async function getAlbum(id: string): Promise<Album | null> {
  const payload = await invoke<Album | undefined>('get_album', { id });
  return payload ?? null;
}

export async function getArtists(): Promise<Artist[]> {
  const payload = await invoke<Artist[] | undefined>('get_artists');
  return payload ?? [];
}

export async function getArtist(id: string): Promise<Artist | null> {
  const payload = await invoke<Artist | undefined>('get_artist', { id });
  return payload ?? null;
}

export async function getTracksByAlbum(albumId: string): Promise<Track[]> {
  const payload = await invoke<Track[] | undefined>('get_tracks_by_album', { albumId });
  return payload ?? [];
}

export async function getTracksByArtist(artistId: string): Promise<Track[]> {
  const payload = await invoke<Track[] | undefined>('get_tracks_by_artist', { artistId });
  return payload ?? [];
}

export async function getAlbumsByArtist(artistId: string): Promise<Album[]> {
  const payload = await invoke<Album[] | undefined>('get_albums_by_artist', { artistId });
  return payload ?? [];
}

export async function searchLibrary(query: string): Promise<SearchResults> {
  const payload = await invoke<unknown>('search', { query });
  return normalizeSearchResults(payload);
}

export async function startLibraryScan(paths: string[]): Promise<void> {
  return invoke<void>('start_library_scan', { paths });
}

export async function getLibraryScanStatus(): Promise<ScanStatus> {
  return invoke<ScanStatus>('get_library_scan_status');
}

export async function cancelLibraryScan(): Promise<void> {
  return invoke<void>('cancel_library_scan');
}

