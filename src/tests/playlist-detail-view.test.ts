// @vitest-environment jsdom

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const playlistApiMock = vi.hoisted(() => ({
  getPlaylist: vi.fn(),
  getPlaylistTracks: vi.fn(),
  removeFromPlaylist: vi.fn(),
  updatePlaylistMetadata: vi.fn(),
}));

const playbackApiMock = vi.hoisted(() => ({
  playTrack: vi.fn(),
  setQueue: vi.fn(),
}));

vi.mock('../lib/api/playlist', () => ({
  getPlaylist: playlistApiMock.getPlaylist,
  getPlaylistTracks: playlistApiMock.getPlaylistTracks,
  removeFromPlaylist: playlistApiMock.removeFromPlaylist,
  updatePlaylistMetadata: playlistApiMock.updatePlaylistMetadata,
}));

vi.mock('../lib/api/playback', () => ({
  playTrack: playbackApiMock.playTrack,
  setQueue: playbackApiMock.setQueue,
}));

import PlaylistDetailView from '../lib/views/PlaylistDetailView.svelte';
import type { Playlist, Track } from '../lib/types';

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const playlistDetailViewPath = path.resolve(testsRoot, '../lib/views/PlaylistDetailView.svelte');
const trackActionRowPath = path.resolve(testsRoot, '../lib/components/library/TrackActionRow.svelte');

async function readViewSource(pathname: string): Promise<string> {
  return readFile(pathname, 'utf8');
}

const basePlaylist: Playlist = {
  id: 'playlist-1',
  name: 'After Hours',
  description: 'Late-night rotation',
  track_ids: ['track-1'],
  created_at: '2026-03-01T00:00:00.000Z',
  updated_at: '2026-03-01T00:00:00.000Z',
};

function createTrack(overrides: Pick<Track, 'id' | 'title'> & Partial<Track>): Track {
  const { id, title, ...rest } = overrides;

  return {
    id,
    title,
    duration: 180,
    path: `/music/${id}.flac`,
    size: 123,
    format: 'flac',
    bitrate: 320,
    sample_rate: 48_000,
    channels: 2,
    play_count: 0,
    date_added: '2026-03-01T00:00:00.000Z',
    artist_name: 'Night Engines',
    album_title: 'Late Transit',
    ...rest,
    library_root: rest.library_root ?? null,
    file_mtime_ms: rest.file_mtime_ms ?? null,
    availability: rest.availability ?? 'available',
    missing_since: rest.missing_since ?? null,
  };
}

const missingTrack = createTrack({
  id: 'track-1',
  title: 'Signal Bloom',
  availability: 'missing',
  missing_since: '2026-04-03T00:00:00.000Z',
});

const availableTrack = createTrack({
  id: 'track-2',
  title: 'Neon Lines',
});

const availableEncoreTrack = createTrack({
  id: 'track-3',
  title: 'Velvet Exit',
});

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

