// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlaybackStateInfo, Track } from '../lib/types';

const playbackApiMock = vi.hoisted(() => ({
  addToQueue: vi.fn(),
  getCurrentTrack: vi.fn(),
  getPlaybackState: vi.fn(),
  playTrack: vi.fn(),
  setQueue: vi.fn(),
}));

const playlistApiMock = vi.hoisted(() => ({
  addToPlaylist: vi.fn(),
}));

vi.mock('../lib/api/playback', () => ({
  addToQueue: playbackApiMock.addToQueue,
  getCurrentTrack: playbackApiMock.getCurrentTrack,
  getPlaybackState: playbackApiMock.getPlaybackState,
  playTrack: playbackApiMock.playTrack,
  setQueue: playbackApiMock.setQueue,
}));

vi.mock('../lib/api/playlist', () => ({
  addToPlaylist: playlistApiMock.addToPlaylist,
}));

import SongsView from '../lib/views/SongsView.svelte';

function createTrack(overrides: Pick<Track, 'id' | 'title'> & Partial<Track>): Track {
  const { id, title, ...rest } = overrides;

  return {
    id,
    title,
    duration: 180,
    path: `/music/${id}.mp3`,
    size: 1024,
    format: 'mp3',
    bitrate: 320,
    sample_rate: 44_100,
    channels: 2,
    artist_name: 'Example Artist',
    album_title: 'Example Album',
    play_count: 0,
    date_added: '2026-03-01T00:00:00.000Z',
    ...rest,
  };
}

const tracks: Track[] = [
  createTrack({ id: 'track-1', title: 'Alpha', artist_name: 'Artist A', album_title: 'Album A' }),
  createTrack({ id: 'track-2', title: 'Beta', artist_name: 'Artist B', album_title: 'Album A' }),
  createTrack({ id: 'track-3', title: 'Gamma', artist_name: 'Artist C', album_title: 'Album B' }),
  createTrack({ id: 'track-4', title: 'Delta', artist_name: 'Artist D', album_title: 'Album B' }),
];

const [alphaTrack, betaTrack, gammaTrack, deltaTrack] = tracks;
const visibleTracks = [alphaTrack, betaTrack, deltaTrack, gammaTrack];

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function advancePlaybackPoll(): Promise<void> {
  await vi.advanceTimersByTimeAsync(1_000);
  await flushPromises();
}

function renderSongsView(props: Partial<{ tracks: Track[]; isLibraryLoading: boolean; searchTerm: string }> = {}) {
  return render(SongsView, {
    props: {
      tracks,
      isLibraryLoading: false,
      searchTerm: '',
      ...props,
    },
  });
}

function getRow(title: string): HTMLElement {
  const cell = screen.getByText(title);
  const row = cell.closest('[role="row"]');

  if (!(row instanceof HTMLElement)) {
    throw new Error(`Could not find row for track ${title}`);
  }

  return row;
}

function hasStateMarker(row: HTMLElement, state: 'selected' | 'active' | 'playing'): boolean {
  const dataValue = row.getAttribute(`data-${state}`);

  if (dataValue === 'true') {
    return true;
  }

  if (dataValue === 'false') {
    return false;
  }

  return row.classList.contains(`is-${state}`) || row.classList.contains(state);
}

function queuePlaybackSnapshot(state: PlaybackStateInfo, track: Track | null): void {
  playbackApiMock.getPlaybackState.mockResolvedValue(state);
  playbackApiMock.getCurrentTrack.mockResolvedValue(track);
}

