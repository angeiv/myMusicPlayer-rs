import { derived, writable, type Readable } from 'svelte/store';

import * as libraryApi from '../../api/library';
import {
  buildLibraryMaintenanceState,
  cloneLibraryMaintenanceState,
  type LibraryMaintenanceState,
} from './maintenance';
import {
  createLibraryWatcherStatus,
  createScanStatus,
  type LibraryScanRequest,
  type LibraryWatcherStatus,
  type ScanPhase,
  type ScanStatus,
} from '../../types';

export const SCAN_STATUS_POLL_INTERVAL_MS = 250;

type LibraryScanStartRequest = LibraryScanRequest | string[];

type MaintenanceSnapshot = {
  scanStatus: ScanStatus;
  watcherStatus: LibraryWatcherStatus;
};

export type LibraryScanStoreDependencies = {
  startLibraryScan: (requestOrPaths: LibraryScanStartRequest) => Promise<void>;
  getLibraryScanStatus: () => Promise<ScanStatus>;
  getLibraryWatcherStatus: () => Promise<LibraryWatcherStatus>;
  cancelLibraryScan: () => Promise<void>;
  setInterval: typeof globalThis.setInterval;
  clearInterval: typeof globalThis.clearInterval;
};

export type LibraryScanStore = {
  status: Readable<ScanStatus>;
  watcherStatus: Readable<LibraryWatcherStatus>;
  maintenance: Readable<LibraryMaintenanceState>;
  isScanning: Readable<boolean>;
  refreshMaintenance: () => Promise<LibraryMaintenanceState>;
  start: (requestOrPaths: LibraryScanStartRequest) => Promise<void>;
  cancel: () => Promise<void>;
  destroy: () => void;
};

function defaultDependencies(): LibraryScanStoreDependencies {
  return {
    startLibraryScan: libraryApi.startLibraryScan,
    getLibraryScanStatus: libraryApi.getLibraryScanStatus,
    getLibraryWatcherStatus: libraryApi.getLibraryWatcherStatus,
    cancelLibraryScan: libraryApi.cancelLibraryScan,
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
  };
}

function normalizeLibraryScanRequest(requestOrPaths: LibraryScanStartRequest): LibraryScanRequest {
  if (Array.isArray(requestOrPaths)) {
    return { paths: [...requestOrPaths] };
  }

  return {
    ...requestOrPaths,
    paths: [...requestOrPaths.paths],
  };
}

function initialStatus(): ScanStatus {
  return createScanStatus();
}

function initialWatcherStatus(): LibraryWatcherStatus {
  return createLibraryWatcherStatus();
}

function isActivePhase(phase: ScanPhase | null | undefined): boolean {
  return phase === 'running' || phase === 'cancelling';
}

function shouldKeepPolling(watcherStatus: LibraryWatcherStatus): boolean {
  return isActivePhase(watcherStatus.active_scan_phase) || watcherStatus.queued_follow_up;
}

function createCloneReadable<T>(
  source: Readable<T>,
  clone: (value: T) => T,
): Readable<T> {
  return {
    subscribe(run, invalidate) {
      return source.subscribe((value) => run(clone(value)), invalidate);
    },
  };
}

