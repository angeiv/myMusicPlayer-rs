import { get, writable, type Writable } from 'svelte/store';

import * as configApi from '../api/config';
import * as libraryApi from '../api/library';
import * as playbackApi from '../api/playback';
import type { AppConfig, OutputDeviceInfo, PlaybackStateInfo, Track } from '../types';
import {
  normalizeBackendPlayMode,
  resolveBackendPlayMode,
  type BackendPlayMode,
  type RepeatMode,
} from '../transport/playback';

export const REFRESH_INTERVAL = 1000;

type PlaybackStoreState = {
  currentTrack: Track | null;
  playbackState: PlaybackStateInfo;
  volume: number;
  progress: number;
  duration: number;
  queueTracks: Track[];
  outputDevices: OutputDeviceInfo[];
  selectedDeviceId: string;
  shuffleEnabled: boolean;
  repeatMode: RepeatMode;
  uiError: string;
};

export type PlaybackStoreDependencies = {
  getConfig: () => Promise<AppConfig>;
  saveConfig: (config: AppConfig) => Promise<void>;
  setLastSession: (lastTrackId: string | null, lastPositionSeconds: number) => Promise<void>;
  getTrack: (id: string) => Promise<Track | null>;
  getCurrentTrack: () => Promise<Track | null>;
  getOutputDevice: () => Promise<string | null>;
  getOutputDevices: () => Promise<OutputDeviceInfo[]>;
  getPlayMode: () => Promise<BackendPlayMode>;
  setPlayMode: (mode: BackendPlayMode) => Promise<void>;
  getPlaybackState: () => Promise<PlaybackStateInfo>;
  getQueue: () => Promise<Track[]>;
  getVolume: () => Promise<number>;
  pausePlayback: () => Promise<void>;
  pickAndPlayFile: () => Promise<void>;
  playNextTrack: () => Promise<void>;
  playPreviousTrack: () => Promise<void>;
  playTrack: (track: Track) => Promise<void>;
  resumePlayback: () => Promise<void>;
  seekTo: (position: number) => Promise<void>;
  setOutputDevice: (deviceId: string) => Promise<void>;
  setPlayModeFromUi: (shuffleEnabled: boolean, repeatMode: RepeatMode) => Promise<void>;
  setQueue: (tracks: Track[]) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  setInterval: typeof globalThis.setInterval;
  clearInterval: typeof globalThis.clearInterval;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
};

