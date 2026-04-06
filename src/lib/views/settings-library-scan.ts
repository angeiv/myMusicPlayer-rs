import type {
  LibraryMaintenanceState,
  LibraryMaintenanceTone,
} from '../features/library-scan/maintenance';
import { maintenanceCopy, settingsCopy } from '../locales/zh-cn';

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
    return maintenanceCopy.autoSyncSummary(maintenance.watchedRoots.length);
  }

  return maintenanceCopy.autoSyncDisabled;
}

function formatQueuedFollowUp(maintenance: LibraryMaintenanceState): SettingsLibraryScanCallout | null {
  if (!maintenance.queuedFollowUp) {
    return null;
  }

  if (maintenance.dirtyRoots.length > 0) {
    return {
      title: maintenanceCopy.queuedFollowUpTitle,
      description: maintenanceCopy.queuedFollowUpChanged(maintenance.dirtyRoots.length),
    };
  }

  return {
    title: maintenanceCopy.queuedFollowUpTitle,
    description: maintenanceCopy.queuedFollowUpReady,
  };
}

function formatActionGuide(
  maintenance: LibraryMaintenanceState,
): SettingsLibraryScanActionGuide | null {
  switch (maintenance.nextStep?.kind) {
    case 'cancel-scan':
      return {
        title: maintenanceCopy.maintenanceControlTitle,
        buttonLabel: settingsCopy.cancelScan,
        description: maintenanceCopy.maintenanceControlDescription,
      };
    case 'rescan':
      return {
        title: maintenanceCopy.recommendedNextStep,
        buttonLabel: settingsCopy.rescanNow,
        description: maintenance.watcherStatus.last_error
          ? maintenanceCopy.rescanDescriptionForWatcher
          : maintenance.scanStatus.phase === 'failed'
            ? maintenanceCopy.rescanDescriptionForFailure
            : maintenance.scanStatus.phase === 'cancelled'
              ? maintenanceCopy.rescanDescriptionForCancelled
              : maintenanceCopy.rescanDescriptionDefault,
      };
    case 'full-scan':
      return {
        title: maintenanceCopy.recommendedNextStep,
        buttonLabel: settingsCopy.fullScan,
        description: maintenanceCopy.fullScanDescription,
      };
    case 'review-folders':
      return {
        title: maintenanceCopy.recommendedNextStep,
        buttonLabel: settingsCopy.addFolder,
        description: maintenanceCopy.reviewFoldersDescription,
      };
    case 'wait':
      return {
        title: maintenanceCopy.maintenanceControlTitle,
        buttonLabel: settingsCopy.cancelScan,
        description: maintenanceCopy.waitDescription,
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
    title: maintenanceCopy.latestWatcherError,
    description: watcherError,
  };
}

function formatSampleError(maintenance: LibraryMaintenanceState): SettingsLibraryScanCallout | null {
  const sample = maintenance.scanStatus.sample_errors[0];
  if (!sample) {
    return maintenance.scanStatus.error_count > 0
      ? {
          title: maintenanceCopy.latestScanError,
          description: maintenanceCopy.latestScanErrorCount(maintenance.scanStatus.error_count),
        }
      : null;
  }

  const path = sample.path?.trim();
  const prefix = path ? `${path} — ` : '';

  return {
    title: maintenanceCopy.latestScanError,
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
    currentPathLabel: maintenance.scanStatus.current_path ? maintenanceCopy.currentPath : null,
    currentPath: maintenance.scanStatus.current_path ?? null,
    autoSyncSummary: formatAutoSyncSummary(maintenance),
    watchedRoots: [...maintenance.watchedRoots],
    dirtyRoots: [...maintenance.dirtyRoots],
    metrics: [
      formatMetric(maintenanceCopy.filesChecked, maintenance.scanStatus.processed_files),
      formatMetric(maintenanceCopy.added, maintenance.scanStatus.inserted_tracks, { success: true }),
      formatMetric(maintenanceCopy.changed, maintenance.scanStatus.changed_tracks, { success: true }),
      formatMetric(maintenanceCopy.unchanged, maintenance.scanStatus.unchanged_files),
      formatMetric(maintenanceCopy.restored, maintenance.scanStatus.restored_tracks, { success: true }),
      formatMetric(maintenanceCopy.missing, maintenance.scanStatus.missing_tracks, { warning: true }),
      formatMetric(maintenanceCopy.errors, maintenance.scanStatus.error_count, { danger: true }),
    ],
    queuedFollowUp: formatQueuedFollowUp(maintenance),
    recoveryHint: maintenance.recoveryHint,
    actionGuide: formatActionGuide(maintenance),
    watcherError: formatWatcherError(maintenance),
    sampleError: formatSampleError(maintenance),
  };
}
