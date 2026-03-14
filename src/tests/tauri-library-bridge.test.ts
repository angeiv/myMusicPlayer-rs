import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

import { getTrack, getTracks, scanDirectory, searchLibrary } from '../lib/api/tauri/library';

describe('tauri library bridge', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('invokes scan_directory with the expected payload key', async () => {
    invokeMock.mockResolvedValueOnce(42);

    await expect(scanDirectory('/music')).resolves.toBe(42);
    expect(invokeMock).toHaveBeenCalledWith('scan_directory', { path: '/music' });
  });

  it('returns null for missing get_track payloads', async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await expect(getTrack('track-1')).resolves.toBeNull();
    expect(invokeMock).toHaveBeenCalledWith('get_track', { id: 'track-1' });
  });

  it('returns an empty array when get_tracks payload is missing', async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await expect(getTracks()).resolves.toEqual([]);
    expect(invokeMock).toHaveBeenCalledWith('get_tracks');
  });

  it('normalizes tuple search payloads into SearchResults', async () => {
    invokeMock.mockResolvedValueOnce([[{ id: 't' }], [{ id: 'a' }], [{ id: 'r' }]]);

    await expect(searchLibrary('lofi')).resolves.toEqual({
      tracks: [{ id: 't' }],
      albums: [{ id: 'a' }],
      artists: [{ id: 'r' }],
    });
    expect(invokeMock).toHaveBeenCalledWith('search', { query: 'lofi' });
  });
});
