import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  REFRESH_INTERVAL,
  createPlaybackStore,
  type PlaybackStoreDependencies,
} from '../lib/stores/playback';
import type { AppConfig, OutputDeviceInfo, PlaybackStateInfo, Track } from '../lib/types';

function createTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Test Track',
    duration: 180,
    path: '/music/test-track.mp3',
    size: 1024,
    format: 'mp3',
    bitrate: 320000,
    sample_rate: 44100,
    channels: 2,
    play_count: 0,
    date_added: '2026-03-14T00:00:00.000Z',
    artist_name: 'Example Artist',
    album_title: 'Example Album',
    ...overrides,
    library_root: overrides.library_root ?? null,
    file_mtime_ms: overrides.file_mtime_ms ?? null,
    availability: overrides.availability ?? 'available',
    missing_since: overrides.missing_since ?? null,
  };
}

function createConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    library_paths: [],
    default_volume: 0.68,
    auto_scan: false,
    theme: 'system',
    play_mode: 'sequential',
    ...overrides,
  };
}

function createDependencies(
  overrides: Partial<PlaybackStoreDependencies> = {}
): PlaybackStoreDependencies {
  const defaultDevices: OutputDeviceInfo[] = [
    { id: 'default', name: 'System default', is_default: true },
  ];

  return {
    getConfig: vi.fn().mockResolvedValue(createConfig()),
    saveConfig: vi.fn().mockResolvedValue(undefined),
    setLastSession: vi.fn().mockResolvedValue(undefined),
    getTrack: vi.fn().mockResolvedValue(null),
    getCurrentTrack: vi.fn().mockResolvedValue(null),
    getOutputDevice: vi.fn().mockResolvedValue('default'),
    getOutputDevices: vi.fn().mockResolvedValue(defaultDevices),
    getPlayMode: vi.fn().mockResolvedValue('sequential'),
    setPlayMode: vi.fn().mockResolvedValue(undefined),
    getPlaybackState: vi.fn().mockResolvedValue({ state: 'stopped' } satisfies PlaybackStateInfo),
    getQueue: vi.fn().mockResolvedValue([]),
    clearQueue: vi.fn().mockResolvedValue(undefined),
    removeFromQueue: vi.fn().mockResolvedValue(undefined),
    getVolume: vi.fn().mockResolvedValue(0.68),
    pausePlayback: vi.fn().mockResolvedValue(undefined),
    pickAndPlayFile: vi.fn().mockResolvedValue(undefined),
    playNextTrack: vi.fn().mockResolvedValue(undefined),
    playPreviousTrack: vi.fn().mockResolvedValue(undefined),
    playTrack: vi.fn().mockResolvedValue(undefined),
    resumePlayback: vi.fn().mockResolvedValue(undefined),
    seekTo: vi.fn().mockResolvedValue(undefined),
    setOutputDevice: vi.fn().mockResolvedValue(undefined),
    setPlayModeFromUi: vi.fn().mockResolvedValue(undefined),
    setQueue: vi.fn().mockResolvedValue(undefined),
    setVolume: vi.fn().mockResolvedValue(undefined),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    ...overrides,
  };
}

