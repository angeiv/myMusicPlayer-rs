import type { PlaybackStateInfo } from '../types';

export type BackendPlayMode = 'sequential' | 'random' | 'single_repeat' | 'list_repeat' | (string & {});
export type RepeatMode = 'off' | 'all' | 'one';

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function normalizeBackendPlayMode(mode: BackendPlayMode): {
  shuffleEnabled: boolean;
  repeatMode: RepeatMode;
} {
  switch (mode) {
    case 'random':
      return { shuffleEnabled: true, repeatMode: 'off' };
    case 'single_repeat':
      return { shuffleEnabled: false, repeatMode: 'one' };
    case 'list_repeat':
      return { shuffleEnabled: false, repeatMode: 'all' };
    default:
      return { shuffleEnabled: false, repeatMode: 'off' };
  }
}

export function resolveBackendPlayMode(shuffleEnabled: boolean, repeatMode: RepeatMode): BackendPlayMode {
  if (shuffleEnabled) return 'random';
  if (repeatMode === 'one') return 'single_repeat';
  if (repeatMode === 'all') return 'list_repeat';
  return 'sequential';
}

export function normalizePlaybackState(payload: unknown): PlaybackStateInfo {
  if (payload === 'Stopped') {
    return { state: 'stopped' };
  }

  if (typeof payload === 'string') {
    return { state: 'error', message: payload };
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const key = Object.keys(record)[0];
    const inner = key ? record[key] : undefined;

    const normalizedKey = typeof key === 'string' ? key.toLowerCase() : '';
    if (normalizedKey === 'stopped') {
      return { state: 'stopped' };
    }
    if (normalizedKey === 'error') {
      return { state: 'error', message: typeof inner === 'string' ? inner : 'Playback error' };
    }
    if (normalizedKey === 'playing' || normalizedKey === 'paused') {
      const values = (inner ?? {}) as Record<string, unknown>;
      const position = toNumber(values['position']);
      const duration = toNumber(values['duration']);
      return normalizedKey === 'playing'
        ? { state: 'playing', position, duration }
        : { state: 'paused', position, duration };
    }
  }

  return { state: 'stopped' };
}
