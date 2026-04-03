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

  it('renders mode-aware scan feedback, richer counters, and a visible full scan action', async () => {
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

    expect(screen.getByText('Incremental sync in progress')).toBeTruthy();
    expect(
      screen.getByText(
        'Default rescans compare your selected folders against the library and only apply changes.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('/music/new-track.flac')).toBeTruthy();

    const summary = screen.getByRole('list', { name: 'Scan summary' });
    expect(within(summary).getByText('Files checked')).toBeTruthy();
    expect(within(summary).getByText('Added')).toBeTruthy();
    expect(within(summary).getByText('Changed')).toBeTruthy();
    expect(within(summary).getByText('Unchanged')).toBeTruthy();
    expect(within(summary).getByText('Restored')).toBeTruthy();
    expect(within(summary).getByText('Missing')).toBeTruthy();
    expect(within(summary).getByText('Errors')).toBeTruthy();

    expect(screen.getByText('Latest scan error')).toBeTruthy();
    expect(
      screen.getByText('/offline-drive — Root path does not exist or is not a directory'),
    ).toBeTruthy();
    const fullScanButton = screen.getByRole('button', { name: 'Full Scan' });
    expect(fullScanButton.getAttribute('disabled')).not.toBeNull();
    expect(screen.getByRole('button', { name: /cancel scan/i })).toBeTruthy();
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
});
