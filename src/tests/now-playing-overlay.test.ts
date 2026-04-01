// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const overlayMock = vi.hoisted(() => {
  type Subscriber<T> = (value: T) => void;

  function createStore<T>(initial: T) {
    let value = initial;
    const subscribers = new Set<Subscriber<T>>();

    return {
      subscribe(run: Subscriber<T>) {
        run(value);
        subscribers.add(run);
        return () => subscribers.delete(run);
      },
      set(next: T) {
        value = next;
        subscribers.forEach((run) => run(value));
      },
      update(updater: (current: T) => T) {
        value = updater(value);
        subscribers.forEach((run) => run(value));
      },
    };
  }

  const currentTrack = {
    id: 'track-current',
    title: 'Midnight City',
    duration: 264,
    path: '/music/midnight-city.flac',
    size: 1024,
    format: 'flac',
    bitrate: 320000,
    sample_rate: 48000,
    channels: 2,
    artist_name: 'M83',
    album_title: 'Hurry Up, We\'re Dreaming',
    genre: 'Electronic',
    play_count: 0,
    date_added: '2026-03-01T00:00:00.000Z',
  };

  const queuedTrack = {
    id: 'track-queue',
    title: 'Intro',
    duration: 146,
    path: '/music/intro.flac',
    size: 2048,
    format: 'flac',
    bitrate: 320000,
    sample_rate: 48000,
    channels: 2,
    artist_name: 'The xx',
    album_title: 'xx',
    genre: 'Indie',
    play_count: 0,
    date_added: '2026-03-02T00:00:00.000Z',
  };

  const createPlaybackSnapshot = (track: typeof currentTrack | null) => ({
    currentTrack: track,
    playbackState: { state: track ? 'paused' : 'stopped' },
    volume: 1,
    progress: 0,
    duration: track?.duration ?? 0,
    queueTracks: [queuedTrack],
    outputDevices: [],
    selectedDeviceId: 'default',
    shuffleEnabled: false,
    repeatMode: 'off' as const,
    uiError: '',
  });

  const nowPlayingState = createStore<{ isOpen: boolean; activeTab: 'lyrics' | 'queue' }>({
    isOpen: false,
    activeTab: 'lyrics',
  });
  const playbackState = createStore(createPlaybackSnapshot(currentTrack));

  const open = vi.fn(() => {
    nowPlayingState.set({ isOpen: true, activeTab: 'lyrics' });
  });
  const close = vi.fn(() => {
    nowPlayingState.update((state) => ({ ...state, isOpen: false }));
  });
  const toggle = vi.fn(() => {
    nowPlayingState.update((state) =>
      state.isOpen ? { ...state, isOpen: false } : { isOpen: true, activeTab: 'lyrics' }
    );
  });
  const setActiveTab = vi.fn((tab: 'lyrics' | 'queue') => {
    nowPlayingState.update((state) => ({ ...state, activeTab: tab }));
  });
  const refreshQueue = vi.fn(async () => undefined);
  const clearQueue = vi.fn(async () => undefined);
  const removeQueueTrack = vi.fn(async () => undefined);
  const playQueueTrack = vi.fn(async () => undefined);
  const playFromLyricsTimestamp = vi.fn(async () => undefined);
  const togglePlayPause = vi.fn(async () => undefined);
  const promptAndPlayFile = vi.fn(async () => undefined);
  const beginSeek = vi.fn(() => undefined);
  const previewSeek = vi.fn(() => undefined);
  const commitSeek = vi.fn(async () => undefined);
  const setVolume = vi.fn(async () => undefined);
  const toggleMute = vi.fn(async () => undefined);
  const toggleShuffle = vi.fn(async () => undefined);
  const cycleRepeatMode = vi.fn(async () => undefined);
  const playPrevious = vi.fn(async () => undefined);
  const playNext = vi.fn(async () => undefined);
  const selectOutputDevice = vi.fn(async () => undefined);
  const dismissError = vi.fn(() => undefined);

  function setCurrentTrack(track: typeof currentTrack | null) {
    playbackState.update((state) => ({
      ...state,
      currentTrack: track,
      playbackState: { state: track ? 'paused' : 'stopped' },
      duration: track?.duration ?? 0,
    }));
  }

  function reset() {
    nowPlayingState.set({ isOpen: false, activeTab: 'lyrics' });
    playbackState.set(createPlaybackSnapshot(currentTrack));
    open.mockClear();
    close.mockClear();
    toggle.mockClear();
    setActiveTab.mockClear();
    refreshQueue.mockClear();
    clearQueue.mockClear();
    removeQueueTrack.mockClear();
    playQueueTrack.mockClear();
    playFromLyricsTimestamp.mockClear();
    togglePlayPause.mockClear();
    promptAndPlayFile.mockClear();
    beginSeek.mockClear();
    previewSeek.mockClear();
    commitSeek.mockClear();
    setVolume.mockClear();
    toggleMute.mockClear();
    toggleShuffle.mockClear();
    cycleRepeatMode.mockClear();
    playPrevious.mockClear();
    playNext.mockClear();
    selectOutputDevice.mockClear();
    dismissError.mockClear();
  }

  return {
    currentTrack,
    nowPlayingState,
    playbackState,
    open,
    close,
    toggle,
    setActiveTab,
    refreshQueue,
    clearQueue,
    removeQueueTrack,
    playQueueTrack,
    playFromLyricsTimestamp,
    togglePlayPause,
    promptAndPlayFile,
    beginSeek,
    previewSeek,
    commitSeek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeatMode,
    playPrevious,
    playNext,
    selectOutputDevice,
    dismissError,
    setCurrentTrack,
    reset,
  };
});

