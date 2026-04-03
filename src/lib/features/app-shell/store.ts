import { derived, writable, type Readable, type Writable } from 'svelte/store';

import * as configApi from '../../api/config';
import * as libraryApi from '../../api/library';
import * as playlistApi from '../../api/playlist';
import type {
  Album,
  Artist,
  LibraryScanRequest,
  LibraryWatcherStatus,
  Playlist,
  ScanStatus,
  SearchResults,
  ThemeOption,
  Track,
} from '../../types';
import type { LibraryMaintenanceState } from '../library-scan/maintenance';
import type { RouteMatch } from '../../routing/routes';
import { normalizeConfigForRestore } from '../../transport/config';
import { createLibraryScanStore } from '../library-scan/store';
import { applyThemeToDocument } from './theme';

export type AppShellStoreDependencies = {
  bootstrapDesktopShell: () => Promise<void>;
  getConfig: () => Promise<unknown>;
  normalizeConfigForRestore: (config: unknown) => {
    theme: ThemeOption;
    outputDeviceId: string | null;
    defaultVolume: number | null;
    autoScan: boolean;
    libraryPaths: string[];
  };
  applyTheme: (theme: ThemeOption) => void;
  hasLibraryTracks: () => Promise<boolean>;
  startLibraryScan: (requestOrPaths: LibraryScanRequest | string[]) => Promise<void>;
  getLibraryScanStatus: () => Promise<ScanStatus>;
  getLibraryWatcherStatus: () => Promise<LibraryWatcherStatus>;
  cancelLibraryScan: () => Promise<void>;
  getTracks: () => Promise<Track[]>;
  getAlbums: () => Promise<Album[]>;
  getArtists: () => Promise<Artist[]>;
  getPlaylists: () => Promise<Playlist[]>;
  createPlaylist: (name: string) => Promise<unknown>;
  searchLibrary: (query: string) => Promise<SearchResults>;
  prompt: (message: string) => string | null;
  alert: (message: string) => void;
};

export type AppShellStore = {
  tracks: Writable<Track[]>;
  albums: Writable<Album[]>;
  artists: Writable<Artist[]>;
  playlists: Writable<Playlist[]>;
  counts: Readable<{ songs: number; albums: number; artists: number }>;
  scanStatus: Readable<ScanStatus>;
  watcherStatus: Readable<LibraryWatcherStatus>;
  maintenance: Readable<LibraryMaintenanceState>;
  isScanning: Readable<boolean>;
  isLibraryLoading: Writable<boolean>;
  isSearching: Writable<boolean>;
  searchResults: Writable<SearchResults | null>;
  bootstrap: () => Promise<void>;
  loadLibrary: () => Promise<void>;
  loadPlaylists: () => Promise<void>;
  refreshLibraryMaintenance: () => Promise<LibraryMaintenanceState>;
  runLibraryScan: (requestOrPaths: LibraryScanRequest | string[]) => Promise<ScanStatus>;
  cancelLibraryScan: () => Promise<void>;
  syncRouteSearch: (route: RouteMatch) => Promise<void>;
  createPlaylistFromPrompt: () => Promise<void>;
};

function defaultDependencies(): AppShellStoreDependencies {
  return {
    bootstrapDesktopShell: configApi.bootstrapDesktopShell,
    getConfig: configApi.getConfig,
    normalizeConfigForRestore,
    applyTheme: applyThemeToDocument,
    hasLibraryTracks: libraryApi.hasLibraryTracks,
    startLibraryScan: libraryApi.startLibraryScan,
    getLibraryScanStatus: libraryApi.getLibraryScanStatus,
    getLibraryWatcherStatus: libraryApi.getLibraryWatcherStatus,
    cancelLibraryScan: libraryApi.cancelLibraryScan,
    getTracks: libraryApi.getTracks,
    getAlbums: libraryApi.getAlbums,
    getArtists: libraryApi.getArtists,
    getPlaylists: playlistApi.getPlaylists,
    createPlaylist: playlistApi.createPlaylist,
    searchLibrary: libraryApi.searchLibrary,
    prompt: (message) => (typeof window !== 'undefined' ? window.prompt(message) : null),
    alert: (message) => {
      if (typeof window !== 'undefined') window.alert(message);
    },
  };
}

function isActiveScanPhase(phase: ScanStatus['phase']): boolean {
  return phase === 'running' || phase === 'cancelling';
}

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

