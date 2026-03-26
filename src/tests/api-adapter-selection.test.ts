import { describe, expect, it, vi } from 'vitest';

async function importLibraryAdapter(isTauri: boolean) {
  vi.resetModules();

  const tauriGetTracks = vi.fn(async () => ['tauri-library']);
  const mockGetTracks = vi.fn(async () => ['mock-library']);
  const libraryStub = {
    scanDirectory: vi.fn(),
    getTracks: vi.fn(),
    getTrack: vi.fn(),
    getAlbums: vi.fn(),
    getAlbum: vi.fn(),
    getArtists: vi.fn(),
    getArtist: vi.fn(),
    getTracksByAlbum: vi.fn(),
    getTracksByArtist: vi.fn(),
    getAlbumsByArtist: vi.fn(),
    searchLibrary: vi.fn(),
  };

  vi.doMock('../lib/utils/env', () => ({ isTauri }));
  vi.doMock('../lib/api/tauri/library', () => ({ ...libraryStub, getTracks: tauriGetTracks }));
  vi.doMock('../lib/api/mock/library', () => ({ ...libraryStub, getTracks: mockGetTracks }));

  const adapter = await import('../lib/api/library');
  return { adapter, tauriGetTracks, mockGetTracks };
}

async function importPlaybackAdapter(isTauri: boolean) {
  vi.resetModules();

  const tauriGetPlaybackState = vi.fn(async () => ({ state: 'tauri' }));
  const mockGetPlaybackState = vi.fn(async () => ({ state: 'mock' }));
  const tauriAddToQueue = vi.fn(async () => undefined);
  const mockAddToQueue = vi.fn(async () => undefined);
  const playbackStub = {
    addToQueue: vi.fn(),
    getOutputDevices: vi.fn(),
    getOutputDevice: vi.fn(),
    setOutputDevice: vi.fn(),
    getVolume: vi.fn(),
    setVolume: vi.fn(),
    getPlayMode: vi.fn(),
    setPlayMode: vi.fn(),
    setPlayModeFromUi: vi.fn(),
    getQueue: vi.fn(),
    setQueue: vi.fn(),
    playTrack: vi.fn(),
    pausePlayback: vi.fn(),
    resumePlayback: vi.fn(),
    seekTo: vi.fn(),
    getPlaybackState: vi.fn(),
    getCurrentTrack: vi.fn(),
    pickAndPlayFile: vi.fn(),
    playNextTrack: vi.fn(),
    playPreviousTrack: vi.fn(),
    togglePlayPause: vi.fn(),
  };

  vi.doMock('../lib/utils/env', () => ({ isTauri }));
  vi.doMock('../lib/api/tauri/playback', () => ({
    ...playbackStub,
    addToQueue: tauriAddToQueue,
    getPlaybackState: tauriGetPlaybackState,
  }));
  vi.doMock('../lib/api/mock/playback', () => ({
    ...playbackStub,
    addToQueue: mockAddToQueue,
    getPlaybackState: mockGetPlaybackState,
  }));

  const adapter = await import('../lib/api/playback');
  return { adapter, tauriAddToQueue, mockAddToQueue, tauriGetPlaybackState, mockGetPlaybackState };
}

async function importConfigAdapter(isTauri: boolean) {
  vi.resetModules();

  const tauriGetConfig = vi.fn(async () => ({ source: 'tauri' }));
  const mockGetConfig = vi.fn(async () => ({ source: 'mock' }));
  const configStub = {
    bootstrapDesktopShell: vi.fn(),
    getConfig: vi.fn(),
    getAppVersion: vi.fn(),
    saveConfig: vi.fn(),
    setLastSession: vi.fn(),
    getLibraryPaths: vi.fn(),
    pickAndAddLibraryFolder: vi.fn(),
    removeLibraryPath: vi.fn(),
    greet: vi.fn(),
  };

  vi.doMock('../lib/utils/env', () => ({ isTauri }));
  vi.doMock('../lib/api/tauri/config', () => ({ ...configStub, getConfig: tauriGetConfig }));
  vi.doMock('../lib/api/mock/config', () => ({ ...configStub, getConfig: mockGetConfig }));

  const adapter = await import('../lib/api/config');
  return { adapter, tauriGetConfig, mockGetConfig };
}

async function importPlaylistAdapter(isTauri: boolean) {
  vi.resetModules();

  const tauriGetPlaylists = vi.fn(async () => ['tauri-playlist']);
  const mockGetPlaylists = vi.fn(async () => ['mock-playlist']);
  const tauriAddToPlaylist = vi.fn(async () => undefined);
  const mockAddToPlaylist = vi.fn(async () => undefined);
  const playlistStub = {
    addToPlaylist: vi.fn(),
    createPlaylist: vi.fn(),
    getPlaylists: vi.fn(),
    getPlaylist: vi.fn(),
    getPlaylistTracks: vi.fn(),
    removeFromPlaylist: vi.fn(),
    updatePlaylistMetadata: vi.fn(),
  };

  vi.doMock('../lib/utils/env', () => ({ isTauri }));
  vi.doMock('../lib/api/tauri/playlist', () => ({
    ...playlistStub,
    addToPlaylist: tauriAddToPlaylist,
    getPlaylists: tauriGetPlaylists,
  }));
  vi.doMock('../lib/api/mock/playlist', () => ({
    ...playlistStub,
    addToPlaylist: mockAddToPlaylist,
    getPlaylists: mockGetPlaylists,
  }));

  const adapter = await import('../lib/api/playlist');
  return { adapter, tauriAddToPlaylist, mockAddToPlaylist, tauriGetPlaylists, mockGetPlaylists };
}