describe('playback store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('applies config preferences before refreshing playback state on start', async () => {
    const calls: string[] = [];
    const deps = createDependencies({
      getConfig: vi.fn(async () =>
        createConfig({
          default_volume: 0.25,
          output_device_id: 'usb-dac',
          play_mode: 'random',
        })
      ),
      setVolume: vi.fn(async () => calls.push('setVolume')),
      setOutputDevice: vi.fn(async () => calls.push('setOutputDevice')),
      setPlayMode: vi.fn(async () => calls.push('setPlayMode')),
      getPlaybackState: vi.fn(async () => {
        calls.push('getPlaybackState');
        return { state: 'stopped' };
      }),
      getCurrentTrack: vi.fn(async () => {
        calls.push('getCurrentTrack');
        return null;
      }),
      getVolume: vi.fn(async () => {
        calls.push('getVolume');
        return 0.25;
      }),
      getPlayMode: vi.fn(async () => {
        calls.push('getPlayMode');
        return 'random';
      }),
      getOutputDevice: vi.fn(async () => {
        calls.push('getOutputDevice');
        return 'usb-dac';
      }),
    } as any);

    const store = createPlaybackStore(deps);
    await store.start();

    expect(calls.slice(0, 3)).toEqual(['setVolume', 'setOutputDevice', 'setPlayMode']);

    store.destroy();
  });

  it('falls back to sequential when config play_mode is invalid', async () => {
    const deps = createDependencies({
      getConfig: vi.fn(async () => createConfig({ play_mode: 'weird-mode' })),
      setPlayMode: vi.fn().mockResolvedValue(undefined),
    } as any);

    const store = createPlaybackStore(deps);
    await store.start();

    expect(deps.setPlayMode).toHaveBeenCalledWith('sequential');

    store.destroy();
  });

  it('loads playback state, play mode, output devices, and polls every second', async () => {
    const track = createTrack();
    const speaker = { id: 'speaker-1', name: 'Desk Speakers', is_default: false };
    const deps = createDependencies({
      getPlaybackState: vi
        .fn()
        .mockResolvedValue({ state: 'playing', position: 12, duration: track.duration } satisfies PlaybackStateInfo),
      getCurrentTrack: vi.fn().mockResolvedValue(track),
      getVolume: vi.fn().mockResolvedValue(0.42),
      getPlayMode: vi.fn().mockResolvedValue('list_repeat'),
      getOutputDevices: vi.fn().mockResolvedValue([
        { id: 'default', name: 'System default', is_default: true },
        speaker,
      ] satisfies OutputDeviceInfo[]),
      getOutputDevice: vi.fn().mockResolvedValue(speaker.id),
    });
    const store = createPlaybackStore(deps);

    await store.start();

    expect(get(store)).toMatchObject({
      currentTrack: track,
      playbackState: { state: 'playing', position: 12, duration: track.duration },
      volume: 0.42,
      progress: 12,
      duration: track.duration,
      repeatMode: 'all',
      shuffleEnabled: false,
      selectedDeviceId: speaker.id,
      outputDevices: [speaker],
    });

    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL);
    expect(deps.getPlaybackState).toHaveBeenCalledTimes(2);
    expect(deps.getCurrentTrack).toHaveBeenCalledTimes(2);
    expect(deps.getVolume).toHaveBeenCalledTimes(2);

    store.destroy();
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL * 2);
    expect(deps.getPlaybackState).toHaveBeenCalledTimes(2);
  });

  it('restores the previous session before refreshing state when playback is idle', async () => {
    const resumedTrack = createTrack({ id: 'resume-1', title: 'Resume Track', duration: 245 });
    const calls: string[] = [];
    const deps = createDependencies({
      getConfig: vi.fn().mockImplementation(async () => {
        calls.push('getConfig');
        return createConfig({
          last_track_id: resumedTrack.id,
          last_position_seconds: 23,
        });
      }),
      getTrack: vi.fn().mockImplementation(async () => {
        calls.push('getTrack');
        return resumedTrack;
      }),
      setQueue: vi.fn().mockImplementation(async () => {
        calls.push('setQueue');
      }),
      playTrack: vi.fn().mockImplementation(async () => {
        calls.push('playTrack');
      }),
      seekTo: vi.fn().mockImplementation(async () => {
        calls.push('seekTo');
      }),
      getPlaybackState: vi.fn().mockImplementation(async () => {
        calls.push('getPlaybackState');
        return { state: 'playing', position: 23, duration: resumedTrack.duration } satisfies PlaybackStateInfo;
      }),
      getCurrentTrack: vi.fn().mockImplementation(async () => {
        calls.push('getCurrentTrack');
        return resumedTrack;
      }),
      getVolume: vi.fn().mockImplementation(async () => {
        calls.push('getVolume');
        return 0.5;
      }),
    });
    const store = createPlaybackStore(deps);

    await store.togglePlayPause();

    expect(calls).toEqual([
      'getConfig',
      'getTrack',
      'setQueue',
      'playTrack',
      'seekTo',
      'getPlaybackState',
      'getCurrentTrack',
      'getVolume',
    ]);
    expect(deps.setQueue).toHaveBeenCalledWith([resumedTrack]);
    expect(deps.playTrack).toHaveBeenCalledWith(resumedTrack);
    expect(deps.seekTo).toHaveBeenCalledWith(23);
    expect(get(store)).toMatchObject({
      currentTrack: resumedTrack,
      playbackState: { state: 'playing', position: 23, duration: resumedTrack.duration },
      progress: 23,
      duration: resumedTrack.duration,
    });
  });

  it('does not clear last session or fall back to pickAndPlayFile when seek fails', async () => {
    const resumedTrack = createTrack({
      id: 'resume-seek-fail',
      title: 'Resume Seek Fail Track',
      duration: 245,
    });

    const deps = createDependencies({
      getConfig: vi.fn(async () =>
        createConfig({
          last_track_id: resumedTrack.id,
          last_position_seconds: 23,
        })
      ),
      getTrack: vi.fn(async () => resumedTrack),
      seekTo: vi.fn().mockRejectedValue(new Error('seek failed')),
      pickAndPlayFile: vi.fn().mockResolvedValue(undefined),
      setLastSession: vi.fn().mockResolvedValue(undefined),
    });

    const store = createPlaybackStore(deps);
    await store.togglePlayPause();

    expect(deps.playTrack).toHaveBeenCalledWith(resumedTrack);
    expect(deps.seekTo).toHaveBeenCalledWith(23);
    expect(deps.pickAndPlayFile).not.toHaveBeenCalled();
    expect(deps.setLastSession).not.toHaveBeenCalledWith(null, 0);
  });

  it('plays from lyrics timestamp by resuming when the store snapshot is paused', async () => {
    const track = createTrack({ id: 'lyrics-paused', duration: 100 });
    const calls: string[] = [];
    const getPlaybackState = vi.fn<() => Promise<PlaybackStateInfo>>().mockImplementation(async () => {
      calls.push('getPlaybackState');
      return { state: 'paused', position: 10, duration: track.duration };
    });
    const getCurrentTrack = vi.fn<() => Promise<Track | null>>().mockImplementation(async () => {
      calls.push('getCurrentTrack');
      return track;
    });
    const getVolume = vi.fn<() => Promise<number>>().mockImplementation(async () => {
      calls.push('getVolume');
      return 0.5;
    });
    const seekTo = vi.fn<(position: number) => Promise<void>>().mockImplementation(async () => {
      calls.push('seekTo');
    });
    const resumePlayback = vi.fn<() => Promise<void>>().mockImplementation(async () => {
      calls.push('resumePlayback');
    });
    const deps = createDependencies({
      seekTo,
      resumePlayback,
      getPlaybackState,
      getCurrentTrack,
      getVolume,
    });

    const store = createPlaybackStore(deps);
    await store.refreshState();

    getPlaybackState.mockImplementation(async () => {
      calls.push('getPlaybackState');
      return { state: 'playing', position: 10, duration: track.duration };
    });
    getCurrentTrack.mockImplementation(async () => {
      calls.push('getCurrentTrack');
      return null;
    });
    calls.length = 0;

    await store.playFromLyricsTimestamp(83.87);

    expect(calls).toEqual(['seekTo', 'resumePlayback', 'getPlaybackState', 'getCurrentTrack', 'getVolume']);
    expect(seekTo).toHaveBeenCalledWith(83);
    expect(resumePlayback).toHaveBeenCalledTimes(1);
  });

  it('plays from lyrics timestamp without resuming when the store snapshot is already playing', async () => {
    const track = createTrack({ id: 'lyrics-playing', duration: 120 });
    const calls: string[] = [];
    const getPlaybackState = vi.fn<() => Promise<PlaybackStateInfo>>().mockImplementation(async () => {
      calls.push('getPlaybackState');
      return { state: 'playing', position: 12, duration: track.duration };
    });
    const getCurrentTrack = vi.fn<() => Promise<Track | null>>().mockImplementation(async () => {
      calls.push('getCurrentTrack');
      return track;
    });
    const getVolume = vi.fn<() => Promise<number>>().mockImplementation(async () => {
      calls.push('getVolume');
      return 0.5;
    });
    const seekTo = vi.fn<(position: number) => Promise<void>>().mockImplementation(async () => {
      calls.push('seekTo');
    });
    const resumePlayback = vi.fn<() => Promise<void>>().mockImplementation(async () => {
      calls.push('resumePlayback');
    });
    const deps = createDependencies({
      seekTo,
      resumePlayback,
      getPlaybackState,
      getCurrentTrack,
      getVolume,
    });

    const store = createPlaybackStore(deps);
    await store.refreshState();

    getPlaybackState.mockImplementation(async () => {
      calls.push('getPlaybackState');
      return { state: 'paused', position: 12, duration: track.duration };
    });
    calls.length = 0;

    await store.playFromLyricsTimestamp(14.6);

    expect(calls).toEqual(['seekTo', 'getPlaybackState', 'getCurrentTrack', 'getVolume']);
    expect(seekTo).toHaveBeenCalledWith(14);
    expect(resumePlayback).not.toHaveBeenCalled();
  });

  it('does not seek or resume from lyrics when no current track is loaded in the store snapshot', async () => {
    const getPlaybackState = vi
      .fn<() => Promise<PlaybackStateInfo>>()
      .mockResolvedValue({ state: 'paused', position: 10, duration: 100 });
    const getCurrentTrack = vi.fn<() => Promise<Track | null>>().mockResolvedValue(createTrack());
    const seekTo = vi.fn<(position: number) => Promise<void>>().mockResolvedValue(undefined);
    const resumePlayback = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const deps = createDependencies({
      seekTo,
      resumePlayback,
      getPlaybackState,
      getCurrentTrack,
    });

    const store = createPlaybackStore(deps);
    await store.playFromLyricsTimestamp(14.2);

    expect(console.warn).toHaveBeenCalledWith('Ignoring lyrics seek because no current track is loaded.');
    expect(getCurrentTrack).not.toHaveBeenCalled();
    expect(getPlaybackState).not.toHaveBeenCalled();
    expect(seekTo).not.toHaveBeenCalled();
    expect(resumePlayback).not.toHaveBeenCalled();
  });

  it('warns and does not resume from lyrics when the store snapshot is stopped', async () => {
    const track = createTrack({ id: 'lyrics-stopped', duration: 140 });
    const getPlaybackState = vi
      .fn<() => Promise<PlaybackStateInfo>>()
      .mockResolvedValue({ state: 'stopped' } satisfies PlaybackStateInfo);
    const getCurrentTrack = vi.fn<() => Promise<Track | null>>().mockResolvedValue(track);
    const seekTo = vi.fn<(position: number) => Promise<void>>().mockResolvedValue(undefined);
    const resumePlayback = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const deps = createDependencies({
      seekTo,
      resumePlayback,
      getPlaybackState,
      getCurrentTrack,
      getVolume: vi.fn<() => Promise<number>>().mockResolvedValue(0.5),
    });

    const store = createPlaybackStore(deps);
    await store.refreshState();

    await store.playFromLyricsTimestamp(22.9);

    expect(seekTo).toHaveBeenCalledWith(22);
    expect(resumePlayback).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      'Skipping playback resume after lyrics seek because playback is stopped.'
    );
  });

  it('clears last session when configured last track is missing', async () => {
    const deps = createDependencies({
      getConfig: vi.fn(async () =>
        createConfig({
          last_track_id: 'missing-track',
          last_position_seconds: 0,
        })
      ),
      getTrack: vi.fn(async () => null),
      pickAndPlayFile: vi.fn().mockResolvedValue(undefined),
      setLastSession: vi.fn().mockResolvedValue(undefined),
    });

    const store = createPlaybackStore(deps);
    await store.togglePlayPause();

    expect(deps.setLastSession).toHaveBeenCalledWith(null, 0);
  });

  it('clears last session and falls back to pickAndPlayFile when restore fails', async () => {
    const resumedTrack = createTrack({ id: 'resume-error', title: 'Resume Error Track', duration: 245 });
    const deps = createDependencies({
      getConfig: vi.fn(async () =>
        createConfig({
          last_track_id: resumedTrack.id,
          last_position_seconds: 23,
        })
      ),
      getTrack: vi.fn(async () => resumedTrack),
      playTrack: vi.fn().mockRejectedValue(new Error('play failed')),
      pickAndPlayFile: vi.fn().mockResolvedValue(undefined),
      setLastSession: vi.fn().mockResolvedValue(undefined),
    });

    const store = createPlaybackStore(deps);
    await store.togglePlayPause();

    expect(deps.setLastSession).toHaveBeenCalledWith(null, 0);
    expect(deps.pickAndPlayFile).toHaveBeenCalledOnce();
  });

  it('debounces persisted session updates and ignores near-duplicate positions', async () => {
    const track = createTrack({ id: 'persist-1' });
    const deps = createDependencies({
      getPlaybackState: vi
        .fn()
        .mockResolvedValue({ state: 'playing', position: 41.8, duration: track.duration } satisfies PlaybackStateInfo),
      getCurrentTrack: vi.fn().mockResolvedValue(track),
      getVolume: vi.fn().mockResolvedValue(0.7),
    });
    const store = createPlaybackStore(deps);

    await store.refreshState();
    expect(deps.setLastSession).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1199);
    expect(deps.setLastSession).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(deps.setLastSession).toHaveBeenCalledWith(track.id, 41);

    await store.refreshState();
    await vi.advanceTimersByTimeAsync(1200);
    expect(deps.setLastSession).toHaveBeenCalledTimes(1);
  });

  it('maps shuffle and repeat UI changes through the playback API adapter', async () => {
    const deps = createDependencies();
    const store = createPlaybackStore(deps);

    await store.toggleShuffle();
    expect(deps.setPlayModeFromUi).toHaveBeenNthCalledWith(1, true, 'off');
    expect(get(store)).toMatchObject({ shuffleEnabled: true, repeatMode: 'off' });

    await store.cycleRepeatMode();
    expect(deps.setPlayModeFromUi).toHaveBeenNthCalledWith(2, false, 'all');
    expect(get(store)).toMatchObject({ shuffleEnabled: false, repeatMode: 'all' });
  });

  it('persists play mode changes when toggling shuffle', async () => {
    const base = createConfig({
      library_paths: ['/music'],
      default_volume: 0.33,
      auto_scan: true,
      theme: 'dark',
      output_device_id: 'usb-dac',
      play_mode: 'sequential',
    });

    const deps = createDependencies({
      getConfig: vi.fn(async () => base),
      saveConfig: vi.fn().mockResolvedValue(undefined),
    });

    const store = createPlaybackStore(deps);
    await store.toggleShuffle();

    expect(deps.getConfig).toHaveBeenCalled();
    expect(deps.saveConfig).toHaveBeenCalledWith({
      ...base,
      play_mode: 'random',
    });
  });

  it('persists play mode changes when cycling repeat mode', async () => {
    const base = createConfig({
      library_paths: ['/music'],
      default_volume: 0.33,
      auto_scan: true,
      theme: 'dark',
      output_device_id: 'usb-dac',
      play_mode: 'sequential',
    });

    const deps = createDependencies({
      getConfig: vi.fn(async () => base),
      saveConfig: vi.fn().mockResolvedValue(undefined),
    });

    const store = createPlaybackStore(deps);
    await store.cycleRepeatMode();

    expect(deps.getConfig).toHaveBeenCalled();
    expect(deps.saveConfig).toHaveBeenCalledWith({
      ...base,
      play_mode: 'list_repeat',
    });
  });

  it('refreshes the queue after next-track playback when the queue popover is open', async () => {
    const nextTrack = createTrack({ id: 'next-1', title: 'Next Track' });
    const deps = createDependencies({
      getPlaybackState: vi
        .fn()
        .mockResolvedValue({ state: 'playing', position: 0, duration: nextTrack.duration } satisfies PlaybackStateInfo),
      getCurrentTrack: vi.fn().mockResolvedValue(nextTrack),
      getVolume: vi.fn().mockResolvedValue(0.5),
      getQueue: vi.fn().mockResolvedValue([nextTrack]),
    });
    const store = createPlaybackStore(deps);

    await store.playNext(true);

    expect(deps.playNextTrack).toHaveBeenCalledOnce();
    expect(deps.getQueue).toHaveBeenCalledOnce();
    expect(get(store).queueTracks).toEqual([nextTrack]);
  });

  it('clears queue via deps and refreshes the queue state', async () => {
    const calls: string[] = [];
    const refreshedQueue = [createTrack({ id: 'queue-1', title: 'Queue Track' })];
    const deps = createDependencies({
      clearQueue: vi.fn(async () => {
        calls.push('clearQueue');
      }),
      getQueue: vi.fn(async () => {
        calls.push('getQueue');
        return refreshedQueue;
      }),
    });
    const store = createPlaybackStore(deps);

    await store.clearQueue();

    expect(deps.clearQueue).toHaveBeenCalledOnce();
    expect(deps.getQueue).toHaveBeenCalledOnce();
    expect(calls.indexOf('clearQueue')).toBeLessThan(calls.indexOf('getQueue'));
    expect(deps.pausePlayback).not.toHaveBeenCalled();
    expect(deps.playTrack).not.toHaveBeenCalled();
    expect(deps.pickAndPlayFile).not.toHaveBeenCalled();
    expect(get(store).queueTracks).toEqual(refreshedQueue);
  });

  it('removes a track from the queue via deps and refreshes the queue state', async () => {
    const calls: string[] = [];
    const trackId = 'queue-remove-1';
    const refreshedQueue = [createTrack({ id: 'remaining-1', title: 'Remaining Track' })];
    const deps = createDependencies({
      removeFromQueue: vi.fn(async (id: string) => {
        calls.push(`removeFromQueue:${id}`);
      }),
      getQueue: vi.fn(async () => {
        calls.push('getQueue');
        return refreshedQueue;
      }),
    });
    const store = createPlaybackStore(deps);

    await store.removeQueueTrack(trackId);

    expect(deps.removeFromQueue).toHaveBeenCalledOnce();
    expect(deps.removeFromQueue).toHaveBeenCalledWith(trackId);
    expect(deps.getQueue).toHaveBeenCalledOnce();

    const removeIndex = calls.findIndex((call) => call.startsWith('removeFromQueue:'));
    const queueIndex = calls.indexOf('getQueue');
    expect(removeIndex).toBeLessThan(queueIndex);
    expect(get(store).queueTracks).toEqual(refreshedQueue);
  });

  it('persists output device preference when selecting the default device', async () => {
    const base = createConfig({
      library_paths: ['/music'],
      default_volume: 0.33,
      auto_scan: true,
      theme: 'dark',
      output_device_id: 'usb-dac',
      play_mode: 'sequential',
    });

    const deps = createDependencies({
      getConfig: vi.fn(async () => base),
      saveConfig: vi.fn().mockResolvedValue(undefined),
    });

    const store = createPlaybackStore(deps);
    await store.selectOutputDevice('default');

    expect(deps.getConfig).toHaveBeenCalled();
    expect(deps.saveConfig).toHaveBeenCalledWith({
      ...base,
      output_device_id: null,
    });
  });

  it('rehydrates selected output device when switching device fails', async () => {
    const deps = createDependencies({
      getOutputDevice: vi
        .fn<() => Promise<string | null>>()
        .mockResolvedValueOnce('default')
        .mockResolvedValueOnce('default'),
      setOutputDevice: vi.fn().mockRejectedValue(new Error('switch failed')),
    });
    const store = createPlaybackStore(deps);

    await store.start();
    expect(get(store).selectedDeviceId).toBe('default');

    await store.selectOutputDevice('usb-dac');

    expect(get(store).selectedDeviceId).toBe('default');
    expect(deps.setOutputDevice).toHaveBeenCalledWith('usb-dac');
  });
});
