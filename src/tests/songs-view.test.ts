// @vitest-environment jsdom

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import type { Component, ComponentProps } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlaybackStateInfo, Playlist, Track } from '../lib/types';

const playbackApiMock = vi.hoisted(() => ({
  addToQueue: vi.fn(),
  getCurrentTrack: vi.fn(),
  getPlaybackState: vi.fn(),
  playTrack: vi.fn(),
  setQueue: vi.fn(),
}));

const playlistApiMock = vi.hoisted(() => ({
  addTracksToPlaylist: vi.fn(),
}));

vi.mock('../lib/api/playback', () => ({
  addToQueue: playbackApiMock.addToQueue,
  getCurrentTrack: playbackApiMock.getCurrentTrack,
  getPlaybackState: playbackApiMock.getPlaybackState,
  playTrack: playbackApiMock.playTrack,
  setQueue: playbackApiMock.setQueue,
}));

vi.mock('../lib/api/playlist', () => ({
  addTracksToPlaylist: playlistApiMock.addTracksToPlaylist,
}));

import SongsView from '../lib/views/SongsView.svelte';

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const songsViewPath = path.resolve(testsRoot, '../lib/views/SongsView.svelte');

async function readSongsViewSource(): Promise<string> {
  return readFile(songsViewPath, 'utf8');
}

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
    library_root: rest.library_root ?? null,
    file_mtime_ms: rest.file_mtime_ms ?? null,
    availability: rest.availability ?? 'available',
    missing_since: rest.missing_since ?? null,
  };
}

const tracks: [Track, Track, Track, Track] = [
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

async function fireRealDoubleClick(
  target: HTMLElement,
  options: { delayBeforeSecondClickMs?: number } = {},
): Promise<void> {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  await flushPromises();

  if (options.delayBeforeSecondClickMs) {
    await vi.advanceTimersByTimeAsync(options.delayBeforeSecondClickMs);
    await flushPromises();
  }

  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 2 }));
  await flushPromises();

  target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 }));
  await flushPromises();
}

type RenderSongsViewOptions = Partial<{
  tracks: Track[];
  isLibraryLoading: boolean;
  searchTerm: string;
}> & {
  playlists?: Playlist[];
};

type SongsViewHarnessProps = ComponentProps<typeof SongsView> & {
  playlists?: Playlist[];
};

const SongsViewHarness = SongsView as unknown as Component<SongsViewHarnessProps>;

function renderSongsView({
  playlists,
  tracks: tracksProp = tracks,
  isLibraryLoading = false,
  searchTerm = '',
}: RenderSongsViewOptions = {}) {
  const props = {
    tracks: tracksProp,
    isLibraryLoading,
    searchTerm,
    ...(playlists === undefined ? {} : { playlists }),
  } satisfies SongsViewHarnessProps;

  return render(SongsViewHarness, { props });
}

function getRow(title: string): HTMLElement {
  const cell = screen.getByText(title);
  const row = cell.closest('[role="row"]');

  if (!(row instanceof HTMLElement)) {
    throw new Error(`Could not find row for track ${title}`);
  }

  return row;
}

function getContextMenu(): HTMLElement {
  const menu = screen.queryByRole('menu') ?? document.querySelector('.context-menu');

  if (!(menu instanceof HTMLElement)) {
    throw new Error('Could not find songs context menu');
  }

  return menu;
}

