import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';

import * as playbackApi from '../lib/api/playback';
import { deriveAppShellRouteState } from '../lib/features/app-shell/navigation';
import { SCAN_STATUS_POLL_INTERVAL_MS } from '../lib/features/library-scan/store';
import { createAppShellStore } from '../lib/features/app-shell/store';
import {
  createLibraryWatcherStatus,
  createScanStatus,
  type Album,
  type Artist,
  type LibraryScanRequest,
  type LibraryWatcherStatus,
  type Playlist,
  type ScanStatus,
  type SearchResults,
  type Track,
} from '../lib/types';

const tracksFixture: Track[] = [
  {
    id: 'track-1',
    title: 'Signal Bloom',
    duration: 180,
    path: '/music/signal-bloom.flac',
    library_root: '/music',
    size: 123,
    file_mtime_ms: 1_710_000_000_000,
    format: 'flac',
    bitrate: 320,
    sample_rate: 48_000,
    channels: 2,
    availability: 'available',
    missing_since: null,
    play_count: 0,
    date_added: '2024-01-01T00:00:00Z',
  },
];

const albumsFixture: Album[] = [
  {
    id: 'album-1',
    title: 'Late Transit',
    track_count: 1,
    duration: 180,
    date_added: '2024-01-01T00:00:00Z',
  },
];

const artistsFixture: Artist[] = [
  {
    id: 'artist-1',
    name: 'Night Engines',
    album_count: 1,
    track_count: 1,
    date_added: '2024-01-01T00:00:00Z',
  },
];

