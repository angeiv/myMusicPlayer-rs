import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

import {
  cancelLibraryScan,
  getLibraryScanStatus,
  getTrack,
  getTracks,
  scanDirectory,
  searchLibrary,
  startLibraryScan,
} from '../lib/api/tauri/library';

describe('tauri library bridge', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('invokes scan_directory with the expected payload key', async () => {
    invokeMock.mockResolvedValueOnce(42);

    await expect(scanDirectory('/music')).resolves.toBe(42);
    expect(invokeMock).toHaveBeenCalledWith('scan_directory', { path: '/music' });
  });

  it('invokes start_library_scan with the expected payload key', async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await expect(startLibraryScan(['/music'])).resolves.toBeUndefined();
    expect(invokeMock).toHaveBeenCalledWith('start_library_scan', { paths: ['/music'] });
  });

  it('invokes get_library_scan_status without a payload', async () => {
    const status = {
      phase: 'completed',
      processed_files: 0,
      inserted_tracks: 0,
      error_count: 0,
      sample_errors: [],
    };

    invokeMock.mockResolvedValueOnce(status);

    await expect(getLibraryScanStatus()).resolves.toEqual(status);
    expect(invokeMock).toHaveBeenCalledWith('get_library_scan_status');
  });

  it('invokes cancel_library_scan without a payload', async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await expect(cancelLibraryScan()).resolves.toBeUndefined();
    expect(invokeMock).toHaveBeenCalledWith('cancel_library_scan');
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
