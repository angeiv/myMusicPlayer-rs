import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

import {
  addToPlaylist,
  createPlaylist,
  getPlaylists,
  removeFromPlaylist,
  updatePlaylistMetadata,
} from '../lib/api/tauri/playlist';

describe('tauri playlist bridge', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('invokes create_playlist with name payload', async () => {
    invokeMock.mockResolvedValueOnce('playlist-id');

    await expect(createPlaylist('Road Trip')).resolves.toBe('playlist-id');
    expect(invokeMock).toHaveBeenCalledWith('create_playlist', { name: 'Road Trip' });
  });

  it('invokes add_to_playlist with camelCase payload keys', async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await addToPlaylist('playlist-1', 'track-9');
    expect(invokeMock).toHaveBeenCalledWith('add_to_playlist', {
      playlistId: 'playlist-1',
      trackId: 'track-9',
    });
  });

  it('returns empty playlist array when backend payload is missing', async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await expect(getPlaylists()).resolves.toEqual([]);
    expect(invokeMock).toHaveBeenCalledWith('get_playlists');
  });

  it('preserves remove_from_playlist payload keys', async () => {
    invokeMock.mockResolvedValueOnce(null);

    await expect(removeFromPlaylist('playlist-1', 3)).resolves.toBeNull();
    expect(invokeMock).toHaveBeenCalledWith('remove_from_playlist', {
      playlistId: 'playlist-1',
      trackIndex: 3,
    });
  });

  it('invokes update_playlist_metadata with nullable fields', async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await updatePlaylistMetadata('playlist-2', null, 'chill set');
    expect(invokeMock).toHaveBeenCalledWith('update_playlist_metadata', {
      id: 'playlist-2',
      name: null,
      description: 'chill set',
    });
  });
});
