import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

const { getVersionMock } = vi.hoisted(() => ({ getVersionMock: vi.fn() }));

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: getVersionMock,
}));

const { showWindowMock, getCurrentWindowMock } = vi.hoisted(() => {
  const showWindowMock = vi.fn();
  return {
    showWindowMock,
    getCurrentWindowMock: vi.fn(() => ({ show: showWindowMock })),
  };
});

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: getCurrentWindowMock,
}));

import {
  bootstrapDesktopShell,
  getAppVersion,
  getLibraryPaths,
  greet,
  pickAndAddLibraryFolder,
  removeLibraryPath,
  setLastSession,
} from '../lib/api/tauri/config';

describe('tauri config bridge', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    getVersionMock.mockReset();
    getCurrentWindowMock.mockClear();
    showWindowMock.mockReset();
  });

  it('invokes set_last_session with expected camelCase payload keys', async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await setLastSession('track-7', 88);
    expect(invokeMock).toHaveBeenCalledWith('set_last_session', {
      lastTrackId: 'track-7',
      lastPositionSeconds: 88,
    });
  });

  it('returns empty library paths when backend payload is missing', async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await expect(getLibraryPaths()).resolves.toEqual([]);
    expect(invokeMock).toHaveBeenCalledWith('get_library_paths');
  });

  it('invokes library path mutation commands with preserved keys', async () => {
    invokeMock.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);

    await pickAndAddLibraryFolder();
    await removeLibraryPath('/music/jazz');

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'pick_and_add_library_folder');
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'remove_library_path', { path: '/music/jazz' });
  });

  it('invokes greet through the bridge', async () => {
    invokeMock.mockResolvedValueOnce('hello');

    await expect(greet('from svelte')).resolves.toBe('hello');
    expect(invokeMock).toHaveBeenCalledWith('greet', { name: 'from svelte' });
  });

  it('returns app version via tauri app API bridge', async () => {
    getVersionMock.mockResolvedValueOnce('2.0.1');

    await expect(getAppVersion()).resolves.toBe('2.0.1');
    expect(getVersionMock).toHaveBeenCalledTimes(1);
  });

  it('bootstraps desktop shell by greeting and showing the window', async () => {
    invokeMock.mockResolvedValueOnce('hello');
    showWindowMock.mockResolvedValueOnce(undefined);

    await expect(bootstrapDesktopShell()).resolves.toBeUndefined();
    expect(invokeMock).toHaveBeenCalledWith('greet', { name: 'from svelte' });
    expect(getCurrentWindowMock).toHaveBeenCalledTimes(1);
    expect(showWindowMock).toHaveBeenCalledTimes(1);
  });
});
