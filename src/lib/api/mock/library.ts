import {
  createScanStatus,
  type Album,
  type Artist,
  type ScanStatus,
  type SearchResults,
  type Track,
} from '../../types';
import {
  getMockAlbumById,
  getMockAlbums,
  getMockAlbumsByArtist,
  getMockArtistById,
  getMockArtists,
  getMockTracks,
  getMockTracksByAlbum,
  getMockTracksByArtist,
  searchMockLibrary,
} from '../../mocks/library';

let scanStatus: ScanStatus = createScanStatus();

export async function startLibraryScan(_paths: string[]): Promise<void> {
  const now = Date.now();
  scanStatus = createScanStatus({
    phase: 'completed',
    started_at_ms: now,
    ended_at_ms: now,
  });
}

export async function getLibraryScanStatus(): Promise<ScanStatus> {
  return createScanStatus(scanStatus);
}

export async function cancelLibraryScan(): Promise<void> {
  // no-op in web mode
}

export async function scanDirectory(_path: string): Promise<number> {
  return 0;
}

export async function getTracks(): Promise<Track[]> {
  return getMockTracks();
}

export async function getTrack(id: string): Promise<Track | null> {
  const tracks = getMockTracks();
  return tracks.find((track) => track.id === id) ?? null;
}

export async function getAlbums(): Promise<Album[]> {
  return getMockAlbums();
}

export async function getAlbum(id: string): Promise<Album | null> {
  return getMockAlbumById(id);
}

export async function getArtists(): Promise<Artist[]> {
  return getMockArtists();
}

export async function getArtist(id: string): Promise<Artist | null> {
  return getMockArtistById(id);
}

export async function getTracksByAlbum(albumId: string): Promise<Track[]> {
  return getMockTracksByAlbum(albumId);
}

export async function getTracksByArtist(artistId: string): Promise<Track[]> {
  return getMockTracksByArtist(artistId);
}

export async function getAlbumsByArtist(artistId: string): Promise<Album[]> {
  return getMockAlbumsByArtist(artistId);
}

export async function searchLibrary(query: string): Promise<SearchResults> {
  return searchMockLibrary(query);
}
