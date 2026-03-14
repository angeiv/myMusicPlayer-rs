import { describe, expect, it } from 'vitest';

import {
  normalizeConfigForRestore,
  normalizeConfigForSettings,
  normalizeConfigSession,
  normalizeTheme,
} from '../lib/transport/config';

describe('config transport helpers', () => {
  it('coerces invalid theme values to system', () => {
    expect(normalizeTheme('sepia')).toBe('system');
    expect(normalizeTheme('dark')).toBe('dark');
  });

  it('normalizes restore-time config without inventing optional values', () => {
    expect(
      normalizeConfigForRestore({
        theme: 'light',
        library_paths: ['~/Music', 5, null],
        auto_scan: 1,
      })
    ).toEqual({
      theme: 'light',
      outputDeviceId: null,
      defaultVolume: null,
      autoScan: true,
      libraryPaths: ['~/Music'],
    });
  });

  it('normalizes settings config with caller fallbacks', () => {
    expect(
      normalizeConfigForSettings(
        {
          theme: 'invalid',
          default_volume: 0.4,
        },
        {
          autoScan: true,
          defaultVolume: 0.7,
          selectedDeviceId: 'default',
        }
      )
    ).toEqual({
      theme: 'system',
      autoScan: false,
      defaultVolume: 0.4,
      selectedDeviceId: 'default',
    });
  });

  it('normalizes config session fields when they are absent', () => {
    expect(normalizeConfigSession({})).toEqual({ lastTrackId: null, lastPositionSeconds: 0 });
    expect(normalizeConfigSession({ last_track_id: 'track-1', last_position_seconds: '14' })).toEqual({
      lastTrackId: 'track-1',
      lastPositionSeconds: 14,
    });
  });
});