export function createAppShellStore(
  overrides: Partial<AppShellStoreDependencies> = {},
): AppShellStore {
  const deps: AppShellStoreDependencies = { ...defaultDependencies(), ...overrides };

  const tracks = writable<Track[]>([]);
  const albums = writable<Album[]>([]);
  const artists = writable<Artist[]>([]);
  const playlists = writable<Playlist[]>([]);
  const isLibraryLoading = writable<boolean>(false);
  const isSearching = writable<boolean>(false);
  const searchResults = writable<SearchResults | null>(null);

  const scan = createLibraryScanStore({
    startLibraryScan: deps.startLibraryScan,
    getLibraryScanStatus: deps.getLibraryScanStatus,
    getLibraryWatcherStatus: deps.getLibraryWatcherStatus,
    cancelLibraryScan: deps.cancelLibraryScan,
  });

  const scanStatus = scan.status;
  const watcherStatus = scan.watcherStatus;
  const maintenance = scan.maintenance;
  const isScanning = scan.isScanning;

  const counts = derived([tracks, albums, artists], ([$tracks, $albums, $artists]) => ({
    songs: $tracks.length,
    albums: $albums.length,
    artists: $artists.length,
  }));

  async function waitForScanToFinish(): Promise<ScanStatus> {
    return new Promise((resolve) => {
      let unsubscribe: (() => void) | undefined;
      let pendingUnsubscribe = false;
      let settled = false;

      const settle = (status: ScanStatus) => {
        if (settled) return;
        settled = true;

        if (unsubscribe) {
          unsubscribe();
        } else {
          pendingUnsubscribe = true;
        }

        resolve(status);
      };

      unsubscribe = scanStatus.subscribe((status) => {
        if (!isActiveScanPhase(status.phase)) {
          settle(status);
        }
      });

      if (pendingUnsubscribe && unsubscribe) {
        unsubscribe();
      }
    });
  }

  async function resolveLibraryScanRequest(
    requestOrPaths: LibraryScanRequest | string[],
  ): Promise<LibraryScanRequest> {
    const request = normalizeLibraryScanRequest(requestOrPaths);
    if (request.mode) {
      return request;
    }

    try {
      const hasTracks = await deps.hasLibraryTracks();
      return {
        ...request,
        mode: hasTracks ? 'incremental' : 'full',
      };
    } catch (error) {
      console.error('Failed to determine library scan mode:', error);
      return request;
    }
  }

  async function refreshLibraryMaintenance(): Promise<LibraryMaintenanceState> {
    return scan.refreshMaintenance();
  }

  async function runLibraryScan(
    requestOrPaths: LibraryScanRequest | string[],
  ): Promise<ScanStatus> {
    isLibraryLoading.set(true);
    try {
      const request = await resolveLibraryScanRequest(requestOrPaths);
      await scan.start(request);
      return await waitForScanToFinish();
    } finally {
      isLibraryLoading.set(false);
    }
  }

  async function cancelLibraryScan(): Promise<void> {
    await scan.cancel();
  }

  async function loadLibrary(): Promise<void> {
    isLibraryLoading.set(true);
    try {
      const [nextTracks, nextAlbums, nextArtists] = await Promise.all([
        deps.getTracks(),
        deps.getAlbums(),
        deps.getArtists(),
      ]);
      tracks.set(nextTracks ?? []);
      albums.set(nextAlbums ?? []);
      artists.set(nextArtists ?? []);
    } catch (error) {
      console.error('Failed to load library:', error);
      tracks.set([]);
      albums.set([]);
      artists.set([]);
    } finally {
      isLibraryLoading.set(false);
    }
  }

  async function loadPlaylists(): Promise<void> {
    try {
      const nextPlaylists = await deps.getPlaylists();
      playlists.set(nextPlaylists ?? []);
    } catch (error) {
      console.error('Failed to load playlists:', error);
      playlists.set([]);
    }
  }

  async function bootstrap(): Promise<void> {
    await deps.bootstrapDesktopShell();

    const config = await deps.getConfig();
    const restored = deps.normalizeConfigForRestore(config);

    deps.applyTheme(restored.theme);

    if (restored.autoScan && restored.libraryPaths.length > 0) {
      await runLibraryScan({ paths: restored.libraryPaths });
    }

    await loadLibrary();
    await loadPlaylists();
  }

  async function syncRouteSearch(route: RouteMatch): Promise<void> {
    if (route.name !== 'search') {
      isSearching.set(false);
      searchResults.set(null);
      return;
    }

    const query = route.query.trim();
    if (!query) {
      isSearching.set(false);
      searchResults.set(null);
      return;
    }

    isSearching.set(true);
    try {
      const results = await deps.searchLibrary(query);
      searchResults.set(results);
    } catch (error) {
      console.error('Search failed:', error);
      searchResults.set(null);
    } finally {
      isSearching.set(false);
    }
  }

  async function createPlaylistFromPrompt(): Promise<void> {
    const name = deps.prompt('Create playlist');
    const trimmed = name?.trim() ?? '';
    if (!trimmed) return;

    try {
      await deps.createPlaylist(trimmed);
      await loadPlaylists();
    } catch (error) {
      console.error('Failed to create playlist:', error);
      deps.alert('Failed to create playlist.');
    }
  }

  return {
    tracks,
    albums,
    artists,
    playlists,
    counts,
    scanStatus,
    watcherStatus,
    maintenance,
    isScanning,
    isLibraryLoading,
    isSearching,
    searchResults,
    bootstrap,
    loadLibrary,
    loadPlaylists,
    refreshLibraryMaintenance,
    runLibraryScan,
    cancelLibraryScan,
    syncRouteSearch,
    createPlaylistFromPrompt,
  };
}