vi.mock('../lib/player/now-playing', () => ({
  nowPlayingUi: {
    state: overlayMock.nowPlayingState,
    open: overlayMock.open,
    close: overlayMock.close,
    toggle: overlayMock.toggle,
    setActiveTab: overlayMock.setActiveTab,
  },
}));

vi.mock('../lib/player/sharedPlayback', () => ({
  sharedPlayback: {
    subscribe: overlayMock.playbackState.subscribe,
    refreshQueue: overlayMock.refreshQueue,
    clearQueue: overlayMock.clearQueue,
    removeQueueTrack: overlayMock.removeQueueTrack,
    playQueueTrack: overlayMock.playQueueTrack,
    playFromLyricsTimestamp: overlayMock.playFromLyricsTimestamp,
    togglePlayPause: overlayMock.togglePlayPause,
    promptAndPlayFile: overlayMock.promptAndPlayFile,
    beginSeek: overlayMock.beginSeek,
    previewSeek: overlayMock.previewSeek,
    commitSeek: overlayMock.commitSeek,
    setVolume: overlayMock.setVolume,
    toggleMute: overlayMock.toggleMute,
    toggleShuffle: overlayMock.toggleShuffle,
    cycleRepeatMode: overlayMock.cycleRepeatMode,
    playPrevious: overlayMock.playPrevious,
    playNext: overlayMock.playNext,
    selectOutputDevice: overlayMock.selectOutputDevice,
    dismissError: overlayMock.dismissError,
  },
}));

import BottomPlayerBar from '../lib/player/BottomPlayerBar.svelte';
import NowPlayingOverlay from '../lib/player/NowPlayingOverlay.svelte';

function renderPlayerShell() {
  render(BottomPlayerBar);
  render(NowPlayingOverlay);
}

describe('NowPlayingOverlay', () => {
  beforeEach(() => {
    overlayMock.reset();
  });

  afterEach(() => {
    cleanup();
  });

  it('does not render when the overlay is closed', () => {
    render(NowPlayingOverlay);

    expect(screen.queryByRole('region', { name: '正在播放' })).toBeNull();
  });

  it('opens on the lyrics tab with a stable accessible name', async () => {
    render(NowPlayingOverlay);

    overlayMock.nowPlayingState.set({ isOpen: true, activeTab: 'lyrics' });

    expect(await screen.findByRole('region', { name: '正在播放' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '歌词' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: '队列' }).getAttribute('aria-selected')).toBe('false');
  });

  it('moves focus into the header when the overlay opens', async () => {
    render(NowPlayingOverlay);

    overlayMock.nowPlayingState.set({ isOpen: true, activeTab: 'lyrics' });

    const backButton = await screen.findByRole('button', { name: '返回播放器' });

    await waitFor(() => {
      expect(document.activeElement).toBe(backButton);
    });
  });

  it('refreshes the queue when the queue tab is activated', async () => {
    overlayMock.nowPlayingState.set({ isOpen: true, activeTab: 'lyrics' });
    render(NowPlayingOverlay);

    const queueTab = await screen.findByRole('tab', { name: '队列' });
    await fireEvent.click(queueTab);

    expect(overlayMock.setActiveTab).toHaveBeenCalledWith('queue');
    expect(overlayMock.refreshQueue).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(queueTab.getAttribute('aria-selected')).toBe('true');
    });
  });

  it('closes when Escape is pressed', async () => {
    overlayMock.nowPlayingState.set({ isOpen: true, activeTab: 'lyrics' });
    render(NowPlayingOverlay);

    expect(await screen.findByRole('region', { name: '正在播放' })).toBeTruthy();

    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(overlayMock.close).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: '正在播放' })).toBeNull();
    });
  });

  it('does not open the overlay from the bottom bar when there is no current track', async () => {
    overlayMock.setCurrentTrack(null);
    renderPlayerShell();

    const trigger = screen.getByRole('button', { name: '当前没有正在播放内容' });
    expect((trigger as HTMLButtonElement).disabled).toBe(true);

    await fireEvent.click(trigger);

    expect(overlayMock.toggle).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: '正在播放' })).toBeNull();
  });

  it('opens the overlay when the bottom bar trigger is clicked with a current track', async () => {
    renderPlayerShell();

    const trigger = screen.getByRole('button', { name: /^打开正在播放：/ });
    await fireEvent.click(trigger);

    expect(overlayMock.toggle).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('region', { name: '正在播放' })).toBeTruthy();
  });

  it('disables the bottom bar queue trigger while the overlay is open', async () => {
    renderPlayerShell();

    const trigger = screen.getByRole('button', { name: /^打开正在播放：/ });
    await fireEvent.click(trigger);
    await screen.findByRole('region', { name: '正在播放' });

    const queueButton = screen.getByRole('button', { name: '队列' });
    overlayMock.refreshQueue.mockClear();

    expect((queueButton as HTMLButtonElement).disabled).toBe(true);

    await fireEvent.click(queueButton);

    expect(overlayMock.refreshQueue).not.toHaveBeenCalled();
    expect(screen.queryByText('接下来播放')).toBeNull();
  });

  it('returns focus to the bottom bar trigger when the overlay closes', async () => {
    renderPlayerShell();

    const trigger = screen.getByRole('button', { name: /^打开正在播放：/ });
    const focusSpy = vi.spyOn(trigger, 'focus');

    await fireEvent.click(trigger);

    const backButton = await screen.findByRole('button', { name: '返回播放器' });

    await waitFor(() => {
      expect(document.activeElement).toBe(backButton);
    });

    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(overlayMock.close).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: '正在播放' })).toBeNull();
      expect(focusSpy).toHaveBeenCalledTimes(1);
    });
  });
});
