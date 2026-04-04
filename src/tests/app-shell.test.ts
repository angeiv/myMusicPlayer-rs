import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';

import * as playbackApi from '../lib/api/playback';
import { deriveAppShellRouteState } from '../lib/features/app-shell/navigation';
import { SCAN_STATUS_POLL_INTERVAL_MS } from '../lib/features/library-scan/store';
import {
  MAINTENANCE_HEARTBEAT_INTERVAL_MS,
  createAppShellStore,
} from '../lib/features/app-shell/store';
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
      const getLibraryWatcherStatus = vi
        .fn<() => Promise<LibraryWatcherStatus>>()
        .mockImplementationOnce(async () => {
          calls.push('getLibraryWatcherStatus:running');
          return createWatcherStatus({
            watched_roots: ['/music/a', '/music/b'],
            dirty_roots: ['/music/a'],
            queued_follow_up: false,
            active_scan_phase: 'running',
            last_requested_scan: {
              requested_at_ms: 100,
              roots: ['/music/a', '/music/b'],
            },
          });
        })
        .mockImplementationOnce(async () => {
          calls.push('getLibraryWatcherStatus:completed');
          return createWatcherStatus({
            watched_roots: ['/music/a', '/music/b'],
            dirty_roots: [],
            queued_follow_up: false,
            active_scan_phase: null,
            last_requested_scan: {
              requested_at_ms: 100,
              roots: ['/music/a', '/music/b'],
            },
          });
        })
        .mockResolvedValue(
          createWatcherStatus({
            watched_roots: ['/music/a', '/music/b'],
            dirty_roots: [],
            queued_follow_up: false,
            active_scan_phase: null,
            last_requested_scan: {
              requested_at_ms: 100,
              roots: ['/music/a', '/music/b'],
            },
          }),
        );

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
        getLibraryWatcherStatus,
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

      expect(calls.slice(0, 6)).toEqual([
        'bootstrapDesktopShell',
        'getConfig',
        'normalizeConfigForRestore',
        'applyTheme:dark',
        'getLibraryScanStatus:running',
        'getLibraryWatcherStatus:running',
      ]);

      await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS);
      await flushPromises();
      await bootstrapPromise;

      expect(calls).toEqual([
        'bootstrapDesktopShell',
        'getConfig',
        'normalizeConfigForRestore',
        'applyTheme:dark',
        'getLibraryScanStatus:running',
        'getLibraryWatcherStatus:running',
        'hasLibraryTracks',
        'startLibraryScan:incremental:/music/a,/music/b',
        'getLibraryScanStatus:completed',
        'getLibraryWatcherStatus:completed',
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

  it('waits for watcher follow-up maintenance to settle before resolving manual scans', async () => {
    vi.useFakeTimers();

    try {
      const startLibraryScan = vi.fn(async () => undefined);
      const getLibraryScanStatus = vi
        .fn<() => Promise<ScanStatus>>()
        .mockResolvedValueOnce(
          createStatus({
            phase: 'running',
            mode: 'incremental',
            started_at_ms: 100,
            current_path: '/music/intro.flac',
            processed_files: 1,
          }),
        )
        .mockResolvedValueOnce(
          createStatus({
            phase: 'completed',
            mode: 'incremental',
            started_at_ms: 100,
            ended_at_ms: 200,
            processed_files: 8,
            changed_tracks: 1,
          }),
        )
        .mockResolvedValueOnce(
          createStatus({
            phase: 'running',
            mode: 'incremental',
            started_at_ms: 220,
            current_path: '/music/outro.flac',
            processed_files: 2,
          }),
        )
        .mockResolvedValue(
          createStatus({
            phase: 'completed',
            mode: 'incremental',
            started_at_ms: 220,
            ended_at_ms: 320,
            processed_files: 12,
            changed_tracks: 2,
          }),
        );
      const getLibraryWatcherStatus = vi
        .fn<() => Promise<LibraryWatcherStatus>>()
        .mockResolvedValueOnce(
          createWatcherStatus({
            watched_roots: ['/music'],
            dirty_roots: ['/music'],
            queued_follow_up: true,
            active_scan_phase: 'running',
            last_requested_scan: {
              requested_at_ms: 110,
              roots: ['/music'],
            },
          }),
        )
        .mockResolvedValueOnce(
          createWatcherStatus({
            watched_roots: ['/music'],
            dirty_roots: ['/music'],
            queued_follow_up: true,
            active_scan_phase: null,
            last_requested_scan: {
              requested_at_ms: 110,
              roots: ['/music'],
            },
          }),
        )
        .mockResolvedValueOnce(
          createWatcherStatus({
            watched_roots: ['/music'],
            dirty_roots: ['/music'],
            queued_follow_up: false,
            active_scan_phase: 'running',
            last_requested_scan: {
              requested_at_ms: 230,
              roots: ['/music'],
            },
          }),
        )
        .mockResolvedValue(
          createWatcherStatus({
            watched_roots: ['/music'],
            dirty_roots: [],
            queued_follow_up: false,
            active_scan_phase: null,
            last_requested_scan: {
              requested_at_ms: 230,
              roots: ['/music'],
            },
          }),
        );

      const store = createAppShellStore({
        hasLibraryTracks: async () => true,
        startLibraryScan,
        getLibraryScanStatus,
        getLibraryWatcherStatus,
        cancelLibraryScan: async () => undefined,
      });

      let settled = false;
      const runPromise = store.runLibraryScan(['/music']).then((result) => {
        settled = true;
        return result;
      });

      await flushPromises();

      await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS);
      await flushPromises();
      expect(settled).toBe(false);
      expect(get(store.maintenance)).toMatchObject({
        title: 'Auto-sync follow-up queued',
        queuedFollowUp: true,
      });

      await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS);
      await flushPromises();
      expect(settled).toBe(false);
      expect(get(store.maintenance)).toMatchObject({
        title: 'Incremental sync in progress',
        activePhase: 'running',
      });

      await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS);
      await flushPromises();

      await expect(runPromise).resolves.toMatchObject({
        phase: 'completed',
        ended_at_ms: 320,
      });
      expect(startLibraryScan).toHaveBeenCalledWith({ paths: ['/music'], mode: 'incremental' });
      expect(get(store.maintenance)).toMatchObject({
        title: 'Incremental sync complete',
        queuedFollowUp: false,
        activePhase: null,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('reloads library after watcher-triggered maintenance completes on the shell heartbeat', async () => {
    vi.useFakeTimers();

    try {
      const baseTrack = tracksFixture[0]!;
      const lateWindowTrack: Track = {
        id: 'track-2',
        title: 'Late Window',
        duration: baseTrack.duration,
        path: '/music/late-window.flac',
        library_root: baseTrack.library_root ?? null,
        size: baseTrack.size,
        file_mtime_ms: 1_710_000_000_100,
        format: baseTrack.format,
        bitrate: baseTrack.bitrate,
        sample_rate: baseTrack.sample_rate,
        channels: baseTrack.channels,
        availability: baseTrack.availability,
        missing_since: null,
        play_count: 0,
        date_added: '2024-01-02T00:00:00Z',
      };
      const getTracks = vi
        .fn<() => Promise<Track[]>>()
        .mockResolvedValueOnce(tracksFixture)
        .mockResolvedValueOnce([...tracksFixture, lateWindowTrack]);

      const store = createAppShellStore({
        bootstrapDesktopShell: async () => undefined,
        getConfig: async () => ({ raw: true }),
        normalizeConfigForRestore: () => ({
          theme: 'dark',
          outputDeviceId: null,
          defaultVolume: 0.7,
          autoScan: false,
          libraryPaths: ['/music'],
        }),
        applyTheme: () => undefined,
        getLibraryScanStatus: vi
          .fn<() => Promise<ScanStatus>>()
          .mockResolvedValueOnce(createStatus({ phase: 'idle' }))
          .mockResolvedValueOnce(
            createStatus({
              phase: 'running',
              mode: 'incremental',
              started_at_ms: 500,
              current_path: '/music/follow-up.flac',
              processed_files: 2,
            }),
          )
          .mockResolvedValue(
            createStatus({
              phase: 'completed',
              mode: 'incremental',
              started_at_ms: 500,
              ended_at_ms: 650,
              processed_files: 4,
              changed_tracks: 1,
            }),
          ),
        getLibraryWatcherStatus: vi
          .fn<() => Promise<LibraryWatcherStatus>>()
          .mockResolvedValueOnce(createWatcherStatus({ watched_roots: ['/music'] }))
          .mockResolvedValueOnce(
            createWatcherStatus({
              watched_roots: ['/music'],
              dirty_roots: ['/music'],
              queued_follow_up: true,
              active_scan_phase: 'running',
              last_requested_scan: {
                requested_at_ms: 500,
                roots: ['/music'],
              },
            }),
          )
          .mockResolvedValue(
            createWatcherStatus({
              watched_roots: ['/music'],
              dirty_roots: [],
              queued_follow_up: false,
              active_scan_phase: null,
              last_requested_scan: {
                requested_at_ms: 500,
                roots: ['/music'],
              },
            }),
          ),
        cancelLibraryScan: async () => undefined,
        getTracks,
        getAlbums: async () => albumsFixture,
        getArtists: async () => artistsFixture,
        getPlaylists: async () => playlistsFixture,
        createPlaylist: async () => undefined,
        searchLibrary: async () => searchResultsFixture,
        prompt: () => null,
        alert: () => undefined,
      });

      await store.bootstrap();
      expect(getTracks).toHaveBeenCalledTimes(1);
      expect(get(store.tracks)).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(MAINTENANCE_HEARTBEAT_INTERVAL_MS);
      await flushPromises();
      expect(getTracks).toHaveBeenCalledTimes(1);
      expect(get(store.maintenance)).toMatchObject({
        title: 'Incremental sync in progress',
        queuedFollowUp: true,
      });

      await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS);
      await flushPromises();
      await flushPromises();

      expect(getTracks).toHaveBeenCalledTimes(2);
      expect(get(store.maintenance)).toMatchObject({
        title: 'Incremental sync complete',
        queuedFollowUp: false,
      });
      expect(get(store.tracks)).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
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
