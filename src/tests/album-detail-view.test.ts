// @vitest-environment jsdom

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const libraryApiMock = vi.hoisted(() => ({
  getAlbum: vi.fn(),
  getTracksByAlbum: vi.fn(),
}));

const playbackApiMock = vi.hoisted(() => ({
  playTrack: vi.fn(),
  setQueue: vi.fn(),
}));

vi.mock('../lib/api/library', () => ({
  getAlbum: libraryApiMock.getAlbum,
  getTracksByAlbum: libraryApiMock.getTracksByAlbum,
}));

vi.mock('../lib/api/playback', () => ({
  playTrack: playbackApiMock.playTrack,
  setQueue: playbackApiMock.setQueue,
}));

import AlbumDetailView from '../lib/views/AlbumDetailView.svelte';
import type { Album, Track } from '../lib/types';

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const albumDetailViewPath = path.resolve(testsRoot, '../lib/views/AlbumDetailView.svelte');
const playlistDetailViewPath = path.resolve(testsRoot, '../lib/views/PlaylistDetailView.svelte');
const trackActionRowPath = path.resolve(testsRoot, '../lib/components/library/TrackActionRow.svelte');

async function readViewSource(pathname: string): Promise<string> {
  return readFile(pathname, 'utf8');
}

const baseAlbum: Album = {
  id: 'album-1',
  title: 'Night Transit',
  artist_name: 'Signal Bloom',
  track_count: 3,
  duration: 690,
  date_added: '2026-03-01T00:00:00.000Z',
};

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
    artist_name: rest.artist_name ?? baseAlbum.artist_name ?? null,
    album_title: rest.album_title ?? baseAlbum.title ?? null,
    library_root: rest.library_root ?? null,
    file_mtime_ms: rest.file_mtime_ms ?? null,
    availability: rest.availability ?? 'available',
    missing_since: rest.missing_since ?? null,
  };
}

const availableIntroTrack = createTrack({
  id: 'track-1',
  title: 'Open Signal',
  track_number: 1,
});

const missingInterludeTrack = createTrack({
  id: 'track-2',
  title: 'Missing Interlude',
  track_number: 2,
  availability: 'missing',
  missing_since: '2026-04-03T00:00:00.000Z',
});

const availableOutroTrack = createTrack({
  id: 'track-3',
  title: 'Last Train',
  track_number: 3,
});

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function getRow(title: string): HTMLElement {
  const cell = screen.getByText(title);
  const row = cell.closest('[role="row"]');

  if (!(row instanceof HTMLElement)) {
    throw new Error(`Could not find row for track ${title}`);
  }

  return row;
}

function getHintText(element: HTMLElement): string {
  const describedByIds = element.getAttribute('aria-describedby')?.split(/\s+/).filter(Boolean) ?? [];
  const hintCandidates = [
    element.getAttribute('title'),
    element.getAttribute('aria-description'),
    ...describedByIds.map((id) => document.getElementById(id)?.textContent),
    element.textContent,
  ];

  return hintCandidates
    .map((text) => text?.trim() ?? '')
    .filter((text) => text.length > 0)
    .join(' ');
}

