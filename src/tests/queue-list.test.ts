// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import QueueList from '../lib/player/QueueList.svelte';
import type { PlaybackStateInfo, Track } from '../lib/types';

function createTrack(overrides: Pick<Track, 'id' | 'title'> & Partial<Track>): Track {
  const { id, title, ...rest } = overrides;

  return {
    id,
    title,
    duration: 180,
    path: `/music/${id}.flac`,
    size: 1024,
    format: 'flac',
    bitrate: 320,
    sample_rate: 48_000,
    channels: 2,
    play_count: 0,
    date_added: '2026-03-01T00:00:00.000Z',
    ...rest,
    artist_name: rest.artist_name ?? 'Signal Bloom',
    album_title: rest.album_title ?? 'Night Transit',
    availability: rest.availability ?? 'available',
    missing_since: rest.missing_since ?? null,
    library_root: rest.library_root ?? null,
    file_mtime_ms: rest.file_mtime_ms ?? null,
  };
}

function getQueueRow(title: string): HTMLElement {
  const titleNode = screen.getByText(title);
  const row = titleNode.closest('li');

  if (!(row instanceof HTMLElement)) {
    throw new Error(`Could not find queue row for ${title}`);
  }

  return row;
}

function getQueueItemButton(title: string): HTMLButtonElement {
  const titleNode = screen.getByText(title);
  const button = titleNode.closest('button');

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Could not find queue button for ${title}`);
  }

  return button;
}

const pausedState: PlaybackStateInfo = { state: 'paused', position: 24, duration: 180 };
const playingState: PlaybackStateInfo = { state: 'playing', position: 24, duration: 180 };

const availableTrack = createTrack({
  id: 'queue-available',
  title: 'Open Signal',
});

const missingTrack = createTrack({
  id: 'queue-missing',
  title: 'Ghost Platform',
  availability: 'missing',
  missing_since: '2026-04-03T00:00:00.000Z',
});

afterEach(() => {
  cleanup();
});

describe('QueueList', () => {
  it('keeps missing non-current rows visible and removable while blocking replay selection', async () => {
    const onSelect = vi.fn();
    const onRemove = vi.fn();
    const onClear = vi.fn();

    render(QueueList, {
      props: {
        tracks: [missingTrack, availableTrack],
        currentTrackId: availableTrack.id,
        playbackState: pausedState,
        onSelect,
        onRemove,
        onClear,
      } as any,
    });

    const missingRow = getQueueRow(missingTrack.title);
    const missingButton = getQueueItemButton(missingTrack.title);

    expect(missingRow.getAttribute('data-availability')).toBe('missing');
    expect(within(missingRow).getByText('文件缺失')).toBeTruthy();
    expect(within(missingRow).getByText('文件缺失，无法播放')).toBeTruthy();
    expect(missingButton.disabled).toBe(true);

    await fireEvent.click(missingButton);
    expect(onSelect).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByRole('button', { name: `从队列移除 ${missingTrack.title}` }));
    expect(onRemove).toHaveBeenCalledWith(missingTrack);

    await fireEvent.click(screen.getByRole('button', { name: '清空队列' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('keeps the current missing row compact and replay-blocked in the queue even while playback continues', () => {
    render(QueueList, {
      props: {
        tracks: [missingTrack, availableTrack],
        currentTrackId: missingTrack.id,
        playbackState: playingState,
      } as any,
    });

    const currentRow = getQueueRow(missingTrack.title);
    const currentButton = getQueueItemButton(missingTrack.title);

    expect(currentButton.disabled).toBe(false);
    expect(within(currentRow).getByText('文件已缺失，无法重新播放')).toBeTruthy();
    expect(within(currentRow).queryByText('文件已缺失，当前播放仍可继续，结束后无法重新播放')).toBeNull();
    expect(within(currentRow).queryByText('文件缺失，无法播放')).toBeNull();
  });

  it('drops missing badges and blocked semantics when a row is restored on the next render', () => {
    const firstRender = render(QueueList, {
      props: {
        tracks: [missingTrack],
        currentTrackId: null,
        playbackState: pausedState,
      } as any,
    });

    expect(getQueueItemButton(missingTrack.title).disabled).toBe(true);
    expect(screen.getByText('文件缺失')).toBeTruthy();
    expect(screen.getByText('文件缺失，无法播放')).toBeTruthy();

    firstRender.unmount();

    render(QueueList, {
      props: {
        tracks: [{ ...missingTrack, availability: 'available', missing_since: null }],
        currentTrackId: null,
        playbackState: pausedState,
      } as any,
    });

    expect(getQueueItemButton(missingTrack.title).disabled).toBe(false);
    expect(screen.queryByText('文件缺失')).toBeNull();
    expect(screen.queryByText('文件缺失，无法播放')).toBeNull();
  });
});