type PlaybackStore = Writable<PlaybackStoreState> & {
  start: () => Promise<void>;
  destroy: () => void;
  refreshState: () => Promise<void>;
  refreshQueue: () => Promise<void>;
  dismissError: () => void;
  togglePlayPause: () => Promise<void>;
  promptAndPlayFile: () => Promise<void>;
  beginSeek: () => void;
  previewSeek: (position: number) => void;
  commitSeek: (position: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleShuffle: () => Promise<void>;
  cycleRepeatMode: () => Promise<void>;
  playNext: (queuePopoverOpen: boolean) => Promise<void>;
  playPrevious: (queuePopoverOpen: boolean) => Promise<void>;
  playQueueTrack: (track: Track) => Promise<void>;
  selectOutputDevice: (deviceId: string) => Promise<void>;
};

function defaultDependencies(): PlaybackStoreDependencies {
  return {
    getConfig: configApi.getConfig,
    saveConfig: configApi.saveConfig,
    setLastSession: configApi.setLastSession,
    getTrack: libraryApi.getTrack,
    getCurrentTrack: playbackApi.getCurrentTrack,
    getOutputDevice: playbackApi.getOutputDevice,
    getOutputDevices: playbackApi.getOutputDevices,
    getPlayMode: playbackApi.getPlayMode,
    setPlayMode: playbackApi.setPlayMode,
    getPlaybackState: playbackApi.getPlaybackState,
    getQueue: playbackApi.getQueue,
    getVolume: playbackApi.getVolume,
    pausePlayback: playbackApi.pausePlayback,
    pickAndPlayFile: playbackApi.pickAndPlayFile,
    playNextTrack: playbackApi.playNextTrack,
    playPreviousTrack: playbackApi.playPreviousTrack,
    playTrack: playbackApi.playTrack,
    resumePlayback: playbackApi.resumePlayback,
    seekTo: playbackApi.seekTo,
    setOutputDevice: playbackApi.setOutputDevice,
    setPlayModeFromUi: playbackApi.setPlayModeFromUi,
    setQueue: playbackApi.setQueue,
    setVolume: playbackApi.setVolume,
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

function initialState(): PlaybackStoreState {
  return {
    currentTrack: null,
    playbackState: { state: 'stopped' },
    volume: 1,
    progress: 0,
    duration: 0,
    queueTracks: [],
    outputDevices: [],
    selectedDeviceId: 'default',
    shuffleEnabled: false,
    repeatMode: 'off',
    uiError: '',
  };
}

export function createPlaybackStore(overrides: Partial<PlaybackStoreDependencies> = {}): PlaybackStore {
  const deps: PlaybackStoreDependencies = { ...defaultDependencies(), ...overrides };

  const store = writable<PlaybackStoreState>(initialState());

  let refreshInterval: ReturnType<typeof deps.setInterval> | null = null;
  let persistTimer: ReturnType<typeof deps.setTimeout> | null = null;
  let scheduledPersist: { trackId: string; positionSeconds: number } | null = null;
  let lastPersisted: { trackId: string; positionSeconds: number } | null = null;
  let lastNonZeroVolume = 0.7;
  let seeking = false;
  let suppressedError: string | null = null;

  async function refreshOutputDeviceState(): Promise<void> {
    const [devices, selected] = await Promise.all([deps.getOutputDevices(), deps.getOutputDevice()]);
    const outputDevices = (devices ?? []).filter((device) => !device.is_default);
    const selectedDeviceId = typeof selected === 'string' && selected ? selected : 'default';
    store.update((state) => ({ ...state, outputDevices, selectedDeviceId }));
  }

  async function refreshPlayMode(): Promise<void> {
    const mode = await deps.getPlayMode();
    const { shuffleEnabled, repeatMode } = normalizeBackendPlayMode(mode);
    store.update((state) => ({ ...state, shuffleEnabled, repeatMode }));
  }

  function schedulePersistSession(trackId: string, positionSeconds: number): void {
    const rounded = Math.floor(positionSeconds);

    if (
      lastPersisted &&
      lastPersisted.trackId === trackId &&
      Math.abs(rounded - lastPersisted.positionSeconds) < 2
    ) {
      return;
    }

    if (
      scheduledPersist &&
      scheduledPersist.trackId === trackId &&
      scheduledPersist.positionSeconds === rounded
    ) {
      return;
    }

    if (persistTimer) {
      deps.clearTimeout(persistTimer);
      persistTimer = null;
    }

    scheduledPersist = { trackId, positionSeconds: rounded };
    persistTimer = deps.setTimeout(async () => {
      const payload = scheduledPersist;
      scheduledPersist = null;
      persistTimer = null;
      if (!payload) return;

      try {
        await deps.setLastSession(payload.trackId, payload.positionSeconds);
        lastPersisted = payload;
      } catch (error) {
        console.warn('Failed to persist session:', error);
      }
    }, 1200);
  }

  async function refreshState(): Promise<void> {
    try {
      const [playbackState, currentTrack, volume] = await Promise.all([
        deps.getPlaybackState(),
        deps.getCurrentTrack(),
        deps.getVolume(),
      ]);

      const progress =
        playbackState.state === 'playing' || playbackState.state === 'paused'
          ? playbackState.position
          : 0;
      const duration =
        playbackState.state === 'playing' || playbackState.state === 'paused'
          ? playbackState.duration
          : 0;

      const backendError = playbackState.state === 'error' ? playbackState.message : '';
      if (playbackState.state !== 'error') {
        suppressedError = null;
      }

      store.update((state) => ({
        ...state,
        currentTrack,
        playbackState,
        volume,
        progress: seeking ? state.progress : progress,
        duration: seeking ? state.duration : duration,
        uiError: backendError && backendError !== suppressedError ? backendError : '',
      }));

      if (
        currentTrack &&
        (playbackState.state === 'playing' || playbackState.state === 'paused')
      ) {
        schedulePersistSession(currentTrack.id, playbackState.position);
      }
    } catch (error) {
      console.error('Failed to refresh playback state:', error);
      store.update((state) => ({
        ...state,
        uiError: 'Failed to refresh playback state.',
      }));
    }
  }

  async function refreshQueue(): Promise<void> {
    try {
      const queueTracks = await deps.getQueue();
      store.update((state) => ({ ...state, queueTracks: queueTracks ?? [] }));
    } catch (error) {
      console.error('Failed to load queue:', error);
    }
  }

  async function applyStartupConfig(): Promise<void> {
    const config = await deps.getConfig();

    if (typeof config.default_volume === 'number' && Number.isFinite(config.default_volume)) {
      await setVolume(config.default_volume);
    }

    const output =
      typeof config.output_device_id === 'string' && config.output_device_id
        ? config.output_device_id
        : 'default';
    try {
      await deps.setOutputDevice(output);
    } catch (error) {
      console.warn('Failed to apply startup output device:', error);
    }

    const rawMode = typeof config.play_mode === 'string' ? config.play_mode : '';
    const mode: BackendPlayMode =
      rawMode === 'sequential' ||
      rawMode === 'random' ||
      rawMode === 'single_repeat' ||
      rawMode === 'list_repeat'
        ? rawMode
        : 'sequential';

    try {
      await deps.setPlayMode(mode);
    } catch (error) {
      console.warn('Failed to apply startup play mode:', error);
    }
  }

  async function start(): Promise<void> {
    try {
      await applyStartupConfig();
    } catch (error) {
      console.warn('Failed to apply startup preferences:', error);
    }

    const refreshResults = await Promise.allSettled([
      refreshState(),
      refreshPlayMode(),
      refreshOutputDeviceState(),
    ]);

    for (const result of refreshResults) {
      if (result.status === 'rejected') {
        console.warn('Failed to refresh playback store during start:', result.reason);
      }
    }

    if (refreshInterval) {
      deps.clearInterval(refreshInterval);
      refreshInterval = null;
    }

    refreshInterval = deps.setInterval(() => {
      void refreshState();
    }, REFRESH_INTERVAL);
  }

  function destroy(): void {
    if (refreshInterval) {
      deps.clearInterval(refreshInterval);
      refreshInterval = null;
    }

    if (persistTimer) {
      deps.clearTimeout(persistTimer);
      persistTimer = null;
      scheduledPersist = null;
    }
  }

  async function restoreLastSession(): Promise<boolean> {
    let config: AppConfig;
    try {
      config = await deps.getConfig();
    } catch (error) {
      console.warn('Failed to load config for restoring session:', error);
      return false;
    }

    const lastTrackId = config.last_track_id ?? null;
    const lastPositionSeconds = config.last_position_seconds ?? 0;

    if (!lastTrackId) return false;

    let track: Track | null;
    try {
      track = await deps.getTrack(lastTrackId);
    } catch (error) {
      console.warn('Failed to load last session track:', error);
      return false;
    }

    if (!track) {
      console.warn('Configured last session track is missing. Clearing last session.');
      try {
        await deps.setLastSession(null, 0);
      } catch (clearError) {
        console.warn('Failed to clear last session:', clearError);
      }
      return false;
    }

    try {
      await deps.setQueue([track]);
    } catch (error) {
      console.warn('Failed to set queue for restoring session:', error);
    }

    try {
      await deps.playTrack(track);
    } catch (error) {
      console.warn('Failed to play last session track:', error);
      try {
        await deps.setLastSession(null, 0);
      } catch (clearError) {
        console.warn('Failed to clear last session:', clearError);
      }
      return false;
    }

    if (lastPositionSeconds > 0) {
      try {
        await deps.seekTo(lastPositionSeconds);
      } catch (error) {
        console.warn('Failed to seek while restoring session:', error);
      }
    }

    return true;
  }

  async function togglePlayPause(): Promise<void> {
    const { playbackState } = get(store);

    try {
      if (playbackState.state === 'playing') {
        await deps.pausePlayback();
        await refreshState();
        return;
      }

      if (playbackState.state === 'paused') {
        await deps.resumePlayback();
        await refreshState();
        return;
      }

      const restored = await restoreLastSession();
      if (!restored) {
        await deps.pickAndPlayFile();
      }
      await refreshState();
    } catch (error) {
      console.error('togglePlayPause failed:', error);
    }
  }

  async function promptAndPlayFile(): Promise<void> {
    try {
      await deps.pickAndPlayFile();
      await refreshState();
    } catch (error) {
      console.error('Failed to play file:', error);
    }
  }

  function beginSeek(): void {
    seeking = true;
  }

  function previewSeek(position: number): void {
    if (!seeking) return;
    store.update((state) => ({ ...state, progress: position }));
  }

  async function commitSeek(position: number): Promise<void> {
    seeking = false;
    try {
      await deps.seekTo(position);
    } catch (error) {
      console.error('Failed to seek:', error);
    }
    await refreshState();
  }

  async function setVolume(volume: number): Promise<void> {
    const clamped = Math.min(Math.max(volume, 0), 1);
    if (clamped > 0) {
      lastNonZeroVolume = clamped;
    }

    store.update((state) => ({ ...state, volume: clamped }));
    try {
      await deps.setVolume(clamped);
    } catch (error) {
      console.error('Failed to set volume:', error);
    }
  }

  async function toggleMute(): Promise<void> {
    const state = get(store);
    if (state.volume > 0) {
      await setVolume(0);
    } else {
      await setVolume(lastNonZeroVolume);
    }
  }

  async function toggleShuffle(): Promise<void> {
    const state = get(store);
    const nextShuffleEnabled = !state.shuffleEnabled;
    const nextRepeatMode: RepeatMode = 'off';

    store.update((current) => ({
      ...current,
      shuffleEnabled: nextShuffleEnabled,
      repeatMode: nextRepeatMode,
    }));

    try {
      await deps.setPlayModeFromUi(nextShuffleEnabled, nextRepeatMode);

      try {
        const base = await deps.getConfig();
        await deps.saveConfig({
          ...base,
          play_mode: resolveBackendPlayMode(nextShuffleEnabled, nextRepeatMode),
        });
      } catch (error) {
        console.warn('Failed to persist play mode:', error);
      }
    } catch (error) {
      console.error('Failed to toggle shuffle:', error);
      await refreshPlayMode();
    }
  }

  async function cycleRepeatMode(): Promise<void> {
    const state = get(store);
    const nextRepeatMode: RepeatMode =
      state.repeatMode === 'off' ? 'all' : state.repeatMode === 'all' ? 'one' : 'off';

    store.update((current) => ({
      ...current,
      shuffleEnabled: false,
      repeatMode: nextRepeatMode,
    }));

    try {
      await deps.setPlayModeFromUi(false, nextRepeatMode);

      try {
        const base = await deps.getConfig();
        await deps.saveConfig({
          ...base,
          play_mode: resolveBackendPlayMode(false, nextRepeatMode),
        });
      } catch (error) {
        console.warn('Failed to persist play mode:', error);
      }
    } catch (error) {
      console.error('Failed to set repeat mode:', error);
      await refreshPlayMode();
    }
  }

  async function playNext(queuePopoverOpen: boolean): Promise<void> {
    try {
      await deps.playNextTrack();
      if (queuePopoverOpen) {
        await refreshQueue();
      }
      await refreshState();
    } catch (error) {
      console.error('Failed to play next track:', error);
    }
  }

  async function playPrevious(queuePopoverOpen: boolean): Promise<void> {
    try {
      await deps.playPreviousTrack();
      if (queuePopoverOpen) {
        await refreshQueue();
      }
      await refreshState();
    } catch (error) {
      console.error('Failed to play previous track:', error);
    }
  }

  async function playQueueTrack(track: Track): Promise<void> {
    try {
      await deps.playTrack(track);
      await refreshState();
    } catch (error) {
      console.error('Failed to play queue track:', error);
    }
  }

  async function selectOutputDevice(deviceId: string): Promise<void> {
    store.update((state) => ({ ...state, selectedDeviceId: deviceId }));
    try {
      await deps.setOutputDevice(deviceId);

      try {
        const base = await deps.getConfig();
        await deps.saveConfig({
          ...base,
          output_device_id: deviceId === 'default' ? null : deviceId,
        });
      } catch (error) {
        console.warn('Failed to persist output device:', error);
      }
    } catch (error) {
      console.error('Failed to switch output device:', error);
      try {
        const actual = await deps.getOutputDevice();
        store.update((state) => ({
          ...state,
          selectedDeviceId: actual ?? 'default',
        }));
      } catch {
        store.update((state) => ({ ...state, selectedDeviceId: 'default' }));
      }
    }
  }

  function dismissError(): void {
    suppressedError = get(store).uiError || suppressedError;
    store.update((state) => ({ ...state, uiError: '' }));
  }

  return {
    ...store,
    start,
    destroy,
    refreshState,
    refreshQueue,
    dismissError,
    togglePlayPause,
    promptAndPlayFile,
    beginSeek,
    previewSeek,
    commitSeek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeatMode,
    playNext,
    playPrevious,
    playQueueTrack,
    selectOutputDevice,
  };
}
