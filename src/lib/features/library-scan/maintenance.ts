import {
  createLibraryWatcherStatus,
  createScanStatus,
  type LibraryWatcherStatus,
  type ScanMode,
  type ScanPhase,
  type ScanStatus,
} from '../../types';

export type LibraryMaintenanceTone = 'default' | 'active' | 'warning' | 'danger' | 'success';

export type LibraryMaintenanceNextStepKind =
  | 'wait'
  | 'cancel-scan'
  | 'rescan'
  | 'full-scan'
  | 'review-folders';

export type LibraryMaintenanceNextStep = {
  kind: LibraryMaintenanceNextStepKind;
  label: string;
};

export type LibraryMaintenanceState = {
  scanStatus: ScanStatus;
  watcherStatus: LibraryWatcherStatus;
  watchedRoots: string[];
  dirtyRoots: string[];
  queuedFollowUp: boolean;
  activePhase: ScanPhase | null;
  lastError: string | null;
  title: string;
  description: string;
  tone: LibraryMaintenanceTone;
  recoveryHint: string | null;
  nextStep: LibraryMaintenanceNextStep | null;
};

function getScanLabel(mode: ScanMode | null | undefined): string {
  if (mode === 'incremental') return 'Incremental sync';
  if (mode === 'full') return 'Full scan';
  return 'Library scan';
}

function formatFolderCount(count: number): string {
  return `${count} folder${count === 1 ? '' : 's'}`;
}

function isActivePhase(phase: ScanPhase | null | undefined): boolean {
  return phase === 'running' || phase === 'cancelling';
}

function resolveActivePhase(scanStatus: ScanStatus, watcherStatus: LibraryWatcherStatus): ScanPhase | null {
  if (isActivePhase(scanStatus.phase)) {
    return scanStatus.phase;
  }

  return isActivePhase(watcherStatus.active_scan_phase)
    ? watcherStatus.active_scan_phase ?? null
    : null;
}

function formatError(sample: ScanStatus['sample_errors'][number] | undefined): string | null {
  if (!sample) return null;

  const path = sample.path?.trim();
  return path ? `${path} — ${sample.message}` : sample.message;
}

