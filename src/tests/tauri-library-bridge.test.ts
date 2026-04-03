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
  hasLibraryTracks,
  scanDirectory,
  searchLibrary,
  startLibraryScan,
} from '../lib/api/tauri/library';
import {
  getLibraryScanStatus as getMockLibraryScanStatus,
  getTracks as getMockTracks,
  hasLibraryTracks as getMockHasLibraryTracks,
  startLibraryScan as startMockLibraryScan,
} from '../lib/api/mock/library';
import { createScanStatus, type LibraryScanRequest, type ScanStatus, type Track } from '../lib/types';

function createTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Signal Bloom',
    duration: 180,
    track_number: 1,
    disc_number: 1,
    path: '/music/signal-bloom.flac',
    library_root: '/music',
    size: 123,
    file_mtime_ms: 1_710_000_000_000,
    format: 'flac',
    bitrate: 320,
    sample_rate: 48_000,
    channels: 2,
    artist_name: 'Night Engines',
    album_title: 'Late Transit',
    availability: 'available',
    missing_since: null,
    play_count: 0,
    date_added: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function createStatus(overrides: Partial<ScanStatus> = {}): ScanStatus {
  return createScanStatus(overrides);
}

describe('tauri library bridge', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('invokes scan_directory with the expected payload key', async () => {
    invokeMock.mockResolvedValueOnce(42);

    await expect(scanDirectory('/music')).resolves.toBe(42);
    expect(invokeMock).toHaveBeenCalledWith('scan_directory', { path: '/music' });
  });

  it('invokes start_library_scan with the mode-aware payload shape', async () => {
    const request: LibraryScanRequest = {
      paths: ['/music'],
      mode: 'incremental',
    };

    invokeMock.mockResolvedValueOnce(undefined);

    await expect(startLibraryScan(request)).resolves.toBeUndefined();
    expect(invokeMock).toHaveBeenCalledWith('start_library_scan', request);
  });

  it('returns richer scan status payloads unchanged', async () => {
    const status = createStatus({
      phase: 'completed',
      mode: 'incremental',
      started_at_ms: 10,
      ended_at_ms: 25,
      current_path: '/music/signal-bloom.flac',
      processed_files: 7,
      inserted_tracks: 1,
      changed_tracks: 2,
      unchanged_files: 3,
      restored_tracks: 4,
      missing_tracks: 5,
      error_count: 1,
      sample_errors: [
        {
          path: '/offline-drive',
          message: 'Root path does not exist or is not a directory',
          kind: 'invalid_path',
        },
      ],
    });

    invokeMock.mockResolvedValueOnce(status);

    await expect(getLibraryScanStatus()).resolves.toEqual(status);
    expect(invokeMock).toHaveBeenCalledWith('get_library_scan_status');
  });

  it('invokes has_library_tracks without a payload', async () => {
    invokeMock.mockResolvedValueOnce(true);

    await expect(hasLibraryTracks()).resolves.toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('has_library_tracks');
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

  it('returns get_track payloads with scan baseline fields unchanged', async () => {
    const track = createTrack({
      availability: 'missing',
      missing_since: '2026-04-03T03:00:00Z',
    });

    invokeMock.mockResolvedValueOnce(track);

    await expect(getTrack(track.id)).resolves.toEqual(track);
    expect(invokeMock).toHaveBeenCalledWith('get_track', { id: track.id });
  });

  it('returns an empty array when get_tracks payload is missing', async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await expect(getTracks()).resolves.toEqual([]);
    expect(invokeMock).toHaveBeenCalledWith('get_tracks');
  });

  it('returns get_tracks payloads with scan baseline fields unchanged', async () => {
    const tracks = [
      createTrack(),
      createTrack({
        id: 'track-2',
        title: 'Missing Signal',
        path: '/music/missing-signal.flac',
        availability: 'missing',
        missing_since: '2026-04-03T03:05:00Z',
      }),
    ];

    invokeMock.mockResolvedValueOnce(tracks);

    await expect(getTracks()).resolves.toEqual(tracks);
    expect(invokeMock).toHaveBeenCalledWith('get_tracks');
  });

  it('keeps the web mock scan request and status shape aligned with the canonical frontend contract', async () => {
    await startMockLibraryScan({
      paths: ['/music'],
      mode: 'full',
    });

    const first = await getMockLibraryScanStatus();
    expect(first).toMatchObject({
      phase: 'completed',
      mode: 'full',
    });

    first.changed_tracks = 99;
    first.sample_errors.push({
      path: '/mutated',
      message: 'should not leak into later reads',
      kind: 'walk',
    });

    await expect(getMockLibraryScanStatus()).resolves.toStrictEqual(
      createScanStatus({
        phase: 'completed',
        mode: 'full',
        started_at_ms: first.started_at_ms,
        ended_at_ms: first.ended_at_ms,
      }),
    );
  });

  it('keeps the web mock occupancy helper aligned with the mock library fixture', async () => {
    await expect(getMockHasLibraryTracks()).resolves.toBe(true);
  });

  it('keeps the web mock track payload aligned with the baseline scan fields', async () => {
    const [track] = await getMockTracks();

    expect(track).toMatchObject({
      library_root: '/music',
      file_mtime_ms: null,
      availability: 'available',
      missing_since: null,
    });
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
