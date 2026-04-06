import { describe, expect, it } from 'vitest';

import { buildLibraryMaintenanceState } from '../lib/features/library-scan/maintenance';
import { buildSettingsLibraryScanPresentation } from '../lib/views/settings-library-scan';
import { createLibraryWatcherStatus, createScanStatus } from '../lib/types';

describe('settings library scan presentation', () => {
  it('describes idle auto-sync state with the watched roots in view', () => {
    const presentation = buildSettingsLibraryScanPresentation(
      buildLibraryMaintenanceState(
        createScanStatus({
          phase: 'idle',
          mode: 'incremental',
        }),
        createLibraryWatcherStatus({
          watched_roots: ['/music'],
        }),
      ),
    );

    expect(presentation).toMatchObject({
      title: '自动同步已就绪',
      statusTone: 'default',
      watchedRoots: ['/music'],
      autoSyncSummary: '正在监听 1 个文件夹，自动同步已开启。',
      queuedFollowUp: null,
      recoveryHint: null,
      watcherError: null,
      sampleError: null,
      actionGuide: null,
    });
  });

  it('surfaces queued follow-up work and points active maintenance back to Cancel Scan', () => {
    const presentation = buildSettingsLibraryScanPresentation(
      buildLibraryMaintenanceState(
        createScanStatus({
          phase: 'running',
          mode: 'incremental',
          current_path: '/music/live/new-track.flac',
          processed_files: 12,
          inserted_tracks: 3,
          changed_tracks: 2,
        }),
        createLibraryWatcherStatus({
          watched_roots: ['/music', '/music/live'],
          dirty_roots: ['/music/live'],
          queued_follow_up: true,
          active_scan_phase: 'running',
        }),
      ),
    );

    expect(presentation.title).toBe('增量同步进行中');
    expect(presentation.statusTone).toBe('active');
    expect(presentation.currentPathLabel).toBe('当前路径');
    expect(presentation.currentPath).toBe('/music/live/new-track.flac');
    expect(presentation.watchedRoots).toEqual(['/music', '/music/live']);
    expect(presentation.autoSyncSummary).toBe('正在监听 2 个文件夹，自动同步已开启。');
    expect(presentation.queuedFollowUp).toEqual({
      title: '已排队的后续任务',
      description: '本次扫描期间有 1 个监听文件夹发生变化，后续扫描会自动开始。',
    });
    expect(presentation.recoveryHint).toBe(
      '请等待当前扫描结束，后续扫描会自动运行。',
    );
    expect(presentation.actionGuide).toEqual({
      title: '维护控制',
      buttonLabel: '取消扫描',
      description: '只有在确实需要停止当前维护流程时才使用“取消扫描”。',
    });
  });

  it('keeps watcher failures distinct from scan sample errors and ties recovery to Rescan Now', () => {
    const presentation = buildSettingsLibraryScanPresentation(
      buildLibraryMaintenanceState(
        createScanStatus({
          phase: 'completed',
          mode: 'incremental',
          processed_files: 42,
          missing_tracks: 2,
          error_count: 1,
          sample_errors: [
            {
              path: '/detached-disk',
              message: 'Root path does not exist or is not a directory',
              kind: 'invalid_path',
            },
          ],
        }),
        createLibraryWatcherStatus({
          watched_roots: ['/music'],
          last_error: 'Failed to refresh watcher roots: permission denied',
        }),
      ),
    );

    expect(presentation.title).toBe('自动同步需要处理');
    expect(presentation.statusTone).toBe('warning');
    expect(presentation.autoSyncSummary).toBe('正在监听 1 个文件夹，自动同步已开启。');
    expect(presentation.watcherError).toEqual({
      title: '最近一次监听错误',
      description: 'Failed to refresh watcher roots: permission denied',
    });
    expect(presentation.sampleError).toEqual({
      title: '最近一次扫描错误',
      description: '/detached-disk — Root path does not exist or is not a directory',
    });
    expect(presentation.actionGuide).toEqual({
      title: '建议的下一步',
      buttonLabel: '立即重扫',
      description:
        '修复监听器问题或文件夹访问后，使用“立即重扫”确认音乐库状态。',
    });
    expect(presentation.description.toLowerCase()).not.toContain('missing track');
    expect(presentation.sampleError?.description.toLowerCase()).not.toContain('missing track');
  });

  it('describes clean completion as recovered auto-sync instead of leaving failure copy behind', () => {
    const presentation = buildSettingsLibraryScanPresentation(
      buildLibraryMaintenanceState(
        createScanStatus({
          phase: 'completed',
          mode: 'incremental',
          processed_files: 24,
          inserted_tracks: 1,
          unchanged_files: 23,
          error_count: 0,
          missing_tracks: 0,
        }),
        createLibraryWatcherStatus({
          watched_roots: ['/music'],
        }),
      ),
    );

    expect(presentation).toMatchObject({
      title: '增量同步已完成',
      statusTone: 'success',
      watchedRoots: ['/music'],
      autoSyncSummary: '正在监听 1 个文件夹，自动同步已开启。',
      recoveryHint: null,
      watcherError: null,
      sampleError: null,
      actionGuide: null,
    });
    expect(presentation.description.toLowerCase()).not.toContain('needs attention');
  });
});
