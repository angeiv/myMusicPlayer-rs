// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LibraryMaintenanceState } from '../lib/features/library-scan/maintenance';
import type { ScanStatus } from '../lib/types';
import { nowPlayingUi } from '../lib/player/now-playing';

const appShellMock = vi.hoisted(() => {
  const createStore = <T,>(value: T) => ({
    subscribe(run: (value: T) => void) {
      run(value);
      return () => {};
    },
  });

  const playlistsValue = [
    {
      id: 'playlist-1',
      name: 'Batch Actions',
      track_ids: ['track-1'],
      created_at: '2026-03-01T00:00:00.000Z',
      updated_at: '2026-03-01T00:00:00.000Z',
    },
  ];

  const loadPlaylists = vi.fn(async () => undefined);

  const scanStatusValue: ScanStatus = {
    phase: 'idle',
    mode: null,
    started_at_ms: null,
    ended_at_ms: null,
    current_path: null,
    processed_files: 0,
    inserted_tracks: 0,
    changed_tracks: 0,
    unchanged_files: 0,
    restored_tracks: 0,
    missing_tracks: 0,
    error_count: 0,
    sample_errors: [],
  };

  const defaultMaintenanceValue: LibraryMaintenanceState = {
    scanStatus: scanStatusValue,
    watcherStatus: {
      watched_roots: ['/music'],
      dirty_roots: [],
      queued_follow_up: false,
      active_scan_phase: null,
      last_requested_scan: null,
      last_error: null,
    },
    watchedRoots: ['/music'],
    dirtyRoots: [],
    queuedFollowUp: false,
    activePhase: null,
    lastError: null,
    title: 'Auto-sync ready',
    description: 'Watching 1 folder for changes. Manual rescans use the same maintenance flow.',
    tone: 'default',
    recoveryHint: null,
    nextStep: null,
  };

  let maintenanceValue = defaultMaintenanceValue;

  const maintenance = {
    subscribe(run: (value: LibraryMaintenanceState) => void) {
      run(maintenanceValue);
      return () => {};
    },
  };

  const store = {
    tracks: createStore([]),
    albums: createStore([]),
    artists: createStore([]),
    playlists: createStore(playlistsValue),
    counts: createStore({ songs: 0, albums: 0, artists: 0 }),
    scanStatus: createStore(scanStatusValue),
    watcherStatus: createStore(defaultMaintenanceValue.watcherStatus),
    maintenance,
    isScanning: createStore(false),
    isLibraryLoading: createStore(false),
    isSearching: createStore(false),
    searchResults: createStore(null),
    bootstrap: vi.fn(async () => undefined),
    loadLibrary: vi.fn(async () => undefined),
    loadPlaylists,
    runLibraryScan: vi.fn(async () => scanStatusValue),
    cancelLibraryScan: vi.fn(async () => undefined),
    syncRouteSearch: vi.fn(async () => undefined),
    createPlaylistFromPrompt: vi.fn(async () => undefined),
    destroy: vi.fn(() => undefined),
  };

  return {
    playlistsValue,
    loadPlaylists,
    scanStatusValue,
    store,
    setMaintenanceValue(nextValue: LibraryMaintenanceState) {
      maintenanceValue = nextValue;
    },
    resetMaintenanceValue() {
      maintenanceValue = defaultMaintenanceValue;
    },
    createAppShellStore: vi.fn(() => store),
  };
});

vi.mock('../lib/features/app-shell/store', () => ({
  createAppShellStore: appShellMock.createAppShellStore,
}));

vi.mock('../lib/views/SongsView.svelte', async () => {
  const module = await import('./stubs/SongsViewSpy.svelte');
  return { default: module.default };
});

vi.mock('../lib/views/SettingsView.svelte', async () => {
  const module = await import('./stubs/SettingsViewSpy.svelte');
  return { default: module.default };
});

vi.mock('../lib/player/BottomPlayerBar.svelte', async () => {
  const module = await import('./stubs/EmptyStub.svelte');
  return { default: module.default };
});

