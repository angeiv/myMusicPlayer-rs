import type {
  LibraryMaintenanceState,
  LibraryMaintenanceTone,
} from '../features/library-scan/maintenance';

export type SettingsLibraryScanTone = 'default' | 'active' | 'warning' | 'danger' | 'success';

export type SettingsLibraryScanMetric = {
  label: string;
  value: string;
  tone?: 'warning' | 'danger' | 'success';
};

export type SettingsLibraryScanCallout = {
  title: string;
  description: string;
};

export type SettingsLibraryScanActionGuide = {
  title: string;
  buttonLabel: string;
  description: string;
};

export type SettingsLibraryScanPresentation = {
  title: string;
  description: string;
  statusTone: SettingsLibraryScanTone;
  currentPathLabel: string | null;
  currentPath: string | null;
  autoSyncSummary: string;
  watchedRoots: string[];
  dirtyRoots: string[];
  metrics: SettingsLibraryScanMetric[];
  queuedFollowUp: SettingsLibraryScanCallout | null;
  recoveryHint: string | null;
  actionGuide: SettingsLibraryScanActionGuide | null;
  watcherError: SettingsLibraryScanCallout | null;
  sampleError: SettingsLibraryScanCallout | null;
};

function formatFolderCount(count: number, noun = 'folder'): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function mapTone(tone: LibraryMaintenanceTone): SettingsLibraryScanTone {
  switch (tone) {
    case 'active':
    case 'warning':
    case 'danger':
    case 'success':
      return tone;
    case 'default':
    default:
      return 'default';
  }
}

function formatMetric(
  label: string,
  value: number,
  options: { warning?: boolean; danger?: boolean; success?: boolean } = {},
): SettingsLibraryScanMetric {
  return {
    label,
    value: String(value),
    ...(options.danger && value > 0
      ? { tone: 'danger' as const }
      : options.warning && value > 0
        ? { tone: 'warning' as const }
        : options.success && value > 0
          ? { tone: 'success' as const }
          : {}),
  };
}

function formatAutoSyncSummary(maintenance: LibraryMaintenanceState): string {
  if (maintenance.watchedRoots.length > 0) {
    return `Watching ${formatFolderCount(maintenance.watchedRoots.length)} for automatic sync.`;
  }

  return 'Automatic sync is not watching folders right now.';
}

function formatQueuedFollowUp(maintenance: LibraryMaintenanceState): SettingsLibraryScanCallout | null {
  if (!maintenance.queuedFollowUp) {
    return null;
  }

  if (maintenance.dirtyRoots.length > 0) {
    return {
      title: 'Queued follow-up',
      description: `${formatFolderCount(maintenance.dirtyRoots.length, 'watched folder')} changed during this scan. The follow-up pass will start automatically.`,
    };
  }

  return {
    title: 'Queued follow-up',
    description: 'A follow-up pass is already queued and will start automatically when the current maintenance state clears.',
  };
}

function formatActionGuide(
  maintenance: LibraryMaintenanceState,
): SettingsLibraryScanActionGuide | null {
  switch (maintenance.nextStep?.kind) {
    case 'cancel-scan':
      return {
        title: 'Maintenance control',
        buttonLabel: 'Cancel Scan',
        description: 'Use Cancel Scan only if you need to stop the current maintenance pass.',
      };
    case 'rescan':
      return {
        title: 'Recommended next step',
        buttonLabel: 'Rescan Now',
        description: maintenance.watcherStatus.last_error
          ? 'After fixing the watcher problem or folder access, use Rescan Now to confirm the library state.'
          : maintenance.scanStatus.phase === 'failed'
            ? 'After fixing the failing path or metadata issue, use Rescan Now to retry the shared maintenance flow.'
            : maintenance.scanStatus.phase === 'cancelled'
              ? 'Use Rescan Now to restart the shared maintenance flow when you are ready.'
              : 'Use Rescan Now to run the shared maintenance flow again.',
      };
    case 'full-scan':
      return {
        title: 'Recommended next step',
        buttonLabel: 'Full Scan',
        description: 'Use Full Scan when you need to rebuild the library state from disk.',
      };
    case 'review-folders':
      return {
        title: 'Recommended next step',
        buttonLabel: 'Add Folder',
        description: 'Use Add Folder to restore the watched library paths, then run Rescan Now.',
      };
    case 'wait':
      return {
        title: 'Maintenance status',
        buttonLabel: 'Cancel Scan',
        description: 'Wait for cancellation to finish before starting another maintenance pass.',
      };
    default:
      return null;
  }
}

function formatWatcherError(maintenance: LibraryMaintenanceState): SettingsLibraryScanCallout | null {
  const watcherError = maintenance.watcherStatus.last_error?.trim();
  if (!watcherError) {
    return null;
  }

  return {
    title: 'Latest watcher error',
    description: watcherError,
  };
}

function formatSampleError(maintenance: LibraryMaintenanceState): SettingsLibraryScanCallout | null {
  const sample = maintenance.scanStatus.sample_errors[0];
  if (!sample) {
    return maintenance.scanStatus.error_count > 0
      ? {
          title: 'Latest scan error',
          description: `${maintenance.scanStatus.error_count} scan error${maintenance.scanStatus.error_count === 1 ? '' : 's'} recorded during the last run.`,
        }
      : null;
  }

  const path = sample.path?.trim();
  const prefix = path ? `${path} — ` : '';

  return {
    title: 'Latest scan error',
    description: `${prefix}${sample.message}`,
  };
}

export function buildSettingsLibraryScanPresentation(
  maintenance: LibraryMaintenanceState,
): SettingsLibraryScanPresentation {
  return {
    title: maintenance.title,
    description: maintenance.description,
    statusTone: mapTone(maintenance.tone),
    currentPathLabel: maintenance.scanStatus.current_path ? 'Current path' : null,
    currentPath: maintenance.scanStatus.current_path ?? null,
    autoSyncSummary: formatAutoSyncSummary(maintenance),
    watchedRoots: [...maintenance.watchedRoots],
    dirtyRoots: [...maintenance.dirtyRoots],
    metrics: [
      formatMetric('Files checked', maintenance.scanStatus.processed_files),
      formatMetric('Added', maintenance.scanStatus.inserted_tracks, { success: true }),
      formatMetric('Changed', maintenance.scanStatus.changed_tracks, { success: true }),
      formatMetric('Unchanged', maintenance.scanStatus.unchanged_files),
      formatMetric('Restored', maintenance.scanStatus.restored_tracks, { success: true }),
      formatMetric('Missing', maintenance.scanStatus.missing_tracks, { warning: true }),
      formatMetric('Errors', maintenance.scanStatus.error_count, { danger: true }),
    ],
    queuedFollowUp: formatQueuedFollowUp(maintenance),
    recoveryHint: maintenance.recoveryHint,
    actionGuide: formatActionGuide(maintenance),
    watcherError: formatWatcherError(maintenance),
    sampleError: formatSampleError(maintenance),
  };
}