describe('SongsView integration harness', () => {
  beforeEach(() => {
    playbackApiMock.addToQueue.mockReset().mockResolvedValue(undefined);
    playbackApiMock.getCurrentTrack.mockReset().mockResolvedValue(null);
    playbackApiMock.getPlaybackState.mockReset().mockResolvedValue({ state: 'stopped' });
    playbackApiMock.playTrack.mockReset().mockResolvedValue(undefined);
    playbackApiMock.setQueue.mockReset().mockResolvedValue(undefined);
    playlistApiMock.addToPlaylist.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('alert', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows the bulk action bar with the visible selected count after click, meta-click, and shift-click', async () => {
    renderSongsView();

    await fireEvent.click(getRow(alphaTrack.title));
    await fireEvent.click(getRow(betaTrack.title), { metaKey: true });
    await fireEvent.click(getRow(deltaTrack.title), { shiftKey: true });

    expect(screen.queryByText('播放选中')).not.toBeNull();
    expect(screen.queryByText('加入队列')).not.toBeNull();
    expect(screen.queryByText('清除选择')).not.toBeNull();
    expect(screen.queryByText(/3\s*首/)).not.toBeNull();
  });

  it('targets the single right-clicked row when opening the context menu from an unselected row', async () => {
    renderSongsView();

    await fireEvent.click(getRow(alphaTrack.title));
    await fireEvent.click(getRow(betaTrack.title), { metaKey: true });
    await fireEvent.contextMenu(getRow(deltaTrack.title), { clientX: 120, clientY: 140 });
    await fireEvent.click(screen.getByText('播放选中'));

    expect(playbackApiMock.setQueue).toHaveBeenCalledWith([deltaTrack]);
    expect(playbackApiMock.playTrack).toHaveBeenCalledWith(deltaTrack);
  });

  it('preserves the multi-selection when opening the context menu from an already selected row', async () => {
    renderSongsView();

    await fireEvent.click(getRow(alphaTrack.title));
    await fireEvent.click(getRow(betaTrack.title), { metaKey: true });
    await fireEvent.contextMenu(getRow(betaTrack.title), { clientX: 120, clientY: 140 });
    await fireEvent.click(screen.getByText('加入队列'));

    expect(playbackApiMock.addToQueue).toHaveBeenCalledWith([alphaTrack, betaTrack]);
  });

  it('disables the add-to-playlist action and surfaces a hint when no playlists are available', async () => {
    renderSongsView();

    await fireEvent.click(getRow(alphaTrack.title));

    const addToPlaylistButton = screen.getByRole('button', { name: '加入歌单' });
    const hintText =
      addToPlaylistButton.getAttribute('title')
      ?? addToPlaylistButton.getAttribute('aria-description')
      ?? document.body.textContent
      ?? '';

    expect((addToPlaylistButton as HTMLButtonElement).disabled).toBe(true);
    expect(hintText).toMatch(/请先创建歌单/);
  });

  it('double-clicking an unselected row replaces the queue with all visible tracks and resets the selection to that row', async () => {
    renderSongsView();

    await fireEvent.click(getRow(alphaTrack.title));
    await fireEvent.click(getRow(betaTrack.title), { metaKey: true });
    await fireEvent.dblClick(getRow(deltaTrack.title));

    expect(playbackApiMock.setQueue).toHaveBeenCalledWith(visibleTracks);
    expect(playbackApiMock.playTrack).toHaveBeenCalledWith(deltaTrack);
    expect(screen.queryByText(/1\s*首/)).not.toBeNull();
    expect(hasStateMarker(getRow(deltaTrack.title), 'selected')).toBe(true);
    expect(hasStateMarker(getRow(alphaTrack.title), 'selected')).toBe(false);
  });

  it('double-clicking an already selected row preserves the multi-selection, updates active focus, and starts from that row', async () => {
    renderSongsView();

    await fireEvent.click(getRow(alphaTrack.title));
    await fireEvent.click(getRow(betaTrack.title), { metaKey: true });
    await fireEvent.dblClick(getRow(betaTrack.title));

    expect(playbackApiMock.setQueue).toHaveBeenCalledWith(visibleTracks);
    expect(playbackApiMock.playTrack).toHaveBeenCalledWith(betaTrack);
    expect(screen.queryByText(/2\s*首/)).not.toBeNull();
    expect(hasStateMarker(getRow(alphaTrack.title), 'selected')).toBe(true);
    expect(hasStateMarker(getRow(betaTrack.title), 'selected')).toBe(true);
    expect(hasStateMarker(getRow(betaTrack.title), 'active')).toBe(true);
  });

  it('syncs activeTrackId from DOM focus and plays the same row on Enter and Space', async () => {
    renderSongsView();

    const betaRow = getRow(betaTrack.title);

    await fireEvent.focus(betaRow);
    expect(hasStateMarker(betaRow, 'active')).toBe(true);

    await fireEvent.keyDown(betaRow, { key: 'Enter' });
    await fireEvent.keyDown(betaRow, { key: ' ' });

    expect(playbackApiMock.playTrack).toHaveBeenNthCalledWith(1, betaTrack);
    expect(playbackApiMock.playTrack).toHaveBeenNthCalledWith(2, betaTrack);
  });

  it('highlights only the currently playing row and clears that highlight for paused and stopped states', async () => {
    vi.useFakeTimers();
    queuePlaybackSnapshot({ state: 'playing', position: 12, duration: betaTrack.duration }, betaTrack);

    renderSongsView();
    await flushPromises();

    expect(hasStateMarker(getRow(betaTrack.title), 'playing')).toBe(true);

    queuePlaybackSnapshot({ state: 'paused', position: 18, duration: betaTrack.duration }, betaTrack);
    await advancePlaybackPoll();
    expect(hasStateMarker(getRow(betaTrack.title), 'playing')).toBe(false);

    queuePlaybackSnapshot({ state: 'stopped' }, betaTrack);
    await advancePlaybackPoll();
    expect(hasStateMarker(getRow(betaTrack.title), 'playing')).toBe(false);
  });

  it('keeps selected, active, and playing rows distinguishable with separate state markers', async () => {
    vi.useFakeTimers();
    queuePlaybackSnapshot({ state: 'playing', position: 1, duration: gammaTrack.duration }, gammaTrack);

    renderSongsView();
    await flushPromises();

    await fireEvent.click(getRow(alphaTrack.title));
    await fireEvent.focus(getRow(betaTrack.title));

    const alphaRow = getRow(alphaTrack.title);
    const betaRow = getRow(betaTrack.title);
    const gammaRow = getRow(gammaTrack.title);

    expect(hasStateMarker(alphaRow, 'selected')).toBe(true);
    expect(hasStateMarker(alphaRow, 'active')).toBe(false);
    expect(hasStateMarker(alphaRow, 'playing')).toBe(false);

    expect(hasStateMarker(betaRow, 'selected')).toBe(false);
    expect(hasStateMarker(betaRow, 'active')).toBe(true);
    expect(hasStateMarker(betaRow, 'playing')).toBe(false);

    expect(hasStateMarker(gammaRow, 'selected')).toBe(false);
    expect(hasStateMarker(gammaRow, 'active')).toBe(false);
    expect(hasStateMarker(gammaRow, 'playing')).toBe(true);
  });

  it('uses fake timers to make playback polling deterministic when the playing row changes', async () => {
    vi.useFakeTimers();
    queuePlaybackSnapshot({ state: 'stopped' }, null);

    renderSongsView();
    await flushPromises();

    expect(hasStateMarker(getRow(deltaTrack.title), 'playing')).toBe(false);

    queuePlaybackSnapshot({ state: 'playing', position: 0, duration: deltaTrack.duration }, deltaTrack);
    await advancePlaybackPoll();

    expect(playbackApiMock.getPlaybackState).toHaveBeenCalledTimes(2);
    expect(playbackApiMock.getCurrentTrack).toHaveBeenCalledTimes(2);
    expect(hasStateMarker(getRow(deltaTrack.title), 'playing')).toBe(true);
  });
});
