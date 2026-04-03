import { describe, expect, it } from 'vitest';

import { buildLibraryMaintenanceState } from '../lib/features/library-scan/maintenance';
import { buildSettingsLibraryScanPresentation } from '../lib/views/settings-library-scan';
import { createLibraryWatcherStatus, createScanStatus } from '../lib/types';

describe('library maintenance state', () => {
  it('summarizes queued watcher follow-up against the active scan with a concrete next step', () => {
    const maintenance = buildLibraryMaintenanceState(
      createScanStatus({
        phase: 'running',
        mode: 'incremental',
        current_path: '/music/live/new-track.flac',
        processed_files: 12,
      }),
      createLibraryWatcherStatus({
        watched_roots: ['/music', '/music/live'],
        dirty_roots: ['/music/live'],
        queued_follow_up: true,
        active_scan_phase: 'running',
      }),
    );

    expect(maintenance).toMatchObject({
      title: 'Incremental sync in progress',
      tone: 'active',
      watchedRoots: ['/music', '/music/live'],
      dirtyRoots: ['/music/live'],
      queuedFollowUp: true,
      activePhase: 'running',
      recoveryHint: 'Let the current scan finish. The queued follow-up will run automatically.',
      nextStep: { kind: 'cancel-scan', label: 'Cancel scan' },
    });
    expect(maintenance.description).toContain('queued one follow-up pass');
  });

  it('keeps watcher failures distinct from missing-track language and recommends a rescan', () => {
    const maintenance = buildLibraryMaintenanceState(
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
        dirty_roots: [],
        queued_follow_up: false,
        active_scan_phase: null,
        last_error: 'Failed to schedule watcher batch: permissions denied',
      }),
    );

    expect(maintenance).toMatchObject({
      title: 'Auto-sync needs attention',
      tone: 'warning',
      watchedRoots: ['/music'],
      lastError: 'Failed to schedule watcher batch: permissions denied',
      nextStep: { kind: 'rescan', label: 'Rescan Now' },
    });
    expect(maintenance.description.toLowerCase()).not.toContain('missing track');
    expect(maintenance.recoveryHint).toBe(
      'Fix the watcher problem or folder access, then run Rescan Now to confirm the library state.',
    );
  });
});

describe('settings library scan presentation', () => {
  it('describes incremental scans with active state copy and richer counter tones', () => {
    const presentation = buildSettingsLibraryScanPresentation(
      createScanStatus({
        phase: 'running',
        mode: 'incremental',
        current_path: '/music/new-track.flac',
        processed_files: 12,
        inserted_tracks: 3,
        changed_tracks: 2,
        unchanged_files: 5,
        restored_tracks: 1,
        missing_tracks: 1,
        error_count: 1,
        sample_errors: [
          {
            path: '/offline-drive',
            message: 'Root path does not exist or is not a directory',
            kind: 'invalid_path',
          },
        ],
      }),
    );

    expect(presentation.title).toBe('Incremental sync in progress');
    expect(presentation.description).toBe(
      'Default rescans compare your selected folders against the library and only apply changes.',
    );
    expect(presentation.statusTone).toBe('active');
    expect(presentation.currentPathLabel).toBe('Current path');
    expect(presentation.currentPath).toBe('/music/new-track.flac');
    expect(presentation.metrics).toEqual([
      { label: 'Files checked', value: '12' },
      { label: 'Added', value: '3', tone: 'success' },
      { label: 'Changed', value: '2', tone: 'success' },
      { label: 'Unchanged', value: '5' },
      { label: 'Restored', value: '1', tone: 'success' },
      { label: 'Missing', value: '1', tone: 'warning' },
      { label: 'Errors', value: '1', tone: 'danger' },
    ]);
    expect(presentation.sampleError).toEqual({
      title: 'Latest scan error',
      description: '/offline-drive — Root path does not exist or is not a directory',
    });
  });

  it('keeps unavailable roots phrased as scan errors and marks issue-bearing completions as warnings', () => {
    const presentation = buildSettingsLibraryScanPresentation(
      createScanStatus({
        phase: 'completed',
        mode: 'full',
        processed_files: 42,
        inserted_tracks: 10,
        changed_tracks: 0,
        unchanged_files: 25,
        restored_tracks: 0,
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
    );

    expect(presentation.title).toBe('Full scan complete');
    expect(presentation.description).toBe(
      'Full scans re-read every selected folder and rebuild the library state from disk.',
    );
    expect(presentation.statusTone).toBe('warning');
    expect(presentation.sampleError?.title).toBe('Latest scan error');
    expect(presentation.sampleError?.description).toContain('/detached-disk');
    expect(presentation.sampleError?.description.toLowerCase()).not.toContain('missing track');
  });

  it('marks clean completed scans as success state for maintenance surfaces', () => {
    const presentation = buildSettingsLibraryScanPresentation(
      createScanStatus({
        phase: 'completed',
        mode: 'incremental',
        processed_files: 24,
        inserted_tracks: 1,
        changed_tracks: 0,
        unchanged_files: 23,
        restored_tracks: 0,
        missing_tracks: 0,
        error_count: 0,
      }),
    );

    expect(presentation.statusTone).toBe('success');
    expect(presentation.sampleError).toBeNull();
  });
});
