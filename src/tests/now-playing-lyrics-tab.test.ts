// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import NowPlayingLyricsTab from '../lib/player/NowPlayingLyricsTab.svelte';
import type { PlaybackStateInfo, Track } from '../lib/types';

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
    lyrics: null,
    ...overrides,
    library_root: overrides.library_root ?? null,
    file_mtime_ms: overrides.file_mtime_ms ?? null,
    availability: overrides.availability ?? 'available',
    missing_since: overrides.missing_since ?? null,
  };
}

function createPlaybackState(
  overrides: Partial<Extract<PlaybackStateInfo, { state: 'playing' | 'paused' }>> = {},
  state: 'playing' | 'paused' = 'playing'
): PlaybackStateInfo {
  return {
    state,
    position: overrides.position ?? 0,
    duration: overrides.duration ?? 180,
  };
}

function configureTimedLayout(scrollRegion: HTMLElement, lineTexts: string[], scrollTop = 10): void {
  let currentScrollTop = scrollTop;

  Object.defineProperty(scrollRegion, 'clientHeight', {
    configurable: true,
    value: 90,
  });
  Object.defineProperty(scrollRegion, 'scrollTop', {
    configurable: true,
    get: () => currentScrollTop,
    set: (value: number) => {
      currentScrollTop = value;
    },
  });

  lineTexts.forEach((text, index) => {
    const line = getLyricsLine(text);
    Object.defineProperty(line, 'offsetTop', {
      configurable: true,
      value: index * 40,
    });
    Object.defineProperty(line, 'offsetHeight', {
      configurable: true,
      value: 40,
    });
  });
}

function getLyricsLine(text: string): HTMLElement {
  return screen.getByText(text).closest('[data-lyrics-line]') as HTMLElement;
}

describe('NowPlayingLyricsTab', () => {
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  let scrollIntoViewSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollIntoViewSpy = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewSpy,
    });
  });

  afterEach(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: originalScrollIntoView,
    });
    vi.useRealTimers();
    cleanup();
  });

  it('renders the active timed lyrics line and follows progress changes without auto-scrolling while paused', async () => {
    const timedTrack = createTrack({
      lyrics: '[00:01.00]第一句\n[00:04.20]第二句\n[00:08.00]第三句',
    });

    const view = render(NowPlayingLyricsTab, {
      track: timedTrack,
      progress: 1.2,
      playbackState: createPlaybackState({ position: 1.2 }),
      onSeekToTimestamp: vi.fn(),
    });

    expect(getLyricsLine('第一句').getAttribute('aria-current')).toBe('true');

    scrollIntoViewSpy.mockClear();
    await view.rerender({
      track: timedTrack,
      progress: 4.6,
      playbackState: createPlaybackState({ position: 4.6 }),
      onSeekToTimestamp: vi.fn(),
    });

    await waitFor(() => {
      expect(getLyricsLine('第二句').getAttribute('aria-current')).toBe('true');
    });
    expect(scrollIntoViewSpy).toHaveBeenCalled();

    scrollIntoViewSpy.mockClear();
    await view.rerender({
      track: timedTrack,
      progress: 8.1,
      playbackState: createPlaybackState({ position: 8.1 }, 'paused'),
      onSeekToTimestamp: vi.fn(),
    });

    await waitFor(() => {
      expect(getLyricsLine('第三句').getAttribute('aria-current')).toBe('true');
    });
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();

    await view.rerender({
      track: timedTrack,
      progress: 8.1,
      playbackState: createPlaybackState({ position: 8.1 }, 'playing'),
      onSeekToTimestamp: vi.fn(),
    });

    await waitFor(() => {
      expect(scrollIntoViewSpy).toHaveBeenCalled();
    });
  });

  it('renders plain lyrics without browse guide affordances', () => {
    render(NowPlayingLyricsTab, {
      track: createTrack({ lyrics: '第一行\n第二行' }),
      progress: 12,
      playbackState: createPlaybackState({ position: 12 }),
      onSeekToTimestamp: vi.fn(),
    });

    expect(screen.getByText('第一行')).toBeTruthy();
    expect(screen.getByText('第二行')).toBeTruthy();
    expect(screen.queryByTestId('lyrics-guide-line')).toBeNull();
    expect(screen.queryByRole('button', { name: /跳转到/ })).toBeNull();
  });

  it('renders an empty state when no lyrics are available', () => {
    render(NowPlayingLyricsTab, {
      track: createTrack({ lyrics: null }),
      progress: 0,
      playbackState: { state: 'stopped' },
      onSeekToTimestamp: vi.fn(),
    });

    expect(screen.getByText('暂无歌词')).toBeTruthy();
    expect(screen.getByText('当前歌曲还没有可显示的歌词内容。')).toBeTruthy();
  });

  it('enters browse mode on scroll, seeks from the right-side pill, auto-resumes follow mode after 5 seconds, and resets browse state when the track changes', async () => {
    vi.useFakeTimers();

    const onSeekToTimestamp = vi.fn();
    const timedTrack = createTrack({
      id: 'track-a',
      lyrics: '[00:01.00]第一句\n[00:04.20]第二句\n[00:08.00]第三句',
    });

    const view = render(NowPlayingLyricsTab, {
      track: timedTrack,
      progress: 1.2,
      playbackState: createPlaybackState({ position: 1.2 }),
      onSeekToTimestamp,
    });

    const scrollRegion = screen.getByTestId('lyrics-scroll-region');
    configureTimedLayout(scrollRegion, ['第一句', '第二句', '第三句']);

    await fireEvent.wheel(scrollRegion);
    const seekButton = screen.getByRole('button', { name: '跳转到 0:04' });
    expect(seekButton).toBeTruthy();

    await fireEvent.click(seekButton);

    expect(onSeekToTimestamp).toHaveBeenCalledWith(4);
    expect(screen.queryByRole('button', { name: '跳转到 0:04' })).toBeNull();

    await fireEvent.wheel(scrollRegion);
    expect(screen.getByRole('button', { name: '跳转到 0:04' })).toBeTruthy();

    scrollIntoViewSpy.mockClear();
    await vi.advanceTimersByTimeAsync(5_000);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '跳转到 0:04' })).toBeNull();
    });
    expect(getLyricsLine('第一句').getAttribute('aria-current')).toBe('true');
    expect(scrollIntoViewSpy).toHaveBeenCalled();

    const nextTrack = createTrack({
      id: 'track-b',
      lyrics: '[00:02.00]新的第一句\n[00:06.00]新的第二句',
    });

    await view.rerender({
      track: nextTrack,
      progress: 6.2,
      playbackState: createPlaybackState({ position: 6.2 }),
      onSeekToTimestamp,
    });

    await waitFor(() => {
      expect(getLyricsLine('新的第二句').getAttribute('aria-current')).toBe('true');
    });
    expect(screen.queryByTestId('lyrics-guide-line')).toBeNull();
    expect(screen.queryByRole('button', { name: /跳转到/ })).toBeNull();
  });
});