describe('feature adapter entry modules', () => {
  it('library adapter resolves to tauri implementation in tauri mode', async () => {
    const { adapter, tauriGetTracks, mockGetTracks } = await importLibraryAdapter(true);

    await expect(adapter.getTracks()).resolves.toEqual(['tauri-library']);
    expect(tauriGetTracks).toHaveBeenCalledTimes(1);
    expect(mockGetTracks).not.toHaveBeenCalled();
  });

  it('library adapter resolves to mock implementation in web mode', async () => {
    const { adapter, tauriGetTracks, mockGetTracks } = await importLibraryAdapter(false);

    await expect(adapter.getTracks()).resolves.toEqual(['mock-library']);
    expect(mockGetTracks).toHaveBeenCalledTimes(1);
    expect(tauriGetTracks).not.toHaveBeenCalled();
  });

  it('playback adapter resolves to tauri implementation in tauri mode', async () => {
    const { adapter, tauriAddToQueue, mockAddToQueue, tauriGetPlaybackState, mockGetPlaybackState } = await importPlaybackAdapter(true);

    await expect(adapter.addToQueue([{ id: 'track-1' } as never])).resolves.toBeUndefined();
    await expect(adapter.getPlaybackState()).resolves.toEqual({ state: 'tauri' });
    expect(tauriAddToQueue).toHaveBeenCalledTimes(1);
    expect(mockAddToQueue).not.toHaveBeenCalled();
    expect(tauriGetPlaybackState).toHaveBeenCalledTimes(1);
    expect(mockGetPlaybackState).not.toHaveBeenCalled();
  });

  it('playback adapter resolves to mock implementation in web mode', async () => {
    const { adapter, tauriAddToQueue, mockAddToQueue, tauriGetPlaybackState, mockGetPlaybackState } = await importPlaybackAdapter(false);

    await expect(adapter.addToQueue([{ id: 'track-1' } as never])).resolves.toBeUndefined();
    await expect(adapter.getPlaybackState()).resolves.toEqual({ state: 'mock' });
    expect(mockAddToQueue).toHaveBeenCalledTimes(1);
    expect(tauriAddToQueue).not.toHaveBeenCalled();
    expect(mockGetPlaybackState).toHaveBeenCalledTimes(1);
    expect(tauriGetPlaybackState).not.toHaveBeenCalled();
  });

  it('config adapter resolves to tauri implementation in tauri mode', async () => {
    const { adapter, tauriGetConfig, mockGetConfig } = await importConfigAdapter(true);

    await expect(adapter.getConfig()).resolves.toEqual({ source: 'tauri' });
    expect(tauriGetConfig).toHaveBeenCalledTimes(1);
    expect(mockGetConfig).not.toHaveBeenCalled();
  });

  it('config adapter resolves to mock implementation in web mode', async () => {
    const { adapter, tauriGetConfig, mockGetConfig } = await importConfigAdapter(false);

    await expect(adapter.getConfig()).resolves.toEqual({ source: 'mock' });
    expect(mockGetConfig).toHaveBeenCalledTimes(1);
    expect(tauriGetConfig).not.toHaveBeenCalled();
  });

  it('playlist adapter resolves to tauri implementation in tauri mode', async () => {
    const { adapter, tauriAddToPlaylist, mockAddToPlaylist, tauriGetPlaylists, mockGetPlaylists } = await importPlaylistAdapter(true);

    await expect(adapter.addToPlaylist('playlist-1', 'track-1')).resolves.toBeUndefined();
    await expect(adapter.getPlaylists()).resolves.toEqual(['tauri-playlist']);
    expect(tauriAddToPlaylist).toHaveBeenCalledTimes(1);
    expect(mockAddToPlaylist).not.toHaveBeenCalled();
    expect(tauriGetPlaylists).toHaveBeenCalledTimes(1);
    expect(mockGetPlaylists).not.toHaveBeenCalled();
  });

  it('playlist adapter resolves to mock implementation in web mode', async () => {
    const { adapter, tauriAddToPlaylist, mockAddToPlaylist, tauriGetPlaylists, mockGetPlaylists } = await importPlaylistAdapter(false);

    await expect(adapter.addToPlaylist('playlist-1', 'track-1')).resolves.toBeUndefined();
    await expect(adapter.getPlaylists()).resolves.toEqual(['mock-playlist']);
    expect(mockAddToPlaylist).toHaveBeenCalledTimes(1);
    expect(tauriAddToPlaylist).not.toHaveBeenCalled();
    expect(mockGetPlaylists).toHaveBeenCalledTimes(1);
    expect(tauriGetPlaylists).not.toHaveBeenCalled();
  });
});
