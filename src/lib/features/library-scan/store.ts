import { derived, writable, type Readable, type Writable } from 'svelte/store';

import * as libraryApi from '../../api/library';
import type { ScanPhase, ScanStatus } from '../../types';

export const SCAN_STATUS_POLL_INTERVAL_MS = 250;

export type LibraryScanStoreDependencies = {
  startLibraryScan: (paths: string[]) => Promise<void>;
  getLibraryScanStatus: () => Promise<ScanStatus>;
  cancelLibraryScan: () => Promise<void>;
  setInterval: typeof globalThis.setInterval;
  clearInterval: typeof globalThis.clearInterval;
};

export type LibraryScanStore = {
  status: Writable<ScanStatus>;
  isScanning: Readable<boolean>;
  start: (paths: string[]) => Promise<void>;
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

function initialStatus(): ScanStatus {
  return {
    phase: 'idle',
    started_at_ms: null,
    ended_at_ms: null,
    current_path: null,
    processed_files: 0,
    inserted_tracks: 0,
    error_count: 0,
    sample_errors: [],
  };
}

function isTerminalPhase(phase: ScanPhase): boolean {
  return phase === 'completed' || phase === 'cancelled' || phase === 'failed';
}

export function createLibraryScanStore(
  overrides: Partial<LibraryScanStoreDependencies> = {},
): LibraryScanStore {
  const deps: LibraryScanStoreDependencies = { ...defaultDependencies(), ...overrides };

  const status = writable<ScanStatus>(initialStatus());
  const isScanning = derived(
    status,
    ($status) => $status.phase === 'running' || $status.phase === 'cancelling',
  );

  let pollInterval: ReturnType<typeof deps.setInterval> | null = null;

  function stopPolling(): void {
    if (!pollInterval) return;
    deps.clearInterval(pollInterval);
    pollInterval = null;
  }

  async function pollStatus(): Promise<ScanStatus | null> {
    try {
      const next = await deps.getLibraryScanStatus();
      status.set(next);

      if (isTerminalPhase(next.phase)) {
        stopPolling();
      }

      return next;
    } catch (error) {
      console.error('Failed to poll library scan status:', error);
      stopPolling();
      return null;
    }
  }

  async function start(paths: string[]): Promise<void> {
    stopPolling();

    try {
      await deps.startLibraryScan(paths);
    } catch (error) {
      console.error('Failed to start library scan:', error);
      await pollStatus();
      return;
    }

    const next = await pollStatus();
    if (!next) return;

    if (!isTerminalPhase(next.phase)) {
      pollInterval = deps.setInterval(() => {
        void pollStatus();
      }, SCAN_STATUS_POLL_INTERVAL_MS);
    }
  }

  async function cancel(): Promise<void> {
    try {
      await deps.cancelLibraryScan();
    } catch (error) {
      console.error('Failed to cancel library scan:', error);
    }

    await pollStatus();
  }

  function destroy(): void {
    stopPolling();
  }

  return {
    status,
    isScanning,
    start,
    cancel,
    destroy,
  };
}
