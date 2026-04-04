// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildLibraryMaintenanceState } from '../lib/features/library-scan/maintenance';
import {
  createLibraryWatcherStatus,
  createScanStatus,
  type LibraryWatcherStatus,
  type ScanStatus,
} from '../lib/types';

const configApiMock = vi.hoisted(() => ({
  getAppVersion: vi.fn(),
  getConfig: vi.fn(),
  getLibraryPaths: vi.fn(),
  pickAndAddLibraryFolder: vi.fn(),
  removeLibraryPath: vi.fn(),
  saveConfig: vi.fn(),
}));

const playbackApiMock = vi.hoisted(() => ({
  getOutputDevices: vi.fn(),
  getOutputDevice: vi.fn(),
  setOutputDevice: vi.fn(),
  setVolume: vi.fn(),
}));

const themeMock = vi.hoisted(() => ({
  applyThemeToDocument: vi.fn(),
}));

vi.mock('../lib/api/config', () => ({
  getAppVersion: configApiMock.getAppVersion,
  getConfig: configApiMock.getConfig,
  getLibraryPaths: configApiMock.getLibraryPaths,
  pickAndAddLibraryFolder: configApiMock.pickAndAddLibraryFolder,
  removeLibraryPath: configApiMock.removeLibraryPath,
  saveConfig: configApiMock.saveConfig,
}));

vi.mock('../lib/api/playback', () => ({
  getOutputDevices: playbackApiMock.getOutputDevices,
  getOutputDevice: playbackApiMock.getOutputDevice,
  setOutputDevice: playbackApiMock.setOutputDevice,
  setVolume: playbackApiMock.setVolume,
}));

vi.mock('../lib/features/app-shell/theme', () => ({
  applyThemeToDocument: themeMock.applyThemeToDocument,
}));

import SettingsView from '../lib/views/SettingsView.svelte';

function createStatus(overrides: Partial<ScanStatus> = {}): ScanStatus {
  return createScanStatus(overrides);
}

function createWatcherStatus(overrides: Partial<LibraryWatcherStatus> = {}): LibraryWatcherStatus {
  return createLibraryWatcherStatus(overrides);
}

function createMaintenance(options: {
  status?: ScanStatus;
  watcherStatus?: LibraryWatcherStatus;
} = {}) {
  return buildLibraryMaintenanceState(
    options.status ?? createStatus({ phase: 'idle', mode: 'incremental' }),
    options.watcherStatus ?? createWatcherStatus({ watched_roots: ['/music'] }),
  );
}

function renderSettingsView(options: {
  status?: ScanStatus;
  watcherStatus?: LibraryWatcherStatus;
  runLibraryScan?: (paths: string[]) => Promise<ScanStatus>;
  runFullLibraryScan?: (paths: string[]) => Promise<ScanStatus>;
  cancelLibraryScan?: () => Promise<void>;
  refreshLibrary?: () => void;
} = {}) {
  const refreshLibrary = options.refreshLibrary ?? vi.fn();

  render(SettingsView, {
    props: {
      maintenance: writable(
        createMaintenance({
          ...(options.status ? { status: options.status } : {}),
          ...(options.watcherStatus ? { watcherStatus: options.watcherStatus } : {}),
        }),
      ),
      runLibraryScan: options.runLibraryScan ?? vi.fn(async () => createStatus()),
      runFullLibraryScan: options.runFullLibraryScan ?? vi.fn(async () => createStatus()),
      cancelLibraryScan: options.cancelLibraryScan ?? vi.fn(async () => undefined),
    },
    events: {
      refreshLibrary,
      refreshPlaylists: vi.fn(),
    },
  });

  return { refreshLibrary };
}

