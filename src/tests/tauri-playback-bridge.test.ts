import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

import {
  getPlaybackState,
  getQueue,
  seekTo,
  setOutputDevice,
  setPlayModeFromUi,
} from '../lib/api/tauri/playback';

describe('tauri playback bridge', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('invokes set_output_device with camelCase payload key', async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await setOutputDevice('speaker-1');
    expect(invokeMock).toHaveBeenCalledWith('set_output_device', { deviceId: 'speaker-1' });
  });

  it('maps UI play mode state to backend mode values', async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await setPlayModeFromUi(true, 'all');
    expect(invokeMock).toHaveBeenCalledWith('set_play_mode', { mode: 'random' });
  });

  it('normalizes playback state payloads from the backend', async () => {
    invokeMock.mockResolvedValueOnce({ Paused: { position: '5', duration: '9' } });

    await expect(getPlaybackState()).resolves.toEqual({ state: 'paused', position: 5, duration: 9 });
    expect(invokeMock).toHaveBeenCalledWith('get_playback_state');
  });

  it('preserves seek payload key and queue fallback behavior', async () => {
    invokeMock.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);

    await seekTo(120);
    await expect(getQueue()).resolves.toEqual([]);

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'seek', { position: 120 });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'get_queue');
  });
});
