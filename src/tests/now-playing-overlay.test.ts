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

  const nowPlayingState = createStore<{ isOpen: boolean; activeTab: 'lyrics' | 'queue' }>({
    isOpen: false,
    activeTab: 'lyrics',
  });
  const playbackState = createStore({
    currentTrack,
    queueTracks: [queuedTrack],
  });

  const close = vi.fn(() => {
    nowPlayingState.update((state) => ({ ...state, isOpen: false }));
  });
  const setActiveTab = vi.fn((tab: 'lyrics' | 'queue') => {
    nowPlayingState.update((state) => ({ ...state, activeTab: tab }));
  });
  const refreshQueue = vi.fn(async () => undefined);
  const clearQueue = vi.fn(async () => undefined);
  const removeQueueTrack = vi.fn(async () => undefined);
  const playQueueTrack = vi.fn(async () => undefined);

  function reset() {
    nowPlayingState.set({ isOpen: false, activeTab: 'lyrics' });
    playbackState.set({ currentTrack, queueTracks: [queuedTrack] });
    close.mockClear();
    setActiveTab.mockClear();
    refreshQueue.mockClear();
    clearQueue.mockClear();
    removeQueueTrack.mockClear();
    playQueueTrack.mockClear();
  }

  return {
    nowPlayingState,
    playbackState,
    close,
    setActiveTab,
    refreshQueue,
    clearQueue,
    removeQueueTrack,
    playQueueTrack,
    reset,
  };
});

vi.mock('../lib/player/now-playing', () => ({
  nowPlayingUi: {
    state: overlayMock.nowPlayingState,
    close: overlayMock.close,
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
  },
}));

import NowPlayingOverlay from '../lib/player/NowPlayingOverlay.svelte';

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
});
