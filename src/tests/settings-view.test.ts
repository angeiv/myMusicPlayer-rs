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

    await screen.findByLabelText('移除文件夹 /music');

    expect(screen.getAllByText('增量同步中').length).toBeGreaterThan(0);
    expect(screen.getByText('已监听 2 个文件夹')).toBeTruthy();
    expect(screen.getByText('待处理更新')).toBeTruthy();
    expect(
      screen.getByText('检测到 1 个文件夹有变化，稍后会继续扫描。'),
    ).toBeTruthy();
    expect(screen.getByText('当前文件')).toBeTruthy();
    expect(screen.getByText('/music/live/new-track.flac')).toBeTruthy();

    const watchedFolders = screen.getByRole('list', { name: '监听中的文件夹' });
    expect(within(watchedFolders).getByText('/music')).toBeTruthy();
    expect(within(watchedFolders).getByText('/music/live')).toBeTruthy();

    const maintenanceStatus = document.querySelector('[data-testid="settings-maintenance-status"]');
    expect(maintenanceStatus?.getAttribute('data-tone')).toBe('active');

    expect(screen.getByText('扫描控制')).toBeTruthy();
    expect(screen.getByText('如需停止当前扫描，可点击“取消扫描”。')).toBeTruthy();

    const rescanButton = screen.getByRole('button', { name: '立即重扫' }) as HTMLButtonElement;
    const fullScanButton = screen.getByRole('button', { name: '完整扫描' }) as HTMLButtonElement;
    const cancelButton = screen.getByRole('button', { name: '取消扫描' }) as HTMLButtonElement;

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

    await screen.findByLabelText('移除文件夹 /music');

    expect(screen.getAllByText('自动扫描异常').length).toBeGreaterThan(0);
    expect(screen.getByText('监听错误')).toBeTruthy();
    expect(screen.getByText('Failed to refresh watcher roots: permission denied')).toBeTruthy();
    expect(screen.getByText('扫描错误')).toBeTruthy();
    expect(
      screen.getByText('/detached-disk — Root path does not exist or is not a directory'),
    ).toBeTruthy();
    expect(screen.getByText('建议操作')).toBeTruthy();
    expect(
      screen.getByText(
        '修复文件夹访问问题后，再点“立即重扫”。',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/missing track/i)).toBeNull();

    const maintenanceStatus = document.querySelector('[data-testid="settings-maintenance-status"]');
    expect(maintenanceStatus?.getAttribute('data-tone')).toBe('warning');

    expect((screen.getByRole('button', { name: '立即重扫' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: '完整扫描' }) as HTMLButtonElement).disabled).toBe(false);
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

    await screen.findByLabelText('移除文件夹 /music');

    expect(screen.getAllByText('自动扫描已开启').length).toBeGreaterThan(0);
    expect(screen.getByText('已监听 1 个文件夹')).toBeTruthy();
    expect(screen.getByRole('list', { name: '监听中的文件夹' })).toBeTruthy();
    expect(screen.queryByText('待处理更新')).toBeNull();
    expect(screen.queryByText('监听错误')).toBeNull();
    expect(screen.queryByText('扫描错误')).toBeNull();
    expect(screen.queryByText('建议操作')).toBeNull();
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

    await screen.findByLabelText('移除文件夹 /music');

    expect(screen.getAllByText('增量同步已完成').length).toBeGreaterThan(0);
    expect(screen.getByText('已监听 1 个文件夹')).toBeTruthy();
    expect(document.querySelector('[data-testid="settings-maintenance-status"]')?.getAttribute('data-tone')).toBe(
      'success',
    );
    expect(screen.queryByText('监听错误')).toBeNull();
    expect(screen.queryByText('扫描错误')).toBeNull();
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

    await screen.findByLabelText('移除文件夹 /music');

    expect(
      screen.getByText(
        '管理扫描和文件夹',
      ),
    ).toBeTruthy();
    expect(screen.getByText('监听错误')).toBeTruthy();
    expect(screen.getByText('扫描错误')).toBeTruthy();
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

    await screen.findByLabelText('移除文件夹 /music');

    await fireEvent.click(screen.getByRole('button', { name: '立即重扫' }));
    await fireEvent.click(screen.getByRole('button', { name: '完整扫描' }));

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

    await screen.findByLabelText('移除文件夹 /music');
    await fireEvent.click(screen.getByRole('button', { name: '取消扫描' }));

    expect(cancelLibraryScan).toHaveBeenCalledTimes(1);
  });
});