export function createLibraryScanStore(
  overrides: Partial<LibraryScanStoreDependencies> = {},
): LibraryScanStore {
  const deps: LibraryScanStoreDependencies = { ...defaultDependencies(), ...overrides };

  const initial = initialStatus();
  const initialWatcher = initialWatcherStatus();

  const statusState = writable<ScanStatus>(initial);
  const watcherState = writable<LibraryWatcherStatus>(initialWatcher);
  const maintenanceState = derived([statusState, watcherState], ([$status, $watcher]) =>
    buildLibraryMaintenanceState($status, $watcher),
  );

  let lastKnownStatus = initial;
  let lastKnownWatcherStatus = initialWatcher;

  let unsubscribeLastKnownStatus: () => void = statusState.subscribe((value) => {
    lastKnownStatus = value;
  });
  let unsubscribeLastKnownWatcherStatus: () => void = watcherState.subscribe((value) => {
    lastKnownWatcherStatus = value;
  });

  const status = createCloneReadable(statusState, createScanStatus);
  const watcherStatus = createCloneReadable(watcherState, createLibraryWatcherStatus);
  const maintenance = createCloneReadable(maintenanceState, cloneLibraryMaintenanceState);
  const isScanning = derived(statusState, ($status) => isActivePhase($status.phase));

  let destroyed = false;
  let pollInterval: ReturnType<typeof deps.setInterval> | null = null;
  let pollInFlight: Promise<MaintenanceSnapshot> | null = null;

  function stopPolling(): void {
    if (!pollInterval) return;
    deps.clearInterval(pollInterval);
    pollInterval = null;
  }

  function ensurePolling(): void {
    if (destroyed || pollInterval) return;

    pollInterval = deps.setInterval(() => {
      void pollSnapshot();
    }, SCAN_STATUS_POLL_INTERVAL_MS);
  }

  function setStatus(next: ScanStatus): void {
    const snapshot = createScanStatus(next);
    lastKnownStatus = snapshot;
    statusState.set(snapshot);
  }

  function setWatcherStatus(next: LibraryWatcherStatus): void {
    const snapshot = createLibraryWatcherStatus(next);
    lastKnownWatcherStatus = snapshot;
    watcherState.set(snapshot);
  }

  function getCurrentMaintenance(): LibraryMaintenanceState {
    return buildLibraryMaintenanceState(lastKnownStatus, lastKnownWatcherStatus);
  }

  async function pollSnapshot(): Promise<MaintenanceSnapshot> {
    if (destroyed) {
      return {
        scanStatus: lastKnownStatus,
        watcherStatus: lastKnownWatcherStatus,
      };
    }

    if (pollInFlight) {
      return pollInFlight;
    }

    pollInFlight = (async () => {
      try {
        const [nextScanStatus, nextWatcherStatus] = await Promise.all([
          deps.getLibraryScanStatus(),
          deps.getLibraryWatcherStatus(),
        ]);

        if (!destroyed) {
          setStatus(nextScanStatus);
          setWatcherStatus(nextWatcherStatus);
        }

        if (!isActivePhase(nextScanStatus.phase) && !shouldKeepPolling(nextWatcherStatus)) {
          stopPolling();
        }

        return {
          scanStatus: createScanStatus(nextScanStatus),
          watcherStatus: createLibraryWatcherStatus(nextWatcherStatus),
        };
      } catch (error) {
        console.error('Failed to poll library maintenance status:', error);
        return {
          scanStatus: lastKnownStatus,
          watcherStatus: lastKnownWatcherStatus,
        };
      }
    })();

    try {
      return await pollInFlight;
    } finally {
      pollInFlight = null;
    }
  }

  async function refreshMaintenance(): Promise<LibraryMaintenanceState> {
    const snapshot = await pollSnapshot();

    if (isActivePhase(snapshot.scanStatus.phase) || shouldKeepPolling(snapshot.watcherStatus)) {
      ensurePolling();
    }

    return getCurrentMaintenance();
  }

  async function start(requestOrPaths: LibraryScanStartRequest): Promise<void> {
    if (destroyed) return;

    const request = normalizeLibraryScanRequest(requestOrPaths);

    try {
      await deps.startLibraryScan(request);
    } catch (error) {
      console.error('Failed to start library scan:', error);
    }

    ensurePolling();
    const next = await refreshMaintenance();

    if (isActivePhase(next.activePhase) || next.queuedFollowUp) {
      ensurePolling();
    }
  }

  async function cancel(): Promise<void> {
    if (destroyed) return;

    try {
      await deps.cancelLibraryScan();
    } catch (error) {
      console.error('Failed to cancel library scan:', error);
    }

    ensurePolling();
    const next = await refreshMaintenance();

    if (isActivePhase(next.activePhase) || next.queuedFollowUp) {
      ensurePolling();
    }
  }

  function destroy(): void {
    destroyed = true;
    stopPolling();

    unsubscribeLastKnownStatus();
    unsubscribeLastKnownStatus = () => {};
    unsubscribeLastKnownWatcherStatus();
    unsubscribeLastKnownWatcherStatus = () => {};
  }

  return {
    status,
    watcherStatus,
    maintenance,
    isScanning,
    refreshMaintenance,
    start,
    cancel,
    destroy,
  };
}
