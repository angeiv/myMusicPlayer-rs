import { describe, expect, it } from 'vitest';

import { buildSettingsLibraryScanPresentation } from '../lib/views/settings-library-scan';
import { createScanStatus } from '../lib/types';

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
