import { describe, expect, it } from 'vitest';

import {
  normalizeBackendPlayMode,
  normalizePlaybackState,
  resolveBackendPlayMode,
} from '../lib/transport/playback';

describe('playback transport helpers', () => {
  it('translates backend play modes into UI state', () => {
    expect(normalizeBackendPlayMode('random')).toEqual({ shuffleEnabled: true, repeatMode: 'off' });
    expect(normalizeBackendPlayMode('single_repeat')).toEqual({
      shuffleEnabled: false,
      repeatMode: 'one',
    });
    expect(normalizeBackendPlayMode('list_repeat')).toEqual({
      shuffleEnabled: false,
      repeatMode: 'all',
    });
    expect(normalizeBackendPlayMode('unknown')).toEqual({
      shuffleEnabled: false,
      repeatMode: 'off',
    });
  });

  it('translates UI play modes back to backend commands', () => {
    expect(resolveBackendPlayMode(true, 'off')).toBe('random');
    expect(resolveBackendPlayMode(false, 'one')).toBe('single_repeat');
    expect(resolveBackendPlayMode(false, 'all')).toBe('list_repeat');
    expect(resolveBackendPlayMode(false, 'off')).toBe('sequential');
  });

  it('normalizes stopped and error playback payloads', () => {
    expect(normalizePlaybackState('Stopped')).toEqual({ state: 'stopped' });
    expect(normalizePlaybackState({ Stopped: null })).toEqual({ state: 'stopped' });
    expect(normalizePlaybackState('Error: boom')).toEqual({ state: 'error', message: 'Error: boom' });
    expect(normalizePlaybackState({ Error: 'Playback broke' })).toEqual({
      state: 'error',
      message: 'Playback broke',
    });
  });

  it('normalizes playing and paused payloads in canonical and lowercase forms', () => {
    expect(normalizePlaybackState({ Playing: { position: '12', duration: '34' } })).toEqual({
      state: 'playing',
      position: 12,
      duration: 34,
    });
    expect(normalizePlaybackState({ Paused: { position: 5, duration: 9 } })).toEqual({
      state: 'paused',
      position: 5,
      duration: 9,
    });
    expect(normalizePlaybackState({ playing: { position: 7, duration: 11 } })).toEqual({
      state: 'playing',
      position: 7,
      duration: 11,
    });
    expect(normalizePlaybackState({ paused: { position: 3, duration: 4 } })).toEqual({
      state: 'paused',
      position: 3,
      duration: 4,
    });
  });
});