const playlistsFixture: Playlist[] = [
  {
    id: 'playlist-1',
    name: 'After Hours',
    track_ids: ['track-1'],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

const searchResultsFixture: SearchResults = {
  tracks: tracksFixture,
  albums: albumsFixture,
  artists: artistsFixture,
};

function createStatus(overrides: Partial<ScanStatus> = {}): ScanStatus {
  return createScanStatus(overrides);
}

function createWatcherStatus(
  overrides: Partial<LibraryWatcherStatus> = {},
): LibraryWatcherStatus {
  return createLibraryWatcherStatus(overrides);
}

function formatScanRequest(requestOrPaths: LibraryScanRequest | string[]): string {
  const request = Array.isArray(requestOrPaths) ? { paths: requestOrPaths } : requestOrPaths;
  const mode = request.mode ?? 'auto';
  return `startLibraryScan:${mode}:${request.paths.join(',')}`;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('deriveAppShellRouteState', () => {
  it('maps routes into shell selection state and clears search outside search routes', () => {
    expect(deriveAppShellRouteState({ name: 'home' })).toEqual({
      activeSection: 'home',
      activeLibraryView: 'songs',
      activePlaylistId: null,
      searchTerm: '',
    });
    expect(deriveAppShellRouteState({ name: 'playlistDetail', id: 'playlist-1' })).toEqual({
      activeSection: 'library',
      activeLibraryView: 'playlistDetail',
      activePlaylistId: 'playlist-1',
      searchTerm: '',
    });
    expect(deriveAppShellRouteState({ name: 'search', query: 'aurora' })).toEqual({
      activeSection: 'library',
      activeLibraryView: 'songs',
      activePlaylistId: null,
      searchTerm: 'aurora',
    });
  });
});

describe('createAppShellStore', () => {
  it('boots with an incremental auto-scan when the backend already has library tracks', async () => {
    vi.useFakeTimers();

    try {
      await playbackApi.setOutputDevice('default');
      await playbackApi.setVolume(0.7);

      const calls: string[] = [];
      const runningStatus = createStatus({
        phase: 'running',
        mode: 'incremental',
        current_path: '/music/a/signal-bloom.flac',
        processed_files: 3,
        inserted_tracks: 1,
        changed_tracks: 1,
        unchanged_files: 1,
        restored_tracks: 0,
        missing_tracks: 0,
      });
      const completedStatus = createStatus({
        phase: 'completed',
        mode: 'incremental',
        started_at_ms: 100,
        ended_at_ms: 200,
        processed_files: 5,
        inserted_tracks: 1,
        changed_tracks: 1,
        unchanged_files: 2,
        restored_tracks: 1,
        missing_tracks: 1,
        error_count: 1,
        sample_errors: [
          {
            path: '/offline-drive',
            message: 'Root path does not exist or is not a directory',
            kind: 'invalid_path',
          },
        ],
      });

      const getLibraryScanStatus = vi
        .fn<() => Promise<ScanStatus>>()
        .mockImplementationOnce(async () => {
          calls.push('getLibraryScanStatus:running');
          return runningStatus;
        })
        .mockImplementationOnce(async () => {
          calls.push('getLibraryScanStatus:completed');
          return completedStatus;
        })
        .mockResolvedValue(completedStatus);

      const store = createAppShellStore({
        bootstrapDesktopShell: async () => {
          calls.push('bootstrapDesktopShell');
        },
        getConfig: async () => {
          calls.push('getConfig');
          return { raw: true };
        },
        normalizeConfigForRestore: () => {
          calls.push('normalizeConfigForRestore');
          return {
            theme: 'dark',
            outputDeviceId: 'device-1',
            defaultVolume: 0.35,
            autoScan: true,
            libraryPaths: ['/music/a', '/music/b'],
          };
        },
        applyTheme: (theme) => {
          calls.push(`applyTheme:${theme}`);
        },
        hasLibraryTracks: async () => {
          calls.push('hasLibraryTracks');
          return true;
        },
        startLibraryScan: async (request) => {
          calls.push(formatScanRequest(request));
        },
        getLibraryScanStatus,
        cancelLibraryScan: async () => {
          calls.push('cancelLibraryScan');
        },
        getTracks: async () => {
          calls.push('getTracks');
          return tracksFixture;
        },
        getAlbums: async () => {
          calls.push('getAlbums');
          return albumsFixture;
        },
        getArtists: async () => {
          calls.push('getArtists');
          return artistsFixture;
        },
        getPlaylists: async () => {
          calls.push('getPlaylists');
          return playlistsFixture;
        },
        createPlaylist: async () => undefined,
        searchLibrary: async () => searchResultsFixture,
        prompt: () => null,
        alert: () => undefined,
      });

      const bootstrapPromise = store.bootstrap();
      await flushPromises();
      await flushPromises();

      expect(calls).toEqual([
        'bootstrapDesktopShell',
        'getConfig',
        'normalizeConfigForRestore',
        'applyTheme:dark',
        'hasLibraryTracks',
        'startLibraryScan:incremental:/music/a,/music/b',
        'getLibraryScanStatus:running',
      ]);

      await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS);
      await flushPromises();
      await bootstrapPromise;

      expect(calls).toEqual([
        'bootstrapDesktopShell',
        'getConfig',
        'normalizeConfigForRestore',
        'applyTheme:dark',
        'hasLibraryTracks',
        'startLibraryScan:incremental:/music/a,/music/b',
        'getLibraryScanStatus:running',
        'getLibraryScanStatus:completed',
        'getTracks',
        'getAlbums',
        'getArtists',
        'getPlaylists',
      ]);

      expect(await playbackApi.getOutputDevice()).toBeNull();
      expect(await playbackApi.getVolume()).toBeCloseTo(0.7);

      expect(get(store.scanStatus)).toEqual(completedStatus);
      expect(get(store.scanStatus).mode).toBe('incremental');
      expect(get(store.isScanning)).toBe(false);
      expect(get(store.tracks)).toEqual(tracksFixture);
      expect(get(store.playlists)).toEqual(playlistsFixture);
      expect(get(store.counts)).toEqual({ songs: 1, albums: 1, artists: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to a full default scan when the backend reports an empty library', async () => {
    const completedStatus = createStatus({
      phase: 'completed',
      mode: 'full',
      ended_at_ms: 123,
      processed_files: 7,
      inserted_tracks: 7,
    });

    const hasLibraryTracks = vi.fn(async () => false);
    const startLibraryScan = vi.fn(async () => undefined);
    const getLibraryScanStatus = vi.fn(async () => completedStatus);

    const store = createAppShellStore({
      hasLibraryTracks,
      startLibraryScan,
      getLibraryScanStatus,
      cancelLibraryScan: async () => undefined,
    });

    const result = await store.runLibraryScan(['/music']);

    expect(hasLibraryTracks).toHaveBeenCalledTimes(1);
    expect(startLibraryScan).toHaveBeenCalledWith({ paths: ['/music'], mode: 'full' });
    expect(result).toEqual(completedStatus);
    expect(get(store.scanStatus)).toEqual(completedStatus);
  });

  it('exposes the shared watcher-backed maintenance snapshot without creating a second app-shell policy', async () => {
    const watcherStatus = createWatcherStatus({
      watched_roots: ['/music', '/music/live'],
      dirty_roots: ['/music/live'],
      queued_follow_up: false,
      active_scan_phase: null,
      last_requested_scan: {
        requested_at_ms: 125,
        roots: ['/music/live'],
      },
      last_error: 'Failed to schedule watcher batch: permissions denied',
    });
    const getLibraryWatcherStatus = vi.fn(async () => watcherStatus);

    const store = createAppShellStore({
      getLibraryScanStatus: vi.fn(async () => createStatus({ phase: 'idle' })),
      getLibraryWatcherStatus,
      cancelLibraryScan: async () => undefined,
    });

    const maintenance = await store.refreshLibraryMaintenance();

    expect(getLibraryWatcherStatus).toHaveBeenCalledTimes(1);
    expect(get(store.watcherStatus)).toStrictEqual(watcherStatus);
    expect(maintenance).toMatchObject({
      title: 'Auto-sync needs attention',
      tone: 'warning',
      watchedRoots: ['/music', '/music/live'],
      dirtyRoots: ['/music/live'],
      lastError: 'Failed to schedule watcher batch: permissions denied',
      nextStep: { kind: 'rescan', label: 'Rescan Now' },
    });

    const publicMaintenance = get(store.maintenance);
    publicMaintenance.watchedRoots.push('/mutated');
    publicMaintenance.watcherStatus.dirty_roots.push('/mutated');

    expect(get(store.maintenance).watchedRoots).toStrictEqual(['/music', '/music/live']);
    expect(get(store.maintenance).watcherStatus.dirty_roots).toStrictEqual(['/music/live']);
  });

  it('executes search routes and clears results for empty or non-search routes', async () => {
    const searchLibrary = vi.fn(async (term: string) => ({
      ...searchResultsFixture,
      tracks: tracksFixture.map((track) => ({ ...track, title: `${track.title}:${term}` })),
    }));
    const store = createAppShellStore({ searchLibrary });

    await store.syncRouteSearch({ name: 'search', query: '  aurora  ' });
    expect(searchLibrary).toHaveBeenCalledWith('aurora');
    expect(get(store.searchResults)?.tracks[0]?.title).toBe('Signal Bloom:aurora');

    await store.syncRouteSearch({ name: 'search', query: '   ' });
    expect(get(store.searchResults)).toBeNull();
    expect(get(store.isSearching)).toBe(false);

    await store.syncRouteSearch({ name: 'albums' });
    expect(get(store.searchResults)).toBeNull();
    expect(get(store.isSearching)).toBe(false);
  });

  it('creates a playlist through the extracted prompt flow and refreshes playlists', async () => {
    const createPlaylist = vi.fn(async () => undefined);
    const getPlaylists = vi
      .fn<() => Promise<Playlist[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(playlistsFixture);

    const store = createAppShellStore({
      getPlaylists,
      createPlaylist,
      prompt: () => '  Road Trip  ',
      alert: () => undefined,
    });

    await store.loadPlaylists();
    await store.createPlaylistFromPrompt();

    expect(createPlaylist).toHaveBeenCalledWith('Road Trip');
    expect(getPlaylists).toHaveBeenCalledTimes(2);
    expect(get(store.playlists)).toEqual(playlistsFixture);
  });
});
