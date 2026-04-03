// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createScanStatus, type ScanStatus } from '../lib/types';

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

function renderSettingsView(options: {
  status?: ScanStatus;
  isScanning?: boolean;
  runLibraryScan?: (paths: string[]) => Promise<ScanStatus>;
  runFullLibraryScan?: (paths: string[]) => Promise<ScanStatus>;
  cancelLibraryScan?: () => Promise<void>;
  refreshLibrary?: () => void;
} = {}) {
  const refreshLibrary = options.refreshLibrary ?? vi.fn();

  render(SettingsView, {
    props: {
      scanStatus: writable(options.status ?? createStatus()),
      isScanning: writable(options.isScanning ?? false),
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

describe('SettingsView library scan panel', () => {
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

  it('renders maintenance controls with active, disabled, warning, and danger semantics while scanning', async () => {
    renderSettingsView({
      status: createStatus({
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
      isScanning: true,
    });

    await screen.findByText('/music');

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
    expect(screen.getAllByText('Incremental sync in progress').length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        'Default rescans compare your selected folders against the library and only apply changes.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('/music/new-track.flac')).toBeTruthy();

    const scanStatus = document.querySelector('[data-testid="settings-scan-status"]');
    expect(scanStatus?.getAttribute('data-tone')).toBe('active');

    const summary = screen.getByRole('list', { name: 'Scan summary' });
    expect(within(summary).getByText('Files checked')).toBeTruthy();
    expect(within(summary).getByText('Added').closest('li')?.getAttribute('data-tone')).toBe('success');
    expect(within(summary).getByText('Changed').closest('li')?.getAttribute('data-tone')).toBe('success');
    expect(within(summary).getByText('Restored').closest('li')?.getAttribute('data-tone')).toBe('success');
    expect(within(summary).getByText('Missing').closest('li')?.getAttribute('data-tone')).toBe('warning');
    expect(within(summary).getByText('Errors').closest('li')?.getAttribute('data-tone')).toBe('danger');

    expect(screen.getByText('Latest scan error').closest('[data-tone="danger"]')).not.toBeNull();
    expect(
      screen.getByText('/offline-drive — Root path does not exist or is not a directory'),
    ).toBeTruthy();

    const fullScanButton = screen.getByRole('button', { name: 'Full Scan' });
    expect(fullScanButton.getAttribute('disabled')).not.toBeNull();
    expect(fullScanButton.getAttribute('data-variant')).toBe('secondary');

    const cancelButton = screen.getByRole('button', { name: /cancel scan/i });
    expect(cancelButton.getAttribute('data-variant')).toBe('danger');

    const systemThemeOption = screen.getByText('Follow System').closest('[data-active]');
    expect(systemThemeOption?.getAttribute('data-active')).toBe('true');
  });

  it('keeps refresh and full-scan actions wired through the settings controls', async () => {
    const runLibraryScan = vi.fn(async () => createStatus({ phase: 'completed', mode: 'incremental' }));
    const runFullLibraryScan = vi.fn(async () => createStatus({ phase: 'completed', mode: 'full' }));
    const refreshLibrary = vi.fn();

    renderSettingsView({
      runLibraryScan,
      runFullLibraryScan,
      refreshLibrary,
    });

    await screen.findByText('/music');

    await fireEvent.click(screen.getByRole('button', { name: /rescan now/i }));
    await fireEvent.click(screen.getByRole('button', { name: 'Full Scan' }));

    await waitFor(() => {
      expect(runLibraryScan).toHaveBeenCalledWith(['/music']);
      expect(runFullLibraryScan).toHaveBeenCalledWith(['/music']);
      expect(refreshLibrary).toHaveBeenCalledTimes(2);
    });
  });

  it('keeps cancel scan wired while a scan is active', async () => {
    const cancelLibraryScan = vi.fn(async () => undefined);

    renderSettingsView({
      isScanning: true,
      cancelLibraryScan,
    });

    await screen.findByText('/music');
    await fireEvent.click(screen.getByRole('button', { name: /cancel scan/i }));

    expect(cancelLibraryScan).toHaveBeenCalledTimes(1);
  });

  it('marks clean completed scans as success and preserves disabled maintenance controls', async () => {
    renderSettingsView({
      status: createStatus({
        phase: 'completed',
        mode: 'full',
        processed_files: 24,
        inserted_tracks: 2,
        changed_tracks: 0,
        unchanged_files: 22,
        restored_tracks: 0,
        missing_tracks: 0,
        error_count: 0,
      }),
      isScanning: false,
    });

    await screen.findByText('/music');

    expect(screen.getAllByText('Full scan complete').length).toBeGreaterThan(0);
    expect(document.querySelector('[data-testid="settings-scan-status"]')?.getAttribute('data-tone')).toBe(
      'success',
    );
    expect(
      (screen.getByRole('button', { name: 'Advanced audio settings' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