function getContextMenuAction(name: string): HTMLElement {
  const queries = within(getContextMenu());
  const action = queries.queryByRole('menuitem', { name }) ?? queries.queryByRole('button', { name });

  if (!(action instanceof HTMLElement)) {
    throw new Error(`Could not find context menu action ${name}`);
  }

  return action;
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

function getHintText(element: HTMLElement): string {
  const controlSurface = element.closest('[role="menu"], [role="toolbar"], [role="group"]')
    ?? (element.parentElement instanceof HTMLBodyElement ? null : element.parentElement);
  const describedByIds = element.getAttribute('aria-describedby')?.split(/\s+/).filter(Boolean) ?? [];
  const hintCandidates = [
    element.getAttribute('title'),
    element.getAttribute('aria-description'),
    element.getAttribute('aria-label'),
    ...describedByIds.map((id) => document.getElementById(id)?.textContent),
    controlSurface?.textContent,
  ];

  return hintCandidates
    .map((text) => text?.trim() ?? '')
    .filter((text) => text.length > 0)
    .join(' ');
}

function expectDisabledActionWithHint(action: HTMLElement, hintPattern: RegExp): void {
  if (action instanceof HTMLButtonElement) {
    expect(action.disabled).toBe(true);
  } else {
    expect(action.getAttribute('aria-disabled')).toBe('true');
  }

  expect(getHintText(action)).toMatch(hintPattern);
}

describe('SongsView integration harness', () => {
  beforeEach(() => {
    playbackApiMock.addToQueue.mockReset().mockResolvedValue(undefined);
    playbackApiMock.getCurrentTrack.mockReset().mockResolvedValue(null);
    playbackApiMock.getPlaybackState.mockReset().mockResolvedValue({ state: 'stopped' });
    playbackApiMock.playTrack.mockReset().mockResolvedValue(undefined);
    playbackApiMock.setQueue.mockReset().mockResolvedValue(undefined);
    playlistApiMock.addTracksToPlaylist.mockReset().mockResolvedValue({
      status: 'success',
      added: 0,
      total: 0,
      failedTrackIds: [],
    });
    vi.stubGlobal('alert', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('migrates SongsView onto the shared page, panel, and empty-state primitives', async () => {
    const source = await readSongsViewSource();

    expect(source).toContain('PageHeader');
    expect(source).toContain('SurfacePanel');
    expect(source).toContain('EmptyState');
  });

  it('keeps a bulk action slot mounted before selection so first click does not shift the table layout', async () => {
    renderSongsView();

    const bulkActionSlot = document.querySelector('[data-bulk-action-slot]');

    expect(bulkActionSlot).not.toBeNull();
    expect(screen.queryByText('播放选中')).toBeNull();

    await fireEvent.click(getRow(alphaTrack.title));

    expect(document.querySelector('[data-bulk-action-slot]')).not.toBeNull();
    expect(screen.queryByText('播放选中')).not.toBeNull();
  });

  it.each([
    ['meta-click', { metaKey: true }],
    ['ctrl-click', { ctrlKey: true }],
  ] as const)(
    'shows the bulk action bar with the range anchored from the toggled row after click, %s, and shift-click',
    async (_modifierLabel, modifier) => {
      renderSongsView();

      await fireEvent.click(getRow(alphaTrack.title));
      await fireEvent.click(getRow(betaTrack.title), modifier);
      await fireEvent.click(getRow(deltaTrack.title), { shiftKey: true });

      expect(screen.queryByText('播放选中')).not.toBeNull();
      expect(screen.queryByText('加入队列')).not.toBeNull();
      expect(screen.queryByText('清除选择')).not.toBeNull();
      expect(screen.queryByText(/2\s*首/)).not.toBeNull();
      expect(hasStateMarker(getRow(alphaTrack.title), 'selected')).toBe(false);
      expect(hasStateMarker(getRow(betaTrack.title), 'selected')).toBe(true);
      expect(hasStateMarker(getRow(deltaTrack.title), 'selected')).toBe(true);
    },
  );

  it('clears the entire selection when the bulk action bar clear button is pressed', async () => {
    renderSongsView();

    await fireEvent.click(getRow(alphaTrack.title));
    await fireEvent.click(getRow(betaTrack.title), { metaKey: true });
    await fireEvent.click(screen.getByRole('button', { name: '清除选择' }));

    expect(screen.queryByText('播放选中')).toBeNull();
    expect(hasStateMarker(getRow(alphaTrack.title), 'selected')).toBe(false);
    expect(hasStateMarker(getRow(betaTrack.title), 'selected')).toBe(false);
  });

  it('targets the single right-clicked row when opening the context menu from an unselected row', async () => {
    renderSongsView();

    await fireEvent.click(getRow(alphaTrack.title));
    await fireEvent.click(getRow(betaTrack.title), { metaKey: true });
    await fireEvent.contextMenu(getRow(deltaTrack.title), { clientX: 120, clientY: 140 });
    await fireEvent.click(getContextMenuAction('播放选中'));

    expect(playbackApiMock.setQueue).toHaveBeenCalledWith([deltaTrack]);
    expect(playbackApiMock.playTrack).toHaveBeenCalledWith(deltaTrack);
  });

  it('preserves the multi-selection when opening the context menu from an already selected row', async () => {
    renderSongsView();

    await fireEvent.click(getRow(alphaTrack.title));
    await fireEvent.click(getRow(betaTrack.title), { metaKey: true });
    await fireEvent.contextMenu(getRow(betaTrack.title), { clientX: 120, clientY: 140 });
    await fireEvent.click(getContextMenuAction('加入队列'));

    expect(playbackApiMock.addToQueue).toHaveBeenCalledWith([alphaTrack, betaTrack]);
  });

  it('disables the add-to-playlist action and surfaces a hint when no playlists are available from both the bulk bar and context-menu paths', async () => {
    const noPlaylists: Playlist[] = [];
    renderSongsView({ playlists: noPlaylists });

    await fireEvent.click(getRow(alphaTrack.title));

    const addToPlaylistButton = screen.getByRole('button', { name: '加入歌单' });
    expectDisabledActionWithHint(addToPlaylistButton, /请先创建歌单/);

    await fireEvent.contextMenu(getRow(alphaTrack.title), { clientX: 120, clientY: 140 });

    const contextMenuAddToPlaylistAction = getContextMenuAction('加入歌单');
    expectDisabledActionWithHint(contextMenuAddToPlaylistAction, /请先创建歌单/);
  });

  it('renders missing rows with visible and accessible unavailable state copy', () => {
    const missingBetaTrack = createTrack({
      id: betaTrack.id,
      title: betaTrack.title,
      artist_name: betaTrack.artist_name ?? null,
      album_title: betaTrack.album_title ?? null,
      availability: 'missing',
      missing_since: null,
    });

    renderSongsView({
      tracks: [alphaTrack, missingBetaTrack, gammaTrack, deltaTrack],
    });

    const missingRow = getRow(missingBetaTrack.title);

    expect(missingRow.getAttribute('data-availability')).toBe('missing');
    expect(within(missingRow).getByText('文件缺失')).not.toBeNull();
    expect(getHintText(missingRow)).toMatch(/文件缺失/);
    expect(getHintText(missingRow)).toMatch(/无法播放/);
  });

  it('disables primary play actions with a missing-file hint when the visible selection has no playable tracks', async () => {
    const missingBetaTrack = createTrack({
      id: betaTrack.id,
      title: betaTrack.title,
      artist_name: betaTrack.artist_name ?? null,
      album_title: betaTrack.album_title ?? null,
      availability: 'missing',
      missing_since: '2026-04-03T00:00:00.000Z',
    });

    renderSongsView({
      tracks: [alphaTrack, missingBetaTrack, gammaTrack, deltaTrack],
    });

    await fireEvent.click(getRow(missingBetaTrack.title));

    const playSelectedButton = screen.getByRole('button', { name: '播放选中' });
    expectDisabledActionWithHint(playSelectedButton, /所选歌曲文件缺失，无法播放/);

    await fireEvent.contextMenu(getRow(missingBetaTrack.title), { clientX: 120, clientY: 140 });

    const contextMenuPlayAction = getContextMenuAction('播放选中');
    expectDisabledActionWithHint(contextMenuPlayAction, /所选歌曲文件缺失，无法播放/);
  });

  it('shows immediate feedback and skips playback when a missing row is double-clicked', async () => {
    const missingBetaTrack = createTrack({
      id: betaTrack.id,
      title: betaTrack.title,
      artist_name: betaTrack.artist_name ?? null,
      album_title: betaTrack.album_title ?? null,
      availability: 'missing',
      missing_since: null,
    });

    renderSongsView({
      tracks: [alphaTrack, missingBetaTrack, gammaTrack, deltaTrack],
    });

    await fireRealDoubleClick(getRow(missingBetaTrack.title));

    expect(playbackApiMock.setQueue).not.toHaveBeenCalled();
    expect(playbackApiMock.playTrack).not.toHaveBeenCalled();
    expect(screen.getByText('当前歌曲文件缺失，无法播放')).not.toBeNull();
  });

  it('prevents default keyboard playback and shows immediate feedback when Enter and Space target a missing row', async () => {
    const missingBetaTrack = createTrack({
      id: betaTrack.id,
      title: betaTrack.title,
      artist_name: betaTrack.artist_name ?? null,
      album_title: betaTrack.album_title ?? null,
      availability: 'missing',
      missing_since: '2026-04-03T00:00:00.000Z',
    });

    renderSongsView({
      tracks: [alphaTrack, missingBetaTrack, gammaTrack, deltaTrack],
    });

    const missingRow = getRow(missingBetaTrack.title);

    await fireEvent.focus(missingRow);

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
    expect(screen.getByText('当前歌曲文件缺失，无法播放')).not.toBeNull();
  });

  it('double-clicking an unselected row replaces the queue with all visible tracks and resets the selection to that row without rendering a play-success banner above the list', async () => {
    renderSongsView();

    await fireEvent.click(getRow(alphaTrack.title));
    await fireEvent.click(getRow(betaTrack.title), { metaKey: true });
    await fireRealDoubleClick(getRow(deltaTrack.title));

    expect(playbackApiMock.setQueue).toHaveBeenCalledWith(visibleTracks);
    expect(playbackApiMock.playTrack).toHaveBeenCalledWith(deltaTrack);
    expect(screen.queryByText(/1\s*首/)).not.toBeNull();
    expect(screen.queryByText('已开始播放当前歌曲')).toBeNull();
    expect(hasStateMarker(getRow(deltaTrack.title), 'selected')).toBe(true);
    expect(hasStateMarker(getRow(alphaTrack.title), 'selected')).toBe(false);
  });

  it('double-clicking an already selected row preserves the multi-selection even when the second click arrives after 500ms, updates active focus, starts from that row, and does not render a play-success banner above the list', async () => {
    vi.useFakeTimers();
    renderSongsView();

    await fireEvent.click(getRow(alphaTrack.title));
    await fireEvent.click(getRow(betaTrack.title), { metaKey: true });
    await fireRealDoubleClick(getRow(betaTrack.title), { delayBeforeSecondClickMs: 650 });

    expect(playbackApiMock.setQueue).toHaveBeenCalledWith(visibleTracks);
    expect(playbackApiMock.playTrack).toHaveBeenCalledWith(betaTrack);
    expect(screen.queryByText(/2\s*首/)).not.toBeNull();
    expect(screen.queryByText('已开始播放当前歌曲')).toBeNull();
    expect(hasStateMarker(getRow(alphaTrack.title), 'selected')).toBe(true);
    expect(hasStateMarker(getRow(betaTrack.title), 'selected')).toBe(true);
    expect(hasStateMarker(getRow(betaTrack.title), 'active')).toBe(true);
  });

  it('syncs activeTrackId from DOM focus, prevents default keyboard behavior, and plays the same row on Enter and Space', async () => {
    renderSongsView();

    const betaRow = getRow(betaTrack.title);

    await fireEvent.focus(betaRow);
    expect(hasStateMarker(betaRow, 'active')).toBe(true);

    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    betaRow.dispatchEvent(enterEvent);
    await flushPromises();

    const spaceEvent = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    betaRow.dispatchEvent(spaceEvent);
    await flushPromises();

    expect(enterEvent.defaultPrevented).toBe(true);
    expect(spaceEvent.defaultPrevented).toBe(true);
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
    expect(hasStateMarker(getRow(betaTrack.title), 'playing')).toBe(false);

    queuePlaybackSnapshot({ state: 'playing', position: 0, duration: deltaTrack.duration }, deltaTrack);
    expect(hasStateMarker(getRow(deltaTrack.title), 'playing')).toBe(false);

    await advancePlaybackPoll();

    expect(hasStateMarker(getRow(deltaTrack.title), 'playing')).toBe(true);
    expect(hasStateMarker(getRow(betaTrack.title), 'playing')).toBe(false);

    queuePlaybackSnapshot({ state: 'playing', position: 24, duration: betaTrack.duration }, betaTrack);
    expect(hasStateMarker(getRow(betaTrack.title), 'playing')).toBe(false);

    await advancePlaybackPoll();

    expect(hasStateMarker(getRow(deltaTrack.title), 'playing')).toBe(false);
    expect(hasStateMarker(getRow(betaTrack.title), 'playing')).toBe(true);
  });
});
