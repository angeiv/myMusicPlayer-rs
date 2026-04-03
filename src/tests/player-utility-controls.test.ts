// @vitest-environment jsdom

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Track } from '../lib/types';

const artworkMock = vi.hoisted(() => ({
  isTauri: false,
  convertFileSrc: vi.fn((artworkPath: string) => `asset://converted${artworkPath}`),
}));

const playerBarMock = vi.hoisted(() => {
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

  const trackWithArtwork: Track = {
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
    album_title: "Hurry Up, We're Dreaming",
    genre: 'Electronic',
    artwork_path: '/covers/midnight-city.jpg' as string | null,
    availability: 'available',
    missing_since: null,
    play_count: 0,
    date_added: '2026-03-01T00:00:00.000Z',
  };

  const createPlaybackSnapshot = (track: typeof trackWithArtwork | null) => ({
    currentTrack: track,
    playbackState: { state: track ? 'paused' : 'stopped' },
    volume: 1,
    progress: 0,
    duration: track?.duration ?? 0,
    queueTracks: [],
    outputDevices: [],
    selectedDeviceId: 'default',
    shuffleEnabled: false,
    repeatMode: 'off' as const,
    uiError: '',
  });

  const playbackState = createStore(createPlaybackSnapshot(trackWithArtwork));
  const nowPlayingState = createStore({ isOpen: false });

  const toggle = vi.fn(() => {
    nowPlayingState.update((state) => ({ ...state, isOpen: !state.isOpen }));
  });

  function setCurrentTrack(track: typeof trackWithArtwork | null) {
    playbackState.update((state) => ({
      ...state,
      currentTrack: track,
      playbackState: { state: track ? 'paused' : 'stopped' },
      duration: track?.duration ?? 0,
    }));
  }

  function setPlaybackStateInfo(
    nextPlaybackState:
      | { state: 'stopped' }
      | { state: 'playing'; position: number; duration: number }
      | { state: 'paused'; position: number; duration: number }
      | { state: 'error'; message: string }
  ) {
    playbackState.update((state) => ({
      ...state,
      playbackState: nextPlaybackState,
      duration:
        nextPlaybackState.state === 'playing' || nextPlaybackState.state === 'paused'
          ? nextPlaybackState.duration
          : state.currentTrack?.duration ?? 0,
    }));
  }

  function reset() {
    playbackState.set(createPlaybackSnapshot(trackWithArtwork));
    nowPlayingState.set({ isOpen: false });
    toggle.mockClear();
  }

  return {
    playbackState,
    nowPlayingState,
    toggle,
    setCurrentTrack,
    setPlaybackStateInfo,
    reset,
    trackWithArtwork,
    togglePlayPause: vi.fn(async () => undefined),
    promptAndPlayFile: vi.fn(async () => undefined),
    commitSeek: vi.fn(async () => undefined),
    beginSeek: vi.fn(() => undefined),
    previewSeek: vi.fn(() => undefined),
    setVolume: vi.fn(async () => undefined),
    toggleMute: vi.fn(async () => undefined),
    toggleShuffle: vi.fn(async () => undefined),
    cycleRepeatMode: vi.fn(async () => undefined),
    playPrevious: vi.fn(async () => undefined),
    playNext: vi.fn(async () => undefined),
    playQueueTrack: vi.fn(async () => undefined),
    refreshQueue: vi.fn(async () => undefined),
    removeQueueTrack: vi.fn(async () => undefined),
    clearQueue: vi.fn(async () => undefined),
    selectOutputDevice: vi.fn(async () => undefined),
    dismissError: vi.fn(() => undefined),
  };
});

vi.mock('../lib/utils/env', () => ({
  get isTauri() {
    return artworkMock.isTauri;
  },
}));

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: artworkMock.convertFileSrc,
}));

vi.mock('../lib/player/now-playing', () => ({
  nowPlayingUi: {
    state: playerBarMock.nowPlayingState,
    toggle: playerBarMock.toggle,
  },
}));

vi.mock('../lib/player/sharedPlayback', () => ({
  sharedPlayback: {
    subscribe: playerBarMock.playbackState.subscribe,
    togglePlayPause: playerBarMock.togglePlayPause,
    promptAndPlayFile: playerBarMock.promptAndPlayFile,
    commitSeek: playerBarMock.commitSeek,
    beginSeek: playerBarMock.beginSeek,
    previewSeek: playerBarMock.previewSeek,
    setVolume: playerBarMock.setVolume,
    toggleMute: playerBarMock.toggleMute,
    toggleShuffle: playerBarMock.toggleShuffle,
    cycleRepeatMode: playerBarMock.cycleRepeatMode,
    playPrevious: playerBarMock.playPrevious,
    playNext: playerBarMock.playNext,
    playQueueTrack: playerBarMock.playQueueTrack,
    refreshQueue: playerBarMock.refreshQueue,
    removeQueueTrack: playerBarMock.removeQueueTrack,
    clearQueue: playerBarMock.clearQueue,
    selectOutputDevice: playerBarMock.selectOutputDevice,
    dismissError: playerBarMock.dismissError,
  },
}));

import BottomPlayerBar from '../lib/player/BottomPlayerBar.svelte';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const playerBarPath = path.join(root, 'lib/player/BottomPlayerBar.svelte');

async function readPlayerBar(): Promise<string> {
  return readFile(playerBarPath, 'utf8');
}

beforeEach(() => {
  artworkMock.isTauri = false;
  artworkMock.convertFileSrc.mockClear();
  playerBarMock.reset();
});

