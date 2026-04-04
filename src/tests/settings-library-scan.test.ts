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
      title: 'Auto-sync ready',
      statusTone: 'default',
      watchedRoots: ['/music'],
      autoSyncSummary: 'Watching 1 folder for automatic sync.',
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

    expect(presentation.title).toBe('Incremental sync in progress');
    expect(presentation.statusTone).toBe('active');
    expect(presentation.currentPathLabel).toBe('Current path');
    expect(presentation.currentPath).toBe('/music/live/new-track.flac');
    expect(presentation.watchedRoots).toEqual(['/music', '/music/live']);
    expect(presentation.autoSyncSummary).toBe('Watching 2 folders for automatic sync.');
    expect(presentation.queuedFollowUp).toEqual({
      title: 'Queued follow-up',
      description:
        '1 watched folder changed during this scan. The follow-up pass will start automatically.',
    });
    expect(presentation.recoveryHint).toBe(
      'Let the current scan finish. The queued follow-up will run automatically.',
    );
    expect(presentation.actionGuide).toEqual({
      title: 'Maintenance control',
      buttonLabel: 'Cancel Scan',
      description: 'Use Cancel Scan only if you need to stop the current maintenance pass.',
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

    expect(presentation.title).toBe('Auto-sync needs attention');
    expect(presentation.statusTone).toBe('warning');
    expect(presentation.autoSyncSummary).toBe('Watching 1 folder for automatic sync.');
    expect(presentation.watcherError).toEqual({
      title: 'Latest watcher error',
      description: 'Failed to refresh watcher roots: permission denied',
    });
    expect(presentation.sampleError).toEqual({
      title: 'Latest scan error',
      description: '/detached-disk — Root path does not exist or is not a directory',
    });
    expect(presentation.actionGuide).toEqual({
      title: 'Recommended next step',
      buttonLabel: 'Rescan Now',
      description:
        'After fixing the watcher problem or folder access, use Rescan Now to confirm the library state.',
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
      title: 'Incremental sync complete',
      statusTone: 'success',
      watchedRoots: ['/music'],
      autoSyncSummary: 'Watching 1 folder for automatic sync.',
      recoveryHint: null,
      watcherError: null,
      sampleError: null,
      actionGuide: null,
    });
    expect(presentation.description.toLowerCase()).not.toContain('needs attention');
  });
});
