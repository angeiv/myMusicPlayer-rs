import { derived, writable, type Readable, type Writable } from 'svelte/store';

import * as configApi from '../../api/config';
import * as libraryApi from '../../api/library';
import * as playbackApi from '../../api/playback';
import * as playlistApi from '../../api/playlist';
import type { Album, Artist, Playlist, SearchResults, ThemeOption, Track } from '../../types';
import type { RouteMatch } from '../../routing/routes';
import { normalizeConfigForRestore } from '../../transport/config';
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
  setOutputDevice: (deviceId: string) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  scanDirectory: (path: string) => Promise<unknown>;
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
  isLibraryLoading: Writable<boolean>;
  isSearching: Writable<boolean>;
  searchResults: Writable<SearchResults | null>;
  bootstrap: () => Promise<void>;
  loadLibrary: () => Promise<void>;
  loadPlaylists: () => Promise<void>;
  syncRouteSearch: (route: RouteMatch) => Promise<void>;
  createPlaylistFromPrompt: () => Promise<void>;
};

function defaultDependencies(): AppShellStoreDependencies {
  return {
    bootstrapDesktopShell: configApi.bootstrapDesktopShell,
    getConfig: configApi.getConfig,
    normalizeConfigForRestore,
    applyTheme: applyThemeToDocument,
    setOutputDevice: playbackApi.setOutputDevice,
    setVolume: playbackApi.setVolume,
    scanDirectory: libraryApi.scanDirectory,
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

export function createAppShellStore(
  overrides: Partial<AppShellStoreDependencies> = {}
): AppShellStore {
  const deps: AppShellStoreDependencies = { ...defaultDependencies(), ...overrides };

  const tracks = writable<Track[]>([]);
  const albums = writable<Album[]>([]);
  const artists = writable<Artist[]>([]);
  const playlists = writable<Playlist[]>([]);
  const isLibraryLoading = writable<boolean>(false);
  const isSearching = writable<boolean>(false);
  const searchResults = writable<SearchResults | null>(null);

  const counts = derived([tracks, albums, artists], ([$tracks, $albums, $artists]) => ({
    songs: $tracks.length,
    albums: $albums.length,
    artists: $artists.length,
  }));

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

    if (restored.outputDeviceId) {
      await deps.setOutputDevice(restored.outputDeviceId);
    }

    if (typeof restored.defaultVolume === 'number') {
      await deps.setVolume(restored.defaultVolume);
    }

    if (restored.autoScan) {
      isLibraryLoading.set(true);
      try {
        for (const path of restored.libraryPaths) {
          await deps.scanDirectory(path);
        }
      } finally {
        isLibraryLoading.set(false);
      }
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
    isLibraryLoading,
    isSearching,
    searchResults,
    bootstrap,
    loadLibrary,
    loadPlaylists,
    syncRouteSearch,
    createPlaylistFromPrompt,
  };
}