afterEach(() => {
  cleanup();
});

describe('BottomPlayerBar cover art rendering', () => {
  it('renders the current track artwork decoratively when artwork_path is available', () => {
    render(BottomPlayerBar);

    const trigger = screen.getByRole('button', { name: /^打开正在播放：/ });
    const artwork = trigger.querySelector('img');

    expect(artwork?.tagName).toBe('IMG');
    expect(artwork?.getAttribute('src')).toBe('/covers/midnight-city.jpg');
    expect(artwork?.getAttribute('alt')).toBe('');
    expect(within(trigger).queryByRole('img')).toBeNull();
    expect(within(trigger).queryByTestId('cover-art-placeholder')).toBeNull();
  });

  it('renders continuity copy only while a missing current track is still playing', async () => {
    playerBarMock.setCurrentTrack({
      ...playerBarMock.trackWithArtwork,
      availability: 'missing',
      missing_since: '2026-04-03T00:00:00.000Z',
    });
    playerBarMock.setPlaybackStateInfo({
      state: 'playing',
      position: 24,
      duration: playerBarMock.trackWithArtwork.duration,
    });

    render(BottomPlayerBar);

    expect(
      screen.getByText('文件已缺失，当前播放仍可继续，结束后无法重新播放')
    ).toBeTruthy();
    expect(screen.queryByText('文件已缺失，无法重新播放')).toBeNull();
    expect(screen.queryByText('文件缺失，无法播放')).toBeNull();

    playerBarMock.setCurrentTrack({
      ...playerBarMock.trackWithArtwork,
      availability: 'available',
      missing_since: null,
    });

    await waitFor(() => {
      expect(screen.queryByText('文件已缺失，当前播放仍可继续，结束后无法重新播放')).toBeNull();
    });
  });

  it('renders replay-blocked copy for a missing paused current track', () => {
    playerBarMock.setCurrentTrack({
      ...playerBarMock.trackWithArtwork,
      availability: 'missing',
      missing_since: '2026-04-03T00:00:00.000Z',
    });

    render(BottomPlayerBar);

    expect(screen.getByText('文件已缺失，无法重新播放')).toBeTruthy();
    expect(screen.queryByText('文件已缺失，当前播放仍可继续，结束后无法重新播放')).toBeNull();
    expect(screen.queryByText('文件缺失，无法播放')).toBeNull();
  });

  it('renders the fallback decoratively when the current track has no artwork_path', () => {
    playerBarMock.setCurrentTrack({
      ...playerBarMock.trackWithArtwork,
      artwork_path: null,
    });

    render(BottomPlayerBar);

    const trigger = screen.getByRole('button', { name: /^打开正在播放：/ });
    const fallback = within(trigger).getByTestId('cover-art-placeholder');

    expect(trigger.querySelector('img')).toBeNull();
    expect(within(trigger).queryByRole('img')).toBeNull();
    expect(fallback.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('player utility controls styling', () => {
  it('renders queue, volume, and device as unified icon buttons without emoji labels', async () => {
    const source = await readPlayerBar();

    expect(source).toMatch(/class=\"utility-trigger utility-icon-button\"[^>]*aria-label=\"队列\"/);
    expect(source).toMatch(/class=\"utility-trigger utility-icon-button volume-trigger\"/);
    expect(source).toMatch(/class=\"utility-trigger utility-icon-button\"[^>]*aria-label=\"输出设备\"/);
    expect(source).not.toMatch(/class=\"utility-trigger utility-icon-button\"[^>]*aria-label=\"歌词\"/);
    expect(source).not.toContain('showLyricsPanel');
    expect(source).not.toContain('lyrics-panel');
    expect(source).not.toContain('📃');
    expect(source).not.toContain('🎧');
    expect(source).not.toContain('📝');
    expect(source).not.toContain('🔇');
    expect(source).not.toContain('🔈');
    expect(source).not.toContain('🔊');
    expect(source).not.toMatch(/volume-trigger-value/);
    expect(source).toMatch(/\.utility-icon-button\s*\{[\s\S]*width:\s*44px;/);
    expect(source).toMatch(/\.utility-icon-button\s*\{[\s\S]*height:\s*44px;/);
    expect(source).toMatch(/\.utility-icon-button\s*\{[\s\S]*padding:\s*0;/);
    expect(source).toMatch(/\.utility-icon-button\s*\{[\s\S]*border-radius:\s*16px;/);
  });

  it('renders the shuffle, previous, play-pause, next, and repeat controls as svg icons', async () => {
    const source = await readPlayerBar();

    expect(source).toMatch(/class=\"transport-icon\"/);
    expect(source).toMatch(/aria-label=\"切换随机播放\"/);
    expect(source).toMatch(/aria-label=\"上一首\"/);
    expect(source).toMatch(/aria-label=\"播放或暂停\"/);
    expect(source).toMatch(/aria-label=\"下一首\"/);
    expect(source).toMatch(/aria-label=\"切换重复模式\"/);
    expect(source).not.toContain('🔀');
    expect(source).not.toContain('⏮');
    expect(source).not.toContain('▶');
    expect(source).not.toContain('⏸');
    expect(source).not.toContain('⏭');
    expect(source).not.toContain('🔂');
    expect(source).not.toContain('🔁');
    expect(source).toMatch(/\.transport-icon\s*\{[\s\S]*width:\s*20px;/);
    expect(source).toMatch(/\.transport-icon\s*\{[\s\S]*height:\s*20px;/);
  });
});
