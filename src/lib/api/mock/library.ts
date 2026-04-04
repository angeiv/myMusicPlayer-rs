import {
  createLibraryWatcherStatus,
  createScanStatus,
  type Album,
  type Artist,
  type LibraryScanRequest,
  type LibraryWatcherStatus,
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

export type MockLibraryMaintenanceSnapshot = {
  scanStatus: ScanStatus;
  watcherStatus: LibraryWatcherStatus;
};

export type MockLibraryMaintenanceSnapshotPatch = {
  scanStatus?: Partial<ScanStatus>;
  watcherStatus?: Partial<LibraryWatcherStatus>;
};

function cloneMaintenanceSnapshot(
  snapshot: MockLibraryMaintenanceSnapshot,
): MockLibraryMaintenanceSnapshot {
  return {
    scanStatus: createScanStatus(snapshot.scanStatus),
    watcherStatus: createLibraryWatcherStatus(snapshot.watcherStatus),
  };
}

function createInitialMaintenanceSnapshot(): MockLibraryMaintenanceSnapshot {
  return {
    scanStatus: createScanStatus(),
    watcherStatus: createLibraryWatcherStatus(),
  };
}

const initialMaintenance = createInitialMaintenanceSnapshot();

let scanStatus: ScanStatus = createScanStatus(initialMaintenance.scanStatus);
let watcherStatus: LibraryWatcherStatus = createLibraryWatcherStatus(initialMaintenance.watcherStatus);

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

export function getMockLibraryMaintenanceSnapshot(): MockLibraryMaintenanceSnapshot {
  return cloneMaintenanceSnapshot({
    scanStatus,
    watcherStatus,
  });
}

export function setMockLibraryMaintenanceSnapshot(
  next: MockLibraryMaintenanceSnapshotPatch,
): MockLibraryMaintenanceSnapshot {
  if (next.scanStatus) {
    scanStatus = createScanStatus(next.scanStatus);
  }

  if (next.watcherStatus) {
    watcherStatus = createLibraryWatcherStatus(next.watcherStatus);
  }

  return getMockLibraryMaintenanceSnapshot();
}

export function resetMockLibraryMaintenanceSnapshot(): MockLibraryMaintenanceSnapshot {
  scanStatus = createScanStatus(initialMaintenance.scanStatus);
  watcherStatus = createLibraryWatcherStatus(initialMaintenance.watcherStatus);
  return getMockLibraryMaintenanceSnapshot();
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
  watcherStatus = createLibraryWatcherStatus({
    watched_roots: [...request.paths],
    dirty_roots: [],
    queued_follow_up: false,
    active_scan_phase: null,
    last_requested_scan: {
      requested_at_ms: now,
      roots: [...request.paths],
    },
    last_trigger: null,
    last_error: null,
  });
}

export async function getLibraryScanStatus(): Promise<ScanStatus> {
  return createScanStatus(scanStatus);
}

export async function getLibraryWatcherStatus(): Promise<LibraryWatcherStatus> {
  return createLibraryWatcherStatus(watcherStatus);
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
