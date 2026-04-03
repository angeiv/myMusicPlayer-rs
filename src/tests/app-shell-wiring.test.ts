// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  const scanStatusValue = {
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

  const store = {
    tracks: createStore([]),
    albums: createStore([]),
    artists: createStore([]),
    playlists: createStore(playlistsValue),
    counts: createStore({ songs: 0, albums: 0, artists: 0 }),
    scanStatus: createStore(scanStatusValue),
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
  };

  return {
    playlistsValue,
    loadPlaylists,
    scanStatusValue,
    store,
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
    cancelLibraryScan: () => Promise<void>;
  };
};

describe('App songs-shell wiring', () => {
  beforeEach(() => {
    const spyWindow = window as SongsViewSpyWindow;
    delete spyWindow.__songsViewSpyProps;
    delete spyWindow.__settingsViewSpyProps;
    nowPlayingUi.close();
    window.location.hash = '#/songs';
  });

  afterEach(() => {
    const spyWindow = window as SongsViewSpyWindow;
    cleanup();
    delete spyWindow.__songsViewSpyProps;
    delete spyWindow.__settingsViewSpyProps;
    nowPlayingUi.close();
    window.location.hash = '';
    appShellMock.loadPlaylists.mockClear();
    appShellMock.store.runLibraryScan.mockClear();
    appShellMock.store.cancelLibraryScan.mockClear();
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
