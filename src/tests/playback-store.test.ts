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
    setLastSession: vi.fn().mockResolvedValue(undefined),
    getTrack: vi.fn().mockResolvedValue(null),
    getCurrentTrack: vi.fn().mockResolvedValue(null),
    getOutputDevice: vi.fn().mockResolvedValue('default'),
    getOutputDevices: vi.fn().mockResolvedValue(defaultDevices),
    getPlayMode: vi.fn().mockResolvedValue('sequential'),
    getPlaybackState: vi.fn().mockResolvedValue({ state: 'stopped' } satisfies PlaybackStateInfo),
    getQueue: vi.fn().mockResolvedValue([]),
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