describe('PlaylistDetailView', () => {
  beforeEach(() => {
    playlistApiMock.getPlaylist.mockReset();
    playlistApiMock.getPlaylistTracks.mockReset();
    playlistApiMock.removeFromPlaylist.mockReset().mockResolvedValue(null);
    playlistApiMock.updatePlaylistMetadata.mockReset().mockResolvedValue(undefined);
    playbackApiMock.playTrack.mockReset().mockResolvedValue(undefined);
    playbackApiMock.setQueue.mockReset().mockResolvedValue(undefined);

    playlistApiMock.getPlaylist
      .mockResolvedValueOnce(basePlaylist)
      .mockResolvedValueOnce({
        ...basePlaylist,
        name: 'Renamed Playlist',
        updated_at: '2026-03-02T00:00:00.000Z',
      });
    playlistApiMock.getPlaylistTracks.mockResolvedValue([
      missingTrack,
      availableTrack,
      availableEncoreTrack,
    ]);

    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('prompt', vi.fn(() => 'Renamed Playlist'));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('routes playlist detail rows through the shared action-row seam and keeps native text selection disabled', async () => {
    const [playlistSource, rowSource] = await Promise.all([
      readViewSource(playlistDetailViewPath),
      readViewSource(trackActionRowPath),
    ]);

    expect(playlistSource).toContain('TrackActionRow');
    expect(rowSource).toContain('user-select: none');
    expect(rowSource).toContain('-webkit-user-select: none');
    expect(rowSource).toContain('var(--state-selected)');
    expect(rowSource).toContain('var(--state-danger)');
    expect(rowSource).toContain('var(--focus-ring)');
  });

  it('keeps playlist rows keyboard-focusable and marks the active action row when focus moves', async () => {
    render(PlaylistDetailView, { props: { playlistId: 'playlist-1' } });

    await screen.findByRole('heading', { name: basePlaylist.name });
    const row = getRow(availableTrack.title);

    expect(row.getAttribute('data-surface')).toBe('action-row');
    expect(row.getAttribute('tabindex')).toBe('0');
    expect(row.getAttribute('data-active')).toBe('false');

    await fireEvent.focus(row);

    expect(row.getAttribute('data-active')).toBe('true');
  });

  it('filters hero play to available playlist tracks and starts from the first playable track', async () => {
    render(PlaylistDetailView, { props: { playlistId: 'playlist-1' } });

    await screen.findByRole('heading', { name: basePlaylist.name });
    await fireEvent.click(screen.getByRole('button', { name: /play/i }));

    expect(playbackApiMock.setQueue).toHaveBeenCalledWith([
      availableTrack,
      availableEncoreTrack,
    ]);
    expect(playbackApiMock.playTrack).toHaveBeenCalledWith(availableTrack);
  });

  it('renders missing playlist rows with disabled play buttons while keeping remove available', async () => {
    render(PlaylistDetailView, { props: { playlistId: 'playlist-1' } });

    await screen.findByRole('heading', { name: basePlaylist.name });
    const row = getRow(missingTrack.title);
    expect(row.getAttribute('data-availability')).toBe('missing');
    expect(within(row).getByText('文件缺失')).not.toBeNull();

    const playButton = within(row).getByRole('button', { name: `播放 ${missingTrack.title}` });
    const removeButton = within(row).getByRole('button', { name: `从歌单移除 ${missingTrack.title}` });

    expect((playButton as HTMLButtonElement).disabled).toBe(true);
    expect(getHintText(playButton)).toMatch(/文件缺失/);
    expect(getHintText(playButton)).toMatch(/无法播放/);
    expect((removeButton as HTMLButtonElement).disabled).toBe(false);

    await fireEvent.click(removeButton);

    await waitFor(() => {
      expect(playlistApiMock.removeFromPlaylist).toHaveBeenCalledWith('playlist-1', 0);
    });
  });

  it('treats all-missing playlists as non-playable at the hero level', async () => {
    playlistApiMock.getPlaylist.mockReset().mockResolvedValue(basePlaylist);
    playlistApiMock.getPlaylistTracks.mockReset().mockResolvedValue([
      missingTrack,
      createTrack({
        id: 'track-4',
        title: 'No Return',
        availability: 'missing',
      }),
    ]);

    render(PlaylistDetailView, { props: { playlistId: 'playlist-1' } });

    const playButton = await screen.findByRole('button', { name: /play/i });
    expect((playButton as HTMLButtonElement).disabled).toBe(true);
    expect(getHintText(playButton)).toMatch(/无法播放/);
  });

  it('dispatches refreshPlaylists after a successful rename', async () => {
    const refreshHandler = vi.fn();
    render(PlaylistDetailView, {
      props: { playlistId: 'playlist-1' },
      events: { refreshPlaylists: refreshHandler },
    });

    await screen.findByRole('heading', { name: 'After Hours' });
    await fireEvent.click(screen.getByRole('button', { name: /rename/i }));

    await waitFor(() => {
      expect(playlistApiMock.updatePlaylistMetadata).toHaveBeenCalledWith(
        'playlist-1',
        'Renamed Playlist',
        'Late-night rotation',
      );
      expect(refreshHandler).toHaveBeenCalledTimes(1);
    });
  });
});
