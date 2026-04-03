import { derived, writable, type Readable, type Writable } from 'svelte/store';

import * as libraryApi from '../../api/library';
import { createScanStatus, type LibraryScanRequest, type ScanPhase, type ScanStatus } from '../../types';

export const SCAN_STATUS_POLL_INTERVAL_MS = 250;

type LibraryScanStartRequest = LibraryScanRequest | string[];

export type LibraryScanStoreDependencies = {
  startLibraryScan: (requestOrPaths: LibraryScanStartRequest) => Promise<void>;
  getLibraryScanStatus: () => Promise<ScanStatus>;
  cancelLibraryScan: () => Promise<void>;
  setInterval: typeof globalThis.setInterval;
  clearInterval: typeof globalThis.clearInterval;
};

export type LibraryScanStore = {
  status: Writable<ScanStatus>;
  isScanning: Readable<boolean>;
  start: (requestOrPaths: LibraryScanStartRequest) => Promise<void>;
  cancel: () => Promise<void>;
  destroy: () => void;
};

function defaultDependencies(): LibraryScanStoreDependencies {
  return {
    startLibraryScan: libraryApi.startLibraryScan,
    getLibraryScanStatus: libraryApi.getLibraryScanStatus,
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

function isActivePhase(phase: ScanPhase): boolean {
  return phase === 'running' || phase === 'cancelling';
}

function isTerminalPhase(phase: ScanPhase): boolean {
  // Treat anything other than running/cancelling as non-active; polling should stop.
  return !isActivePhase(phase);
}

export function createLibraryScanStore(
  overrides: Partial<LibraryScanStoreDependencies> = {},
): LibraryScanStore {
  const deps: LibraryScanStoreDependencies = { ...defaultDependencies(), ...overrides };

  const initial = initialStatus();
  const status = writable<ScanStatus>(initial);

  let lastKnownStatus = initial;
  let unsubscribeLastKnownStatus: () => void = status.subscribe((value) => {
    lastKnownStatus = value;
  });

  const isScanning = derived(status, ($status) => isActivePhase($status.phase));

  let destroyed = false;

  let pollInterval: ReturnType<typeof deps.setInterval> | null = null;
  let pollInFlight: Promise<ScanStatus> | null = null;

  function stopPolling(): void {
    if (!pollInterval) return;
    deps.clearInterval(pollInterval);
    pollInterval = null;
  }

  function ensurePolling(): void {
    if (destroyed || pollInterval) return;

    pollInterval = deps.setInterval(() => {
      // Intentionally fire-and-forget: pollStatus handles its own error logging,
      // and has an inFlight guard so timer ticks don't overlap.
      void pollStatus();
    }, SCAN_STATUS_POLL_INTERVAL_MS);
  }

  function setStatus(next: ScanStatus): void {
    lastKnownStatus = next;
    status.set(next);
  }

  async function pollStatus(): Promise<ScanStatus> {
    if (destroyed) return lastKnownStatus;

    if (pollInFlight) {
      return pollInFlight;
    }

    pollInFlight = (async () => {
      try {
        const next = await deps.getLibraryScanStatus();
        if (!destroyed) {
          setStatus(next);
        }

        if (isTerminalPhase(next.phase)) {
          stopPolling();
        }

        return next;
      } catch (error) {
        // Keep polling on transient errors; preserve last known status.
        console.error('Failed to poll library scan status:', error);
        return lastKnownStatus;
      }
    })();

    try {
      return await pollInFlight;
    } finally {
      pollInFlight = null;
    }
  }

  async function start(requestOrPaths: LibraryScanStartRequest): Promise<void> {
    if (destroyed) return;

    const request = normalizeLibraryScanRequest(requestOrPaths);

    try {
      await deps.startLibraryScan(request);
    } catch (error) {
      // Starting can fail for reasons like "scan already running"; don't treat
      // it as fatal. We still poll once and keep polling if scan isn't terminal.
      console.error('Failed to start library scan:', error);
    }

    ensurePolling();
    const next = await pollStatus();

    if (!isTerminalPhase(next.phase)) {
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
    const next = await pollStatus();

    if (!isTerminalPhase(next.phase)) {
      ensurePolling();
    }
  }

  function destroy(): void {
    destroyed = true;
    stopPolling();

    unsubscribeLastKnownStatus();
    unsubscribeLastKnownStatus = () => {};
  }

  return {
    status,
    isScanning,
    start,
    cancel,
    destroy,
  };
}
