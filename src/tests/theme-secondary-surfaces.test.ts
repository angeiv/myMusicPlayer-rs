// @vitest-environment jsdom

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Album, Artist, SearchResults, Track } from '../lib/types';

const playbackApiMock = vi.hoisted(() => ({
  playTrack: vi.fn(),
  setQueue: vi.fn(),
}));

vi.mock('../lib/api/playback', () => ({
  playTrack: playbackApiMock.playTrack,
  setQueue: playbackApiMock.setQueue,
}));

import HomeView from '../lib/views/HomeView.svelte';
import SearchResultsView from '../lib/views/SearchResultsView.svelte';

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const homeViewPath = path.resolve(testsRoot, '../lib/views/HomeView.svelte');
const searchResultsViewPath = path.resolve(testsRoot, '../lib/views/SearchResultsView.svelte');
const settingsViewPath = path.resolve(testsRoot, '../lib/views/SettingsView.svelte');

async function readViewSource(pathname: string): Promise<string> {
  return readFile(pathname, 'utf8');
}

function createTrack(overrides: Pick<Track, 'id' | 'title'> & Partial<Track>): Track {
  const { id, title, ...rest } = overrides;

  return {
    id,
    title,
    duration: 180,
    path: `/music/${id}.flac`,
    size: 1_024,
    format: 'flac',
    bitrate: 320,
    sample_rate: 48_000,
    channels: 2,
    play_count: 0,
    date_added: '2026-04-03T00:00:00.000Z',
    artist_name: 'Night Engines',
    album_title: 'Late Transit',
    availability: 'available',
    ...rest,
    library_root: rest.library_root ?? null,
    file_mtime_ms: rest.file_mtime_ms ?? null,
    missing_since: rest.missing_since ?? null,
  };
}

function createAlbum(overrides: Pick<Album, 'id' | 'title'> & Partial<Album>): Album {
  const { id, title, ...rest } = overrides;

  return {
    id,
    title,
    track_count: 8,
    duration: 2_100,
    date_added: '2026-04-03T00:00:00.000Z',
    artist_name: 'Night Engines',
    ...rest,
  };
}

function createArtist(overrides: Pick<Artist, 'id' | 'name'> & Partial<Artist>): Artist {
  const { id, name, ...rest } = overrides;

  return {
    id,
    name,
    album_count: 2,
    track_count: 14,
    date_added: '2026-04-03T00:00:00.000Z',
    ...rest,
  };
}

afterEach(() => {
  cleanup();
});

describe('secondary surface theme migration', () => {
  beforeEach(() => {
    playbackApiMock.playTrack.mockReset().mockResolvedValue(undefined);
    playbackApiMock.setQueue.mockReset().mockResolvedValue(undefined);
  });

  it('moves HomeView, SearchResultsView, and SettingsView onto the shared page/panel/empty-state primitives and removes hardcoded dark literals from search/settings surfaces', async () => {
    const [homeSource, searchSource, settingsSource] = await Promise.all([
      readViewSource(homeViewPath),
      readViewSource(searchResultsViewPath),
      readViewSource(settingsViewPath),
    ]);

    for (const source of [homeSource, searchSource, settingsSource]) {
      expect(source).toContain('PageHeader');
      expect(source).toContain('SurfacePanel');
      expect(source).toContain('EmptyState');
    }

    for (const source of [searchSource, settingsSource]) {
      expect(source).not.toMatch(/rgba\(15,\s*23,\s*42/i);
      expect(source).not.toContain('#f8fafc');
      expect(source).not.toContain('#e2e8f0');
    }
  });

  it('renders HomeView on the shared maintenance shell and keeps its empty-state copy visible', () => {
    render(HomeView, {
      props: {
        tracks: [],
        albums: [],
        artists: [],
        playlists: [],
      },
    });

    expect(screen.getByRole('heading', { name: '首页' })).toBeTruthy();
    expect(screen.getByText('歌曲')).toBeTruthy();
    expect(screen.getByText('播放列表')).toBeTruthy();
    expect(screen.getByText('添加歌曲后会显示在这里。')).toBeTruthy();
    expect(screen.getByText('扫描音乐库后即可生成艺术家信息。')).toBeTruthy();
    expect(document.querySelector('[data-page-header]')).not.toBeNull();
    expect(document.querySelectorAll('[data-surface-panel]').length).toBeGreaterThan(0);
  });

  it('renders SearchResultsView empty states through the shared maintenance shell', () => {
    render(SearchResultsView, {
      props: {
        searchTerm: 'ambient',
        searchResults: {
          tracks: [],
          albums: [],
          artists: [],
        } satisfies SearchResults,
        isSearching: false,
      },
    });

    expect(screen.getByRole('heading', { name: '搜索' })).toBeTruthy();
    expect(screen.getByText('“ambient”的搜索结果')).toBeTruthy();
    expect(screen.getByText('暂无结果，试试其他关键词。')).toBeTruthy();
    expect(document.querySelector('[data-empty-state]')).not.toBeNull();
  });

  it('keeps search-result playback wired after the surface migration', async () => {
    const tracks = [
      createTrack({ id: 'track-1', title: 'Night Drive' }),
      createTrack({ id: 'track-2', title: 'Signal Bloom' }),
    ];

    const playTrackEvent = vi.fn();

    render(SearchResultsView, {
      props: {
        searchTerm: 'night',
        searchResults: {
          tracks,
          albums: [createAlbum({ id: 'album-1', title: 'Late Transit' })],
          artists: [createArtist({ id: 'artist-1', name: 'Night Engines' })],
        } satisfies SearchResults,
        isSearching: false,
      },
      events: {
        playTrack: playTrackEvent,
        openAlbum: vi.fn(),
        openArtist: vi.fn(),
      },
    });

    await fireEvent.click(screen.getByRole('button', { name: '播放 Signal Bloom' }));

    expect(playbackApiMock.setQueue).toHaveBeenCalledWith(tracks);
    expect(playbackApiMock.playTrack).toHaveBeenCalledWith(tracks[1]);
    expect(playTrackEvent).toHaveBeenCalledTimes(1);
  });
});
