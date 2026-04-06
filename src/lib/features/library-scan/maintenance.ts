import {
  createLibraryWatcherStatus,
  createScanStatus,
  type LibraryWatcherStatus,
  type ScanMode,
  type ScanPhase,
  type ScanStatus,
} from '../../types';
import { formatFolderCount, maintenanceCopy } from '../../locales/zh-cn';

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
  if (mode === 'incremental') return maintenanceCopy.scanLabels.incremental;
  if (mode === 'full') return maintenanceCopy.scanLabels.full;
  return maintenanceCopy.scanLabels.generic;
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
      title: `${scanLabel}中`,
      description: queuedFollowUp
        ? '正在扫描，稍后会继续处理新变更。'
        : watchedRoots.length > 0
          ? `正在扫描，已监听${formatFolderCount(watchedRoots.length)}。`
          : '正在扫描音乐库。',
      tone: 'active',
      recoveryHint: queuedFollowUp
        ? '当前扫描结束后会自动继续。'
        : null,
      nextStep: {
        kind: 'cancel-scan',
        label: maintenanceCopy.nextStepLabels.cancelScan,
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
      title: scanStatus.mode ? `正在取消${scanLabel}` : '正在取消扫描',
      description: queuedFollowUp
        ? '正在取消，稍后会继续处理新变更。'
        : '正在取消扫描。',
      tone: 'active',
      recoveryHint: queuedFollowUp
        ? '当前扫描结束后会自动继续。'
        : '请等待取消完成。',
      nextStep: {
        kind: 'wait',
        label: maintenanceCopy.nextStepLabels.wait,
      },
    };
  }

  if (watcherStatus.last_error) {
    const watchingDescription = watchedRoots.length
      ? `已监听 ${formatFolderCount(watchedRoots.length)}，但自动扫描暂时不可用。`
      : '还没有添加文件夹。';

    return {
      scanStatus,
      watcherStatus,
      watchedRoots,
      dirtyRoots,
      queuedFollowUp,
      activePhase,
      lastError,
      title: watchedRoots.length > 0
        ? maintenanceCopy.autoSyncNeedsAttention
        : maintenanceCopy.autoSyncNotWatching,
      description: watchingDescription,
      tone: watchedRoots.length > 0 ? 'warning' : 'danger',
      recoveryHint: watchedRoots.length > 0
        ? '修复文件夹访问问题后，再点“立即重扫”。'
        : '请先添加文件夹。',
      nextStep: {
        kind: watchedRoots.length > 0 ? 'rescan' : 'review-folders',
        label: watchedRoots.length > 0
          ? maintenanceCopy.nextStepLabels.rescan
          : maintenanceCopy.nextStepLabels.reviewFolders,
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
      title: scanStatus.mode ? `${scanLabel}失败` : '扫描失败',
      description: `上一次${scanLabel}未能完成。`,
      tone: 'danger',
      recoveryHint: '处理出错文件后，可重新扫描。',
      nextStep: {
        kind: 'rescan',
        label: maintenanceCopy.nextStepLabels.rescan,
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
      title: maintenanceCopy.autoSyncFollowUpQueued,
      description: '有新的变更待处理。',
      tone: 'warning',
      recoveryHint: '请保持应用开启，等待继续扫描。',
      nextStep: {
        kind: 'rescan',
        label: maintenanceCopy.nextStepLabels.rescan,
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
      title: `${scanLabel}已完成`,
      description: watchedRoots.length > 0
        ? `已监听 ${formatFolderCount(watchedRoots.length)}。${completedWithIssues ? '上次扫描有部分问题。' : '上次扫描已完成。'}`
        : completedWithIssues ? '上次扫描有部分问题。' : '上次扫描已完成。',
      tone: completedWithIssues ? 'warning' : 'success',
      recoveryHint: completedWithIssues
        ? '请先查看错误，再重新扫描。'
        : null,
      nextStep: completedWithIssues
        ? {
            kind: 'rescan',
            label: maintenanceCopy.nextStepLabels.rescan,
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
      title: scanStatus.mode ? `${scanLabel}已取消` : '扫描已取消',
      description: '上次扫描已取消。',
      tone: 'warning',
      recoveryHint: '需要时可重新开始扫描。',
      nextStep: {
        kind: 'rescan',
        label: maintenanceCopy.nextStepLabels.rescan,
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
      title: maintenanceCopy.autoSyncReady,
      description: `已监听 ${formatFolderCount(watchedRoots.length)}。`,
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
    title: maintenanceCopy.noScanRunning,
    description: '添加文件夹后即可开始扫描。',
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
