import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';

import { deriveAppShellRouteState } from '../lib/features/app-shell/navigation';
import { createAppShellStore } from '../lib/features/app-shell/store';
import type { Album, Artist, Playlist, SearchResults, Track } from '../lib/types';

const tracksFixture: Track[] = [
  {
    id: 'track-1',
    title: 'Signal Bloom',
    duration: 180,
    path: '/music/signal-bloom.flac',
    size: 123,
    format: 'flac',
    bitrate: 320,
    sample_rate: 48_000,
    channels: 2,
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
  it('preserves bootstrap ordering from greet through config restore and data loads', async () => {
    const calls: string[] = [];
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
      setOutputDevice: async (deviceId) => {
        calls.push(`setOutputDevice:${deviceId}`);
      },
      setVolume: async (volume) => {
        calls.push(`setVolume:${volume}`);
      },
      scanDirectory: async (path) => {
        calls.push(`scanDirectory:${path}`);
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

    await store.bootstrap();

    expect(calls).toEqual([
      'bootstrapDesktopShell',
      'getConfig',
      'normalizeConfigForRestore',
      'applyTheme:dark',
      'setOutputDevice:device-1',
      'setVolume:0.35',
      'scanDirectory:/music/a',
      'scanDirectory:/music/b',
      'getTracks',
      'getAlbums',
      'getArtists',
      'getPlaylists',
    ]);
    expect(get(store.tracks)).toEqual(tracksFixture);
    expect(get(store.playlists)).toEqual(playlistsFixture);
    expect(get(store.counts)).toEqual({ songs: 1, albums: 1, artists: 1 });
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