export function buildLibraryMaintenanceState(
  scanStatusInput: ScanStatus,
  watcherStatusInput: LibraryWatcherStatus,
): LibraryMaintenanceState {
  const scanStatus = createScanStatus(scanStatusInput);
  const watcherStatus = createLibraryWatcherStatus(watcherStatusInput);
  const activePhase = resolveActivePhase(scanStatus, watcherStatus);
  const watchedRoots = [...watcherStatus.watched_roots];
  const dirtyRoots = [...watcherStatus.dirty_roots];
  const queuedFollowUp = watcherStatus.queued_follow_up;
  const lastError = watcherStatus.last_error?.trim() || formatError(scanStatus.sample_errors[0]);
  const scanLabel = getScanLabel(scanStatus.mode);

  if (activePhase === 'running') {
    return {
      scanStatus,
      watcherStatus,
      watchedRoots,
      dirtyRoots,
      queuedFollowUp,
      activePhase,
      lastError,
      title: `${scanLabel} in progress`,
      description: queuedFollowUp
        ? 'Scanning the library now. Auto-sync already queued one follow-up pass for newer file changes.'
        : watchedRoots.length > 0
          ? `Scanning the library now while watching ${formatFolderCount(watchedRoots.length)} for follow-up changes.`
          : 'Scanning the library now through the shared maintenance flow.',
      tone: 'active',
      recoveryHint: queuedFollowUp
        ? 'Let the current scan finish. The queued follow-up will run automatically.'
        : null,
      nextStep: {
        kind: 'cancel-scan',
        label: 'Cancel scan',
      },
    };
  }

  if (activePhase === 'cancelling') {
    return {
      scanStatus,
      watcherStatus,
      watchedRoots,
      dirtyRoots,
      queuedFollowUp,
      activePhase,
      lastError,
      title: scanStatus.mode ? `Cancelling ${scanLabel.toLowerCase()}` : 'Cancelling scan',
      description: queuedFollowUp
        ? 'Cancelling the current scan. Auto-sync already queued one follow-up pass for newer file changes.'
        : 'Cancelling the current maintenance pass.',
      tone: 'active',
      recoveryHint: queuedFollowUp
        ? 'Let the current scan finish. The queued follow-up will run automatically.'
        : 'Wait for cancellation to finish before starting another maintenance pass.',
      nextStep: {
        kind: 'wait',
        label: 'Waiting for cancellation',
      },
    };
  }

  if (watcherStatus.last_error) {
    const watchingDescription = watchedRoots.length
      ? `Watching ${formatFolderCount(watchedRoots.length)}, but the last watcher update failed before a follow-up sync could start.`
      : 'The watcher is not monitoring any folders right now, so changes on disk will not sync automatically.';

    return {
      scanStatus,
      watcherStatus,
      watchedRoots,
      dirtyRoots,
      queuedFollowUp,
      activePhase,
      lastError,
      title: watchedRoots.length > 0 ? 'Auto-sync needs attention' : 'Auto-sync is not watching folders',
      description: watchingDescription,
      tone: watchedRoots.length > 0 ? 'warning' : 'danger',
      recoveryHint: watchedRoots.length > 0
        ? 'Fix the watcher problem or folder access, then run Rescan Now to confirm the library state.'
        : 'Review your library folders, then run Rescan Now to rebuild the maintenance baseline.',
      nextStep: {
        kind: watchedRoots.length > 0 ? 'rescan' : 'review-folders',
        label: watchedRoots.length > 0 ? 'Rescan Now' : 'Review folders',
      },
    };
  }

  if (scanStatus.phase === 'failed') {
    return {
      scanStatus,
      watcherStatus,
      watchedRoots,
      dirtyRoots,
      queuedFollowUp,
      activePhase,
      lastError,
      title: scanStatus.mode ? `${scanLabel} failed` : 'Scan failed',
      description: `The last ${scanLabel.toLowerCase()} stopped before finishing.`,
      tone: 'danger',
      recoveryHint: 'Fix the failing path or metadata issue, then run Rescan Now or Full Scan.',
      nextStep: {
        kind: 'rescan',
        label: 'Rescan Now',
      },
    };
  }

  if (queuedFollowUp) {
    return {
      scanStatus,
      watcherStatus,
      watchedRoots,
      dirtyRoots,
      queuedFollowUp,
      activePhase,
      lastError,
      title: 'Auto-sync follow-up queued',
      description: 'A follow-up maintenance pass is queued and will start as soon as the current scan state clears.',
      tone: 'warning',
      recoveryHint: 'Keep the app open until the queued follow-up starts, or run Rescan Now if you need to retry manually.',
      nextStep: {
        kind: 'rescan',
        label: 'Rescan Now',
      },
    };
  }

  if (scanStatus.phase === 'completed') {
    const completedWithIssues = scanStatus.error_count > 0 || scanStatus.missing_tracks > 0;

    return {
      scanStatus,
      watcherStatus,
      watchedRoots,
      dirtyRoots,
      queuedFollowUp,
      activePhase,
      lastError,
      title: `${scanLabel} complete`,
      description: watchedRoots.length > 0
        ? `Watching ${formatFolderCount(watchedRoots.length)} for changes. The last pass ${completedWithIssues ? 'finished with issues.' : 'finished cleanly.'}`
        : `The last maintenance pass ${completedWithIssues ? 'finished with issues.' : 'finished cleanly.'}`,
      tone: completedWithIssues ? 'warning' : 'success',
      recoveryHint: completedWithIssues
        ? 'Review the latest scan error before running the next rescan.'
        : null,
      nextStep: completedWithIssues
        ? {
            kind: 'rescan',
            label: 'Rescan Now',
          }
        : null,
    };
  }

  if (scanStatus.phase === 'cancelled') {
    return {
      scanStatus,
      watcherStatus,
      watchedRoots,
      dirtyRoots,
      queuedFollowUp,
      activePhase,
      lastError,
      title: scanStatus.mode ? `${scanLabel} cancelled` : 'Scan cancelled',
      description: 'The last maintenance pass was cancelled before it finished.',
      tone: 'warning',
      recoveryHint: 'Run Rescan Now when you are ready to restart maintenance.',
      nextStep: {
        kind: 'rescan',
        label: 'Rescan Now',
      },
    };
  }

  if (watchedRoots.length > 0) {
    return {
      scanStatus,
      watcherStatus,
      watchedRoots,
      dirtyRoots,
      queuedFollowUp,
      activePhase,
      lastError,
      title: 'Auto-sync ready',
      description: `Watching ${formatFolderCount(watchedRoots.length)} for changes. Manual rescans use the same maintenance flow.`,
      tone: 'default',
      recoveryHint: null,
      nextStep: null,
    };
  }

  return {
    scanStatus,
    watcherStatus,
    watchedRoots,
    dirtyRoots,
    queuedFollowUp,
    activePhase,
    lastError,
    title: 'No scan running',
    description: 'Add folders or run a rescan to start the shared maintenance flow.',
    tone: 'default',
    recoveryHint: null,
    nextStep: null,
  };
}

export function cloneLibraryMaintenanceState(
  state: LibraryMaintenanceState,
): LibraryMaintenanceState {
  return {
    ...state,
    scanStatus: createScanStatus(state.scanStatus),
    watcherStatus: createLibraryWatcherStatus(state.watcherStatus),
    watchedRoots: [...state.watchedRoots],
    dirtyRoots: [...state.dirtyRoots],
    nextStep: state.nextStep ? { ...state.nextStep } : null,
  };
}