vi.mock('../lib/views/PlaylistDetailView.svelte', async () => {
  const module = await import('./stubs/PlaylistDetailViewSpy.svelte');
  return { default: module.default };
});

import App from '../App.svelte';

type SongsViewSpyWindow = Window & {
  __songsViewSpyProps?: {
    playlists: Array<{
      id: string;
      name: string;
      track_ids: string[];
      created_at: string;
      updated_at: string;
    }>;
    refreshPlaylists: () => Promise<void>;
  };
  __settingsViewSpyProps?: {
    runLibraryScan: (paths: string[]) => Promise<unknown>;
    runFullLibraryScan: (paths: string[]) => Promise<unknown>;
    cancelLibraryScan: () => Promise<void>;
  };
};

describe('App songs-shell wiring', () => {
  beforeEach(() => {
    const spyWindow = window as SongsViewSpyWindow;
    delete spyWindow.__songsViewSpyProps;
    delete spyWindow.__settingsViewSpyProps;
    nowPlayingUi.close();
    appShellMock.resetMaintenanceValue();
    window.location.hash = '#/songs';
  });

  afterEach(() => {
    const spyWindow = window as SongsViewSpyWindow;
    cleanup();
    delete spyWindow.__songsViewSpyProps;
    delete spyWindow.__settingsViewSpyProps;
    nowPlayingUi.close();
    window.location.hash = '';
    appShellMock.store.bootstrap.mockClear();
    appShellMock.store.destroy.mockClear();
    appShellMock.loadPlaylists.mockClear();
    appShellMock.store.runLibraryScan.mockClear();
    appShellMock.store.cancelLibraryScan.mockClear();
  });

  it('boots the app shell on mount so startup maintenance stays in one orchestration seam', async () => {
    render(App);

    await waitFor(() => {
      expect(appShellMock.store.bootstrap).toHaveBeenCalledTimes(1);
    });
  });

  it('passes playlists and refreshPlaylists into SongsView on the songs route', async () => {
    render(App);

    await waitFor(() => {
      const spyWindow = window as SongsViewSpyWindow;
      expect(screen.getByTestId('songs-view-spy')).toBeTruthy();
      expect(spyWindow.__songsViewSpyProps).toBeDefined();
    });

    const spyWindow = window as SongsViewSpyWindow;

    expect(spyWindow.__songsViewSpyProps?.playlists).toEqual(appShellMock.playlistsValue);
    expect(spyWindow.__songsViewSpyProps?.refreshPlaylists).toBe(appShellMock.loadPlaylists);
  });

  it('shows a passive top-bar maintenance cue on non-settings routes while auto-sync is active', async () => {
    appShellMock.setMaintenanceValue({
      scanStatus: {
        ...appShellMock.scanStatusValue,
        phase: 'running',
        mode: 'incremental',
      },
      watcherStatus: {
        watched_roots: ['/music'],
        dirty_roots: ['/music'],
        queued_follow_up: true,
        active_scan_phase: 'running',
        last_requested_scan: null,
        last_error: null,
      },
      watchedRoots: ['/music'],
      dirtyRoots: ['/music'],
      queuedFollowUp: true,
      activePhase: 'running',
      lastError: null,
      title: 'Incremental sync in progress',
      description: 'Scanning the library now. Auto-sync already queued one follow-up pass for newer file changes.',
      tone: 'active',
      recoveryHint: 'Let the current scan finish. The queued follow-up will run automatically.',
      nextStep: {
        kind: 'cancel-scan',
        label: 'Cancel scan',
      },
    });

    render(App);

    const cue = await screen.findByRole('link', { name: 'Open maintenance details in Settings' });
    expect(cue.getAttribute('href')).toBe('#/settings');
    expect(within(cue).getByText('Incremental sync in progress')).toBeTruthy();
    expect(within(cue).getByText('1 follow-up queued')).toBeTruthy();
  });

  it('keeps the maintenance cue across browsing routes and hides it on Settings where the detailed surface takes over', async () => {
    appShellMock.setMaintenanceValue({
      scanStatus: {
        ...appShellMock.scanStatusValue,
        phase: 'idle',
        mode: 'incremental',
      },
      watcherStatus: {
        watched_roots: ['/music'],
        dirty_roots: [],
        queued_follow_up: false,
        active_scan_phase: null,
        last_requested_scan: null,
        last_error: 'Failed to refresh watcher roots: permission denied',
      },
      watchedRoots: ['/music'],
      dirtyRoots: [],
      queuedFollowUp: false,
      activePhase: null,
      lastError: 'Failed to refresh watcher roots: permission denied',
      title: 'Auto-sync needs attention',
      description: 'Watching 1 folder, but the last watcher update failed before a follow-up sync could start.',
      tone: 'warning',
      recoveryHint: 'Fix the watcher problem or folder access, then run Rescan Now to confirm the library state.',
      nextStep: {
        kind: 'rescan',
        label: 'Rescan Now',
      },
    });

    render(App);

    await screen.findByText('Auto-sync needs attention');

    window.location.hash = '#/albums';
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    await waitFor(() => {
      expect(screen.getByText('Auto-sync needs attention')).toBeTruthy();
    });

    window.location.hash = '#/settings';
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    await waitFor(() => {
      expect(screen.queryByText('Auto-sync needs attention')).toBeNull();
      expect(screen.getByTestId('settings-view-spy')).toBeTruthy();
    });
  });

  it('adapts settings rescans into request objects before calling the app-shell store', async () => {
    window.location.hash = '#/settings';

    render(App);

    await waitFor(() => {
      const spyWindow = window as SongsViewSpyWindow;
      expect(screen.getByTestId('settings-view-spy')).toBeTruthy();
      expect(spyWindow.__settingsViewSpyProps).toBeDefined();
    });

    const spyWindow = window as SongsViewSpyWindow;
    await spyWindow.__settingsViewSpyProps?.runLibraryScan(['/music']);

    expect(appShellMock.store.runLibraryScan).toHaveBeenCalledWith({
      paths: ['/music'],
    });
  });

  it('adapts settings full scans into mode-aware request objects before calling the app-shell store', async () => {
    window.location.hash = '#/settings';

    render(App);

    await waitFor(() => {
      const spyWindow = window as SongsViewSpyWindow;
      expect(screen.getByTestId('settings-view-spy')).toBeTruthy();
      expect(spyWindow.__settingsViewSpyProps).toBeDefined();
    });

    const spyWindow = window as SongsViewSpyWindow;
    await spyWindow.__settingsViewSpyProps?.runFullLibraryScan(['/music']);

    expect(appShellMock.store.runLibraryScan).toHaveBeenCalledWith({
      paths: ['/music'],
      mode: 'full',
    });
  });

  it('refreshes app-shell playlists when PlaylistDetailView dispatches refreshPlaylists', async () => {
    window.location.hash = '#/playlists/playlist-1';

    render(App);

    const refreshTrigger = await screen.findByTestId('playlist-detail-view-spy');
    await refreshTrigger.click();

    expect(appShellMock.loadPlaylists).toHaveBeenCalledTimes(1);
  });

  it('marks the background shell inert while keeping the bottom bar outside the locked shell', async () => {
    nowPlayingUi.open();

    const { container } = render(App);

    await waitFor(() => {
      expect(container.querySelector('.app-shell')).toBeTruthy();
    });

    const appContainer = container.querySelector('.app-container');
    const shell = container.querySelector('.app-shell');
    const mainContent = container.querySelector('.main-content');
    const bottomBarStub = screen.getByTestId('empty-stub');

    expect(appContainer?.getAttribute('data-surface')).toBe('canvas');
    expect(shell?.getAttribute('data-surface')).toBe('shell');
    expect(mainContent?.getAttribute('data-surface')).toBe('workspace');
    expect(shell?.getAttribute('aria-hidden')).toBe('true');
    expect(shell?.className).toContain('app-shell--inactive');
    expect(mainContent?.className).toContain('main-content--locked');
    expect(shell?.contains(bottomBarStub)).toBe(false);
  });
});
