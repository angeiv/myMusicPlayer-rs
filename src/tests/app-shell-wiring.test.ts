// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  const store = {
    tracks: createStore([]),
    albums: createStore([]),
    artists: createStore([]),
    playlists: createStore(playlistsValue),
    counts: createStore({ songs: 0, albums: 0, artists: 0 }),
    isLibraryLoading: createStore(false),
    isSearching: createStore(false),
    searchResults: createStore(null),
    bootstrap: vi.fn(async () => undefined),
    loadLibrary: vi.fn(async () => undefined),
    loadPlaylists,
    syncRouteSearch: vi.fn(async () => undefined),
    createPlaylistFromPrompt: vi.fn(async () => undefined),
  };

  return {
    playlistsValue,
    loadPlaylists,
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
};

describe('App songs-shell wiring', () => {
  beforeEach(() => {
    const spyWindow = window as SongsViewSpyWindow;
    delete spyWindow.__songsViewSpyProps;
    window.location.hash = '#/songs';
  });

  afterEach(() => {
    const spyWindow = window as SongsViewSpyWindow;
    cleanup();
    delete spyWindow.__songsViewSpyProps;
    window.location.hash = '';
    appShellMock.loadPlaylists.mockClear();
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

  it('refreshes app-shell playlists when PlaylistDetailView dispatches refreshPlaylists', async () => {
    window.location.hash = '#/playlists/playlist-1';

    render(App);

    const refreshTrigger = await screen.findByTestId('playlist-detail-view-spy');
    await refreshTrigger.click();

    expect(appShellMock.loadPlaylists).toHaveBeenCalledTimes(1);
  });
});
