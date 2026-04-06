import {
  createLibraryWatcherStatus,
  createScanStatus,
  type LibraryWatcherStatus,
  type ScanMode,
  type ScanPhase,
  type ScanStatus,
} from '../../types';
import { formatFolderCount, maintenanceCopy } from '../../copy/zh-cn';

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
      title: `${scanLabel}进行中`,
      description: queuedFollowUp
        ? '当前正在扫描音乐库。自动同步已经为较新的文件变更排队了一次后续扫描。'
        : watchedRoots.length > 0
          ? `当前正在扫描音乐库，并监听${formatFolderCount(watchedRoots.length)}中的后续变更。`
          : '当前正在通过统一维护流程扫描音乐库。',
      tone: 'active',
      recoveryHint: queuedFollowUp
        ? '请等待当前扫描结束，后续扫描会自动运行。'
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
        ? '正在取消当前扫描。自动同步已经为较新的文件变更排队了一次后续扫描。'
        : '正在取消当前维护流程。',
      tone: 'active',
      recoveryHint: queuedFollowUp
        ? '请等待当前扫描结束，后续扫描会自动运行。'
        : '请等待取消完成，再开始下一次维护流程。',
      nextStep: {
        kind: 'wait',
        label: maintenanceCopy.nextStepLabels.wait,
      },
    };
  }

  if (watcherStatus.last_error) {
    const watchingDescription = watchedRoots.length
      ? `正在监听 ${formatFolderCount(watchedRoots.length)}，但最近一次监听更新失败，后续同步尚未启动。`
      : '当前没有监听任何文件夹，磁盘上的变更不会自动同步。';

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
        ? '修复监听器问题或文件夹访问后，使用“立即重扫”确认音乐库状态。'
        : '检查音乐库文件夹后，使用“立即重扫”重建维护基线。',
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
      recoveryHint: '修复出错路径或元数据问题后，执行“立即重扫”或“完整扫描”。',
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
      description: '后续维护流程已经排队，会在当前扫描状态清空后立即开始。',
      tone: 'warning',
      recoveryHint: '请保持应用开启，等待后续扫描自动开始；如果需要手动重试，也可以执行“立即重扫”。',
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
        ? `正在监听 ${formatFolderCount(watchedRoots.length)} 变更。上一次维护${completedWithIssues ? '有异常结束。' : '已正常完成。'}`
        : `上一次维护${completedWithIssues ? '有异常结束。' : '已正常完成。'}`,
      tone: completedWithIssues ? 'warning' : 'success',
      recoveryHint: completedWithIssues
        ? '请先查看最近一次扫描错误，再进行下一次重扫。'
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
      description: '上一次维护在完成前已被取消。',
      tone: 'warning',
      recoveryHint: '准备好后，可执行“立即重扫”重新开始维护。',
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
      description: `正在监听 ${formatFolderCount(watchedRoots.length)} 变更，手动重扫也会沿用同一套维护流程。`,
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
    description: '添加文件夹或执行重扫即可启动统一维护流程。',
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
