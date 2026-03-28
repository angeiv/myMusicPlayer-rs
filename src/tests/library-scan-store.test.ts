// @vitest-environment jsdom

import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SCAN_STATUS_POLL_INTERVAL_MS,
  createLibraryScanStore,
  type LibraryScanStoreDependencies,
} from '../lib/features/library-scan/store';
import type { ScanStatus } from '../lib/types';

function createStatus(overrides: Partial<ScanStatus> = {}): ScanStatus {
  return {
    phase: 'idle',
    started_at_ms: null,
    ended_at_ms: null,
    current_path: null,
    processed_files: 0,
    inserted_tracks: 0,
    error_count: 0,
    sample_errors: [],
    ...overrides,
  };
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

  it('polls until reaching a terminal phase and then stops polling', async () => {
    const running1 = createStatus({ phase: 'running', processed_files: 0 });
    const running2 = createStatus({ phase: 'running', processed_files: 4 });
    const completed = createStatus({ phase: 'completed', processed_files: 10, ended_at_ms: 123 });

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
    expect(get(store.status)).toMatchObject({ phase: 'running', processed_files: 0 });
    expect(get(store.isScanning)).toBe(true);

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(2);
    expect(get(store.status)).toMatchObject({ phase: 'running', processed_files: 4 });
    expect(get(store.isScanning)).toBe(true);

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(3);
    expect(get(store.status)).toMatchObject({ phase: 'completed', processed_files: 10 });
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

    const running1 = createStatus({ phase: 'running', processed_files: 1 });
    const running2 = createStatus({ phase: 'running', processed_files: 4 });
    const completed = createStatus({ phase: 'completed', processed_files: 10, ended_at_ms: 123 });

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
    expect(get(store.status)).toMatchObject({ phase: 'running', processed_files: 1 });
    expect(get(store.isScanning)).toBe(true);

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(2);
    expect(get(store.status)).toMatchObject({ phase: 'running', processed_files: 4 });
    expect(get(store.isScanning)).toBe(true);

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(3);
    expect(get(store.status)).toMatchObject({ phase: 'completed', processed_files: 10 });
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
    expect(get(store.status)).toMatchObject({ phase: 'idle' });
    expect(get(store.isScanning)).toBe(false);

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS * 10);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(1);

    store.destroy();
  });

  it('recovers polling if the first status poll after start fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const completed1 = createStatus({ phase: 'completed', processed_files: 10, ended_at_ms: 1 });
    const running = createStatus({ phase: 'running', processed_files: 0 });
    const completed2 = createStatus({ phase: 'completed', processed_files: 42, ended_at_ms: 2 });

    const getLibraryScanStatus = vi
      .fn<LibraryScanStoreDependencies['getLibraryScanStatus']>()
      // Seed lastKnownStatus with a terminal state from a previous scan.
      .mockResolvedValueOnce(completed1)
      // First poll after start fails.
      .mockRejectedValueOnce(new Error('transient error'))
      // Subsequent polls succeed.
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce(completed2)
      .mockResolvedValue(completed2);

    const deps = createDependencies({ getLibraryScanStatus });
    const store = createLibraryScanStore(deps);

    await store.start(['/music']);

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(1);
    expect(get(store.status)).toMatchObject({ phase: 'completed', processed_files: 10 });

    await store.start(['/music']);

    // Polling failed; the store is still on the previous terminal status for now.
    expect(getLibraryScanStatus).toHaveBeenCalledTimes(2);
    expect(get(store.status)).toMatchObject({ phase: 'completed', processed_files: 10 });

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(3);
    expect(get(store.status)).toMatchObject({ phase: 'running', processed_files: 0 });
    expect(get(store.isScanning)).toBe(true);

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(4);
    expect(get(store.status)).toMatchObject({ phase: 'completed', processed_files: 42 });
    expect(get(store.isScanning)).toBe(false);

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS * 6);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(4);

    store.destroy();
  });
});
