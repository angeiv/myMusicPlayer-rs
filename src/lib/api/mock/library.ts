import {
  createScanStatus,
  type Album,
  type Artist,
  type LibraryScanRequest,
  type ScanMode,
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

function normalizeLibraryScanRequest(
  requestOrPaths: LibraryScanRequest | string[],
): LibraryScanRequest {
  if (Array.isArray(requestOrPaths)) {
    return { paths: [...requestOrPaths] };
  }

  return {
    ...requestOrPaths,
    paths: [...requestOrPaths.paths],
  };
}

function resolveMockScanMode(request: LibraryScanRequest): ScanMode {
  if (request.mode) {
    return request.mode;
  }

  return getMockTracks().length > 0 ? 'incremental' : 'full';
}

export async function startLibraryScan(
  requestOrPaths: LibraryScanRequest | string[],
): Promise<void> {
  const request = normalizeLibraryScanRequest(requestOrPaths);
  const now = Date.now();

  scanStatus = createScanStatus({
    phase: 'completed',
    mode: resolveMockScanMode(request),
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

export async function hasLibraryTracks(): Promise<boolean> {
  return getMockTracks().length > 0;
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