describe('SettingsView maintenance panel', () => {
  beforeEach(() => {
    configApiMock.getAppVersion.mockReset().mockResolvedValue('0.1.0');
    configApiMock.getConfig.mockReset().mockResolvedValue({
      theme: 'system',
      auto_scan: true,
      default_volume: 0.7,
      output_device_id: null,
    });
    configApiMock.getLibraryPaths.mockReset().mockResolvedValue(['/music']);
    configApiMock.pickAndAddLibraryFolder.mockReset().mockResolvedValue(undefined);
    configApiMock.removeLibraryPath.mockReset().mockResolvedValue(undefined);
    configApiMock.saveConfig.mockReset().mockResolvedValue(undefined);

    playbackApiMock.getOutputDevices.mockReset().mockResolvedValue([]);
    playbackApiMock.getOutputDevice.mockReset().mockResolvedValue(null);
    playbackApiMock.setOutputDevice.mockReset().mockResolvedValue(undefined);
    playbackApiMock.setVolume.mockReset().mockResolvedValue(undefined);

    themeMock.applyThemeToDocument.mockReset();

    vi.stubGlobal('alert', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders watched roots, queued follow-up, and cancel guidance while maintenance is active', async () => {
    renderSettingsView({
      status: createStatus({
        phase: 'running',
        mode: 'incremental',
        current_path: '/music/live/new-track.flac',
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
      watcherStatus: createWatcherStatus({
        watched_roots: ['/music', '/music/live'],
        dirty_roots: ['/music/live'],
        queued_follow_up: true,
        active_scan_phase: 'running',
      }),
    });

    await screen.findByLabelText('Remove folder /music');

    expect(screen.getAllByText('Incremental sync in progress').length).toBeGreaterThan(0);
    expect(screen.getByText('Watching 2 folders for automatic sync.')).toBeTruthy();
    expect(screen.getByText('Queued follow-up')).toBeTruthy();
    expect(
      screen.getByText('1 watched folder changed during this scan. The follow-up pass will start automatically.'),
    ).toBeTruthy();
    expect(screen.getByText('Current path')).toBeTruthy();
    expect(screen.getByText('/music/live/new-track.flac')).toBeTruthy();

    const watchedFolders = screen.getByRole('list', { name: 'Watched folders' });
    expect(within(watchedFolders).getByText('/music')).toBeTruthy();
    expect(within(watchedFolders).getByText('/music/live')).toBeTruthy();

    const maintenanceStatus = document.querySelector('[data-testid="settings-maintenance-status"]');
    expect(maintenanceStatus?.getAttribute('data-tone')).toBe('active');

    expect(screen.getByText('Maintenance control')).toBeTruthy();
    expect(screen.getByText('Use Cancel Scan only if you need to stop the current maintenance pass.')).toBeTruthy();

    const rescanButton = screen.getByRole('button', { name: /rescan now/i }) as HTMLButtonElement;
    const fullScanButton = screen.getByRole('button', { name: 'Full Scan' }) as HTMLButtonElement;
    const cancelButton = screen.getByRole('button', { name: 'Cancel Scan' }) as HTMLButtonElement;

    expect(rescanButton.disabled).toBe(true);
    expect(fullScanButton.disabled).toBe(true);
    expect(cancelButton.disabled).toBe(false);
  });

  it('shows watcher and scan failures separately and sends recovery back to Rescan Now', async () => {
    renderSettingsView({
      status: createStatus({
        phase: 'completed',
        mode: 'incremental',
        processed_files: 42,
        inserted_tracks: 2,
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
      watcherStatus: createWatcherStatus({
        watched_roots: ['/music'],
        last_error: 'Failed to refresh watcher roots: permission denied',
      }),
    });

    await screen.findByLabelText('Remove folder /music');

    expect(screen.getAllByText('Auto-sync needs attention').length).toBeGreaterThan(0);
    expect(screen.getByText('Latest watcher error')).toBeTruthy();
    expect(screen.getByText('Failed to refresh watcher roots: permission denied')).toBeTruthy();
    expect(screen.getByText('Latest scan error')).toBeTruthy();
    expect(
      screen.getByText('/detached-disk — Root path does not exist or is not a directory'),
    ).toBeTruthy();
    expect(screen.getByText('Recommended next step')).toBeTruthy();
    expect(
      screen.getByText(
        'After fixing the watcher problem or folder access, use Rescan Now to confirm the library state.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/missing track/i)).toBeNull();

    const maintenanceStatus = document.querySelector('[data-testid="settings-maintenance-status"]');
    expect(maintenanceStatus?.getAttribute('data-tone')).toBe('warning');

    expect((screen.getByRole('button', { name: /rescan now/i }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Full Scan' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('renders idle auto-sync state without stale failure callouts', async () => {
    renderSettingsView({
      status: createStatus({
        phase: 'idle',
        mode: 'incremental',
      }),
      watcherStatus: createWatcherStatus({
        watched_roots: ['/music'],
      }),
    });

    await screen.findByLabelText('Remove folder /music');

    expect(screen.getAllByText('Auto-sync ready').length).toBeGreaterThan(0);
    expect(screen.getByText('Watching 1 folder for automatic sync.')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Watched folders' })).toBeTruthy();
    expect(screen.queryByText('Queued follow-up')).toBeNull();
    expect(screen.queryByText('Latest watcher error')).toBeNull();
    expect(screen.queryByText('Latest scan error')).toBeNull();
    expect(screen.queryByText('Recommended next step')).toBeNull();
  });

  it('renders clean completion as recovered maintenance state', async () => {
    renderSettingsView({
      status: createStatus({
        phase: 'completed',
        mode: 'incremental',
        processed_files: 24,
        inserted_tracks: 1,
        unchanged_files: 23,
        error_count: 0,
        missing_tracks: 0,
      }),
      watcherStatus: createWatcherStatus({
        watched_roots: ['/music'],
      }),
    });

    await screen.findByLabelText('Remove folder /music');

    expect(screen.getAllByText('Incremental sync complete').length).toBeGreaterThan(0);
    expect(screen.getByText('Watching 1 folder for automatic sync.')).toBeTruthy();
    expect(document.querySelector('[data-testid="settings-maintenance-status"]')?.getAttribute('data-tone')).toBe(
      'success',
    );
    expect(screen.queryByText('Latest watcher error')).toBeNull();
    expect(screen.queryByText('Latest scan error')).toBeNull();
  });

  it('keeps the detailed watcher diagnostics in Settings and explains that the shell cue stays lightweight', async () => {
    renderSettingsView({
      status: createStatus({
        phase: 'failed',
        mode: 'incremental',
        error_count: 1,
        sample_errors: [
          {
            path: '/music/broken.flac',
            message: 'Unsupported metadata block',
            kind: 'read_metadata',
          },
        ],
      }),
      watcherStatus: createWatcherStatus({
        watched_roots: ['/music'],
        last_error: 'Failed to refresh watcher roots: permission denied',
      }),
    });

    await screen.findByLabelText('Remove folder /music');

    expect(
      screen.getByText(
        'Outside Settings, the shell only shows a lightweight maintenance cue while work is running or needs attention. Detailed watcher state and recovery steps stay here.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Latest watcher error')).toBeTruthy();
    expect(screen.getByText('Latest scan error')).toBeTruthy();
  });

  it('keeps rescan and full-scan actions wired through the settings controls', async () => {
    const runLibraryScan = vi.fn(async () => createStatus({ phase: 'completed', mode: 'incremental' }));
    const runFullLibraryScan = vi.fn(async () => createStatus({ phase: 'completed', mode: 'full' }));
    const refreshLibrary = vi.fn();

    renderSettingsView({
      runLibraryScan,
      runFullLibraryScan,
      refreshLibrary,
    });

    await screen.findByLabelText('Remove folder /music');

    await fireEvent.click(screen.getByRole('button', { name: /rescan now/i }));
    await fireEvent.click(screen.getByRole('button', { name: 'Full Scan' }));

    await waitFor(() => {
      expect(runLibraryScan).toHaveBeenCalledWith(['/music']);
      expect(runFullLibraryScan).toHaveBeenCalledWith(['/music']);
      expect(refreshLibrary).toHaveBeenCalledTimes(2);
    });
  });

  it('keeps Cancel Scan wired while a maintenance pass is active', async () => {
    const cancelLibraryScan = vi.fn(async () => undefined);

    renderSettingsView({
      status: createStatus({
        phase: 'running',
        mode: 'incremental',
      }),
      watcherStatus: createWatcherStatus({
        watched_roots: ['/music'],
        active_scan_phase: 'running',
      }),
      cancelLibraryScan,
    });

    await screen.findByLabelText('Remove folder /music');
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel Scan' }));

    expect(cancelLibraryScan).toHaveBeenCalledTimes(1);
  });
});