describe('AlbumDetailView', () => {
  beforeEach(() => {
    libraryApiMock.getAlbum.mockReset().mockResolvedValue(baseAlbum);
    libraryApiMock.getTracksByAlbum.mockReset().mockResolvedValue([
      availableIntroTrack,
      missingInterludeTrack,
      availableOutroTrack,
    ]);
    playbackApiMock.playTrack.mockReset().mockResolvedValue(undefined);
    playbackApiMock.setQueue.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it('routes album and playlist detail rows through a shared action-row seam with native text selection disabled', async () => {
    const [albumSource, playlistSource, rowSource] = await Promise.all([
      readViewSource(albumDetailViewPath),
      readViewSource(playlistDetailViewPath),
      readViewSource(trackActionRowPath),
    ]);

    expect(albumSource).toContain('TrackActionRow');
    expect(playlistSource).toContain('TrackActionRow');
    expect(rowSource).toContain('user-select: none');
    expect(rowSource).toContain('-webkit-user-select: none');
    expect(rowSource).toContain('var(--state-selected)');
    expect(rowSource).toContain('var(--state-danger)');
    expect(rowSource).toContain('var(--focus-ring)');
  });

  it('exposes action-row focus semantics on album tracks without collapsing missing-state accessibility', async () => {
    render(AlbumDetailView, { props: { albumId: baseAlbum.id } });

    await screen.findByRole('heading', { name: baseAlbum.title });
    const availableRow = getRow(availableIntroTrack.title);
    const missingRow = getRow(missingInterludeTrack.title);

    expect(availableRow.getAttribute('data-surface')).toBe('action-row');
    expect(availableRow.getAttribute('data-active')).toBe('false');

    await fireEvent.focus(availableRow);

    expect(availableRow.getAttribute('data-active')).toBe('true');
    expect(missingRow.getAttribute('data-availability')).toBe('missing');
    expect(missingRow.getAttribute('aria-disabled')).toBe('true');
  });

  it('filters hero play to available album tracks and starts from the first playable track', async () => {
    render(AlbumDetailView, { props: { albumId: baseAlbum.id } });

    await screen.findByRole('heading', { name: baseAlbum.title });
    await fireEvent.click(screen.getByRole('button', { name: /play/i }));

    expect(playbackApiMock.setQueue).toHaveBeenCalledWith([
      availableIntroTrack,
      availableOutroTrack,
    ]);
    expect(playbackApiMock.playTrack).toHaveBeenCalledWith(availableIntroTrack);
  });

  it('keeps missing album rows visible with disabled semantics and blocks double-click plus keyboard play', async () => {
    render(AlbumDetailView, { props: { albumId: baseAlbum.id } });

    await screen.findByRole('heading', { name: baseAlbum.title });
    const missingRow = getRow(missingInterludeTrack.title);

    expect(missingRow.getAttribute('data-availability')).toBe('missing');
    expect(missingRow.getAttribute('aria-disabled')).toBe('true');
    expect(within(missingRow).getByText('文件缺失')).not.toBeNull();
    expect(getHintText(missingRow)).toMatch(/文件缺失/);
    expect(getHintText(missingRow)).toMatch(/无法播放/);

    await fireEvent.dblClick(missingRow);
    expect(playbackApiMock.setQueue).not.toHaveBeenCalled();
    expect(playbackApiMock.playTrack).not.toHaveBeenCalled();
    expect(screen.getByText('当前歌曲文件缺失，无法播放')).not.toBeNull();

    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    missingRow.dispatchEvent(enterEvent);
    await flushPromises();

    const spaceEvent = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    missingRow.dispatchEvent(spaceEvent);
    await flushPromises();

    expect(enterEvent.defaultPrevented).toBe(true);
    expect(spaceEvent.defaultPrevented).toBe(true);
    expect(playbackApiMock.setQueue).not.toHaveBeenCalled();
    expect(playbackApiMock.playTrack).not.toHaveBeenCalled();
  });

  it('seeds row playback with only available album tracks when an available row is activated', async () => {
    render(AlbumDetailView, { props: { albumId: baseAlbum.id } });

    await screen.findByRole('heading', { name: baseAlbum.title });
    await fireEvent.dblClick(getRow(availableOutroTrack.title));

    expect(playbackApiMock.setQueue).toHaveBeenCalledWith([
      availableIntroTrack,
      availableOutroTrack,
    ]);
    expect(playbackApiMock.playTrack).toHaveBeenCalledWith(availableOutroTrack);
  });

  it('treats all-missing albums as non-playable at the hero level', async () => {
    libraryApiMock.getTracksByAlbum.mockResolvedValueOnce([
      missingInterludeTrack,
      createTrack({
        id: 'track-4',
        title: 'Ghost Platform',
        track_number: 4,
        availability: 'missing',
      }),
    ]);

    render(AlbumDetailView, { props: { albumId: baseAlbum.id } });

    const playButton = await screen.findByRole('button', { name: /play/i });
    expect((playButton as HTMLButtonElement).disabled).toBe(true);
    expect(getHintText(playButton)).toMatch(/无法播放/);
  });
});
