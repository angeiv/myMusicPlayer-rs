// @vitest-environment jsdom

import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SCAN_STATUS_POLL_INTERVAL_MS,
  createLibraryScanStore,
  type LibraryScanStoreDependencies,
} from '../lib/features/library-scan/store';
import { createScanStatus, type ScanStatus } from '../lib/types';

function createStatus(overrides: Partial<ScanStatus> = {}): ScanStatus {
  return createScanStatus(overrides);
}

function createDependencies(
  overrides: Partial<LibraryScanStoreDependencies> = {},
): LibraryScanStoreDependencies {
  return {
    startLibraryScan: vi.fn().mockResolvedValue(undefined),
    getLibraryScanStatus: vi.fn().mockResolvedValue(createStatus()),
    cancelLibraryScan: vi.fn().mockResolvedValue(undefined),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    ...overrides,
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('library scan store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('exposes a complete idle status snapshot before polling starts', () => {
    const store = createLibraryScanStore(createDependencies());

    expect(get(store.status)).toStrictEqual(createStatus());
    expect(get(store.isScanning)).toBe(false);

    store.destroy();
  });

  it('polls until reaching a terminal phase and then stops polling', async () => {
    const running1 = createStatus({
      phase: 'running',
      current_path: '/music/a/first.flac',
      processed_files: 1,
      inserted_tracks: 1,
      changed_tracks: 0,
      unchanged_files: 0,
      restored_tracks: 0,
      missing_tracks: 0,
    });
    const running2 = createStatus({
      phase: 'running',
      current_path: '/music/a/second.flac',
      processed_files: 4,
      inserted_tracks: 1,
      changed_tracks: 1,
      unchanged_files: 1,
      restored_tracks: 1,
      missing_tracks: 0,
      error_count: 1,
      sample_errors: [
        {
          path: '/offline-drive',
          message: 'Root path does not exist or is not a directory',
          kind: 'invalid_path',
        },
      ],
    });
    const completed = createStatus({
      phase: 'completed',
      started_at_ms: 100,
      ended_at_ms: 200,
      processed_files: 10,
      inserted_tracks: 1,
      changed_tracks: 1,
      unchanged_files: 5,
      restored_tracks: 1,
      missing_tracks: 2,
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
      .fn<LibraryScanStoreDependencies['getLibraryScanStatus']>()
      .mockResolvedValueOnce(running1)
      .mockResolvedValueOnce(running2)
      .mockResolvedValueOnce(completed)
      .mockResolvedValue(completed);

    const deps = createDependencies({ getLibraryScanStatus });
    const store = createLibraryScanStore(deps);

    await store.start(['/music']);

    expect(deps.startLibraryScan).toHaveBeenCalledWith(['/music']);
    expect(getLibraryScanStatus).toHaveBeenCalledTimes(1);
    expect(get(store.status)).toStrictEqual(running1);
    expect(get(store.isScanning)).toBe(true);

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(2);
    expect(get(store.status)).toStrictEqual(running2);
    expect(get(store.isScanning)).toBe(true);

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(3);
    expect(get(store.status)).toStrictEqual(completed);
    expect(get(store.isScanning)).toBe(false);

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS * 6);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(3);

    store.destroy();
  });

  it('destroy() stops future polling calls', async () => {
    const running = createStatus({ phase: 'running' });

    const getLibraryScanStatus = vi
      .fn<LibraryScanStoreDependencies['getLibraryScanStatus']>()
      .mockResolvedValue(running);

    const deps = createDependencies({ getLibraryScanStatus });
    const store = createLibraryScanStore(deps);

    await store.start(['/music']);

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(2);

    store.destroy();

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS * 10);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(2);
  });

  it('continues polling even if startLibraryScan rejects when scan is already running', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const running1 = createStatus({
      phase: 'running',
      current_path: '/music/a/first.flac',
      processed_files: 1,
      inserted_tracks: 1,
      changed_tracks: 0,
      unchanged_files: 0,
      restored_tracks: 0,
      missing_tracks: 0,
    });
    const running2 = createStatus({
      phase: 'running',
      current_path: '/music/a/second.flac',
      processed_files: 4,
      inserted_tracks: 1,
      changed_tracks: 1,
      unchanged_files: 1,
      restored_tracks: 0,
      missing_tracks: 0,
    });
    const completed = createStatus({
      phase: 'completed',
      ended_at_ms: 123,
      processed_files: 10,
      inserted_tracks: 1,
      changed_tracks: 1,
      unchanged_files: 3,
      restored_tracks: 1,
      missing_tracks: 1,
    });

    const startLibraryScan = vi
      .fn<LibraryScanStoreDependencies['startLibraryScan']>()
      .mockRejectedValue(new Error('already running'));

    const getLibraryScanStatus = vi
      .fn<LibraryScanStoreDependencies['getLibraryScanStatus']>()
      .mockResolvedValueOnce(running1)
      .mockResolvedValueOnce(running2)
      .mockResolvedValueOnce(completed)
      .mockResolvedValue(completed);

    const deps = createDependencies({ startLibraryScan, getLibraryScanStatus });
    const store = createLibraryScanStore(deps);

    await store.start(['/music']);

    expect(startLibraryScan).toHaveBeenCalledWith(['/music']);
    expect(getLibraryScanStatus).toHaveBeenCalledTimes(1);
    expect(get(store.status)).toStrictEqual(running1);
    expect(get(store.isScanning)).toBe(true);

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(2);
    expect(get(store.status)).toStrictEqual(running2);
    expect(get(store.isScanning)).toBe(true);

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(3);
    expect(get(store.status)).toStrictEqual(completed);
    expect(get(store.isScanning)).toBe(false);

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS * 6);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(3);

    store.destroy();
  });

  it('stops polling if startLibraryScan rejects and backend reports idle', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const startLibraryScan = vi
      .fn<LibraryScanStoreDependencies['startLibraryScan']>()
      .mockRejectedValue(new Error('start failed'));

    const idle = createStatus({ phase: 'idle' });

    const getLibraryScanStatus = vi
      .fn<LibraryScanStoreDependencies['getLibraryScanStatus']>()
      .mockResolvedValue(idle);

    const deps = createDependencies({ startLibraryScan, getLibraryScanStatus });
    const store = createLibraryScanStore(deps);

    await store.start(['/music']);

    expect(startLibraryScan).toHaveBeenCalledWith(['/music']);
    expect(getLibraryScanStatus).toHaveBeenCalledTimes(1);
    expect(get(store.status)).toStrictEqual(idle);
    expect(get(store.isScanning)).toBe(false);

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS * 10);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(1);

    store.destroy();
  });

  it('preserves the last complete status on poll errors and restores richer counters on success', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const completed1 = createStatus({
      phase: 'completed',
      ended_at_ms: 1,
      processed_files: 10,
      inserted_tracks: 2,
      changed_tracks: 3,
      unchanged_files: 4,
      restored_tracks: 5,
      missing_tracks: 6,
      error_count: 1,
      sample_errors: [
        {
          path: '/offline-drive',
          message: 'Root path does not exist or is not a directory',
          kind: 'invalid_path',
        },
      ],
    });
    const running = createStatus({
      phase: 'running',
      current_path: '/music/updated.flac',
      processed_files: 11,
      inserted_tracks: 2,
      changed_tracks: 4,
      unchanged_files: 4,
      restored_tracks: 5,
      missing_tracks: 6,
      error_count: 1,
      sample_errors: [
        {
          path: '/offline-drive',
          message: 'Root path does not exist or is not a directory',
          kind: 'invalid_path',
        },
      ],
    });
    const completed2 = createStatus({
      phase: 'completed',
      ended_at_ms: 2,
      processed_files: 42,
      inserted_tracks: 2,
      changed_tracks: 5,
      unchanged_files: 6,
      restored_tracks: 7,
      missing_tracks: 8,
      error_count: 2,
      sample_errors: [
        {
          path: '/offline-drive',
          message: 'Root path does not exist or is not a directory',
          kind: 'invalid_path',
        },
        {
          path: '/music/broken.flac',
          message: 'Failed to read metadata',
          kind: 'read_metadata',
        },
      ],
    });

    const getLibraryScanStatus = vi
      .fn<LibraryScanStoreDependencies['getLibraryScanStatus']>()
      .mockResolvedValueOnce(completed1)
      .mockRejectedValueOnce(new Error('transient error'))
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce(completed2)
      .mockResolvedValue(completed2);

    const deps = createDependencies({ getLibraryScanStatus });
    const store = createLibraryScanStore(deps);

    await store.start(['/music']);

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(1);
    expect(get(store.status)).toStrictEqual(completed1);

    await store.start(['/music']);

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(2);
    expect(get(store.status)).toStrictEqual(completed1);

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(3);
    expect(get(store.status)).toStrictEqual(running);
    expect(get(store.isScanning)).toBe(true);

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(4);
    expect(get(store.status)).toStrictEqual(completed2);
    expect(get(store.isScanning)).toBe(false);

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS * 6);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(4);

    store.destroy();
  });
});
