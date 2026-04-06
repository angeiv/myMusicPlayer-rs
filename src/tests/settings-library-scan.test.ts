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
      title: '自动扫描已开启',
      statusTone: 'default',
      watchedRoots: ['/music'],
      autoSyncSummary: '已监听 1 个文件夹',
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

    expect(presentation.title).toBe('增量同步中');
    expect(presentation.statusTone).toBe('active');
    expect(presentation.currentPathLabel).toBe('当前文件');
    expect(presentation.currentPath).toBe('/music/live/new-track.flac');
    expect(presentation.watchedRoots).toEqual(['/music', '/music/live']);
    expect(presentation.autoSyncSummary).toBe('已监听 2 个文件夹');
    expect(presentation.queuedFollowUp).toEqual({
      title: '待处理更新',
      description: '检测到 1 个文件夹有变化，稍后会继续扫描。',
    });
    expect(presentation.recoveryHint).toBe(
      '当前扫描结束后会自动继续。',
    );
    expect(presentation.actionGuide).toEqual({
      title: '扫描控制',
      buttonLabel: '取消扫描',
      description: '如需停止当前扫描，可点击“取消扫描”。',
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

    expect(presentation.title).toBe('自动扫描异常');
    expect(presentation.statusTone).toBe('warning');
    expect(presentation.autoSyncSummary).toBe('已监听 1 个文件夹');
    expect(presentation.watcherError).toEqual({
      title: '监听错误',
      description: 'Failed to refresh watcher roots: permission denied',
    });
    expect(presentation.sampleError).toEqual({
      title: '扫描错误',
      description: '/detached-disk — Root path does not exist or is not a directory',
    });
    expect(presentation.actionGuide).toEqual({
      title: '建议操作',
      buttonLabel: '立即重扫',
      description:
        '修复文件夹访问问题后，再点“立即重扫”。',
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
      autoSyncSummary: '已监听 1 个文件夹',
      recoveryHint: null,
      watcherError: null,
      sampleError: null,
      actionGuide: null,
    });
    expect(presentation.description.toLowerCase()).not.toContain('needs attention');
  });
});
