// @vitest-environment jsdom

import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SCAN_STATUS_POLL_INTERVAL_MS,
  createLibraryScanStore,
  type LibraryScanStoreDependencies,
} from '../lib/features/library-scan/store';
import {
  createLibraryWatcherStatus,
  createScanStatus,
  type LibraryScanRequest,
  type LibraryWatcherStatus,
  type ScanStatus,
} from '../lib/types';

function createStatus(overrides: Partial<ScanStatus> = {}): ScanStatus {
  return createScanStatus(overrides);
}

function createWatcherStatus(
  overrides: Partial<LibraryWatcherStatus> = {},
): LibraryWatcherStatus {
  return createLibraryWatcherStatus(overrides);
}

function createRequest(overrides: Partial<LibraryScanRequest> = {}): LibraryScanRequest {
  return {
    paths: [...(overrides.paths ?? ['/music'])],
    mode: overrides.mode ?? null,
  };
}

function createDependencies(
  overrides: Partial<LibraryScanStoreDependencies> = {},
): LibraryScanStoreDependencies {
  return {
    startLibraryScan: vi.fn().mockResolvedValue(undefined),
    getLibraryScanStatus: vi.fn().mockResolvedValue(createStatus()),
    getLibraryWatcherStatus: vi.fn().mockResolvedValue(createWatcherStatus()),
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
    expect(get(store.watcherStatus)).toStrictEqual(createWatcherStatus());
    expect(get(store.maintenance)).toMatchObject({
      title: '未开始扫描',
      tone: 'default',
      watchedRoots: [],
      queuedFollowUp: false,
      lastError: null,
    });
    expect(get(store.isScanning)).toBe(false);

    store.destroy();
  });

  it('aggregates watcher follow-up and watcher errors into a clone-safe maintenance snapshot', async () => {
    const request = createRequest({ mode: 'incremental' });
    const running = createStatus({
      phase: 'running',
      mode: 'incremental',
      current_path: '/music/live/new-track.flac',
      processed_files: 4,
      inserted_tracks: 1,
      changed_tracks: 1,
      unchanged_files: 2,
    });
    const completed = createStatus({
      phase: 'completed',
      mode: 'incremental',
      ended_at_ms: 200,
      processed_files: 8,
      inserted_tracks: 1,
      changed_tracks: 2,
      unchanged_files: 4,
      restored_tracks: 1,
    });
    const queuedWatcher = createWatcherStatus({
      watched_roots: ['/music', '/music/live'],
      dirty_roots: ['/music/live'],
      queued_follow_up: true,
      active_scan_phase: 'running',
      last_requested_scan: {
        requested_at_ms: 150,
        roots: ['/music/live'],
      },
      last_error: 'Failed to refresh watcher roots: /offline-drive',
    });
    const steadyWatcher = createWatcherStatus({
      watched_roots: ['/music', '/music/live'],
      dirty_roots: [],
      queued_follow_up: false,
      active_scan_phase: null,
      last_requested_scan: {
        requested_at_ms: 210,
        roots: ['/music/live'],
      },
      last_error: null,
    });

    const getLibraryScanStatus = vi
      .fn<LibraryScanStoreDependencies['getLibraryScanStatus']>()
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce(completed)
      .mockResolvedValue(completed);
    const getLibraryWatcherStatus = vi
      .fn<LibraryScanStoreDependencies['getLibraryWatcherStatus']>()
      .mockResolvedValueOnce(queuedWatcher)
      .mockResolvedValueOnce(steadyWatcher)
      .mockResolvedValue(steadyWatcher);

    const store = createLibraryScanStore(
      createDependencies({
        getLibraryScanStatus,
        getLibraryWatcherStatus,
      }),
    );

    await store.start(request);

    expect(get(store.status)).toStrictEqual(running);
    expect(get(store.watcherStatus)).toStrictEqual(queuedWatcher);
    expect(get(store.maintenance)).toMatchObject({
      title: '增量同步中',
      tone: 'active',
      watchedRoots: ['/music', '/music/live'],
      dirtyRoots: ['/music/live'],
      queuedFollowUp: true,
      activePhase: 'running',
      lastError: 'Failed to refresh watcher roots: /offline-drive',
      recoveryHint: '当前扫描结束后会自动继续。',
      nextStep: { kind: 'cancel-scan', label: '取消扫描' },
    });
    expect(get(store.maintenance).description).toContain('稍后会继续处理');

    const publicWatcher = get(store.watcherStatus);
    publicWatcher.watched_roots.push('/mutated');
    const publicMaintenance = get(store.maintenance);
    publicMaintenance.watchedRoots.push('/mutated');
    publicMaintenance.scanStatus.sample_errors.push({
      path: '/mutated',
      message: 'should not leak',
      kind: 'walk',
    });

    expect(get(store.watcherStatus)).toStrictEqual(queuedWatcher);
    expect(get(store.maintenance).watchedRoots).toStrictEqual(['/music', '/music/live']);
    expect(get(store.maintenance).scanStatus.sample_errors).toStrictEqual([]);

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS);
    await flushPromises();

    expect(get(store.status)).toStrictEqual(completed);
    expect(get(store.watcherStatus)).toStrictEqual(steadyWatcher);
    expect(get(store.maintenance)).toMatchObject({
      title: '增量同步已完成',
      watchedRoots: ['/music', '/music/live'],
      queuedFollowUp: false,
      activePhase: null,
      lastError: null,
    });

    store.destroy();
  });

  it('refreshes watcher-only maintenance snapshots without starting a second polling loop', async () => {
    const idle = createStatus({ phase: 'idle' });
    const watcher = createWatcherStatus({
      watched_roots: ['/music'],
      dirty_roots: [],
      queued_follow_up: false,
      active_scan_phase: null,
      last_error: 'Failed to schedule watcher batch: permissions denied',
    });

    const getLibraryScanStatus = vi
      .fn<LibraryScanStoreDependencies['getLibraryScanStatus']>()
      .mockResolvedValue(idle);
    const getLibraryWatcherStatus = vi
      .fn<LibraryScanStoreDependencies['getLibraryWatcherStatus']>()
      .mockResolvedValue(watcher);

    const store = createLibraryScanStore(
      createDependencies({
        getLibraryScanStatus,
        getLibraryWatcherStatus,
      }),
    );

    const maintenance = await store.refreshMaintenance();

    expect(maintenance).toMatchObject({
      title: '自动扫描异常',
      tone: 'warning',
      watchedRoots: ['/music'],
      queuedFollowUp: false,
      lastError: 'Failed to schedule watcher batch: permissions denied',
      nextStep: { kind: 'rescan', label: '立即重扫' },
    });
    expect(getLibraryScanStatus).toHaveBeenCalledTimes(1);
    expect(getLibraryWatcherStatus).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS * 4);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(1);
    expect(getLibraryWatcherStatus).toHaveBeenCalledTimes(1);

    store.destroy();
  });

  it('accepts request objects, polls until reaching a terminal phase, and then stops polling', async () => {
    const request = createRequest({ mode: 'incremental' });
    const running1 = createStatus({
      phase: 'running',
      mode: 'incremental',
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
      mode: 'incremental',
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
      mode: 'incremental',
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

    await store.start(request);

    expect(deps.startLibraryScan).toHaveBeenCalledWith(request);
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

  it('still normalizes legacy path-array starts while destroy() stops future polling calls', async () => {
    const running = createStatus({ phase: 'running', mode: 'incremental' });

    const getLibraryScanStatus = vi
      .fn<LibraryScanStoreDependencies['getLibraryScanStatus']>()
      .mockResolvedValue(running);

    const deps = createDependencies({ getLibraryScanStatus });
    const store = createLibraryScanStore(deps);

    await store.start(['/music']);

    expect(deps.startLibraryScan).toHaveBeenCalledWith({ paths: ['/music'] });
    expect(getLibraryScanStatus).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(2);

    store.destroy();

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS * 10);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(2);
  });

  it('continues polling when start rejects and preserves the backend-reported mode for an already-running scan', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const request = createRequest({ mode: 'incremental' });
    const running1 = createStatus({
      phase: 'running',
      mode: 'full',
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
      mode: 'full',
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
      mode: 'full',
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

    await store.start(request);

    expect(startLibraryScan).toHaveBeenCalledWith(request);
    expect(getLibraryScanStatus).toHaveBeenCalledTimes(1);
    expect(get(store.status)).toStrictEqual(running1);
    expect(get(store.status).mode).toBe('full');
    expect(get(store.isScanning)).toBe(true);

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(2);
    expect(get(store.status)).toStrictEqual(running2);
    expect(get(store.status).mode).toBe('full');
    expect(get(store.isScanning)).toBe(true);

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(3);
    expect(get(store.status)).toStrictEqual(completed);
    expect(get(store.status).mode).toBe('full');
    expect(get(store.isScanning)).toBe(false);

    await vi.advanceTimersByTimeAsync(SCAN_STATUS_POLL_INTERVAL_MS * 6);
    await flushPromises();

    expect(getLibraryScanStatus).toHaveBeenCalledTimes(3);

    store.destroy();
  });

  it('stops polling if start rejects and backend reports idle', async () => {
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

    expect(startLibraryScan).toHaveBeenCalledWith({ paths: ['/music'] });
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
      mode: 'incremental',
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
      mode: 'incremental',
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
      mode: 'incremental',
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

    await store.start({ paths: ['/music'], mode: 'incremental' });

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
