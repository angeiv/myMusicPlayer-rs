import { describe, expect, it } from 'vitest';

import { getVisibleTracks, type SongsSortKey } from '../lib/features/songs-list/sort-filter';
import type { Track } from '../lib/types';

function createTrack(overrides: Pick<Track, 'id' | 'title'> & Partial<Track>): Track {
  const { id, title, ...rest } = overrides;

  return {
    id,
    title,
    duration: 0,
    path: `/music/${id}.mp3`,
    size: 1,
    format: 'mp3',
    bitrate: 320,
    sample_rate: 44100,
    channels: 2,
    artist_name: null,
    album_title: null,
    play_count: 0,
    date_added: '2026-03-01T00:00:00.000Z',
    ...rest,
    library_root: rest.library_root ?? null,
    file_mtime_ms: rest.file_mtime_ms ?? null,
    availability: rest.availability ?? 'available',
    missing_since: rest.missing_since ?? null,
  };
}

const tracks: Track[] = [
  createTrack({
    id: 't1',
    title: 'Charlie Song',
    artist_name: 'Beta Band',
    album_title: 'Third Light',
    duration: 240,
    date_added: '2026-03-03T00:00:00.000Z',
  }),
  createTrack({
    id: 't2',
    title: 'Alpha Song',
    artist_name: 'Gamma Band',
    album_title: 'Second Wave',
    duration: 180,
    date_added: '2026-03-01T00:00:00.000Z',
  }),
  createTrack({
    id: 't3',
    title: 'Bravo Song',
    artist_name: 'Alpha Band',
    album_title: 'First Light',
    duration: 300,
    date_added: '2026-03-02T00:00:00.000Z',
  }),
  createTrack({
    id: 't4',
    title: 'Delta Song',
    artist_name: 'Alpha Band',
    album_title: 'Alpha Album',
    duration: 180,
    date_added: '2026-03-04T00:00:00.000Z',
  }),
];

const tieBreakerTracks: Track[] = [
  createTrack({ id: 't1', title: 'One', artist_name: 'Shared Artist' }),
  createTrack({ id: 't2', title: 'Two', artist_name: 'Shared Artist' }),
  createTrack({ id: 't3', title: 'Three', artist_name: 'Shared Artist' }),
];

function expectOrder(key: SongsSortKey, direction: 'asc' | 'desc', expectedIds: string[]) {
  const visible = getVisibleTracks(tracks, '', { key, direction });

  expect(visible.map((track) => track.id)).toEqual(expectedIds);
}

describe('songs-list sort/filter', () => {
  it('filters tracks by title match', () => {
    const visible = getVisibleTracks(tracks, 'bravo', { key: 'title', direction: 'asc' });

    expect(visible.map((track) => track.id)).toEqual(['t3']);
  });

  it('filters tracks by artist match', () => {
    const visible = getVisibleTracks(tracks, 'gamma', { key: 'title', direction: 'asc' });

    expect(visible.map((track) => track.id)).toEqual(['t2']);
  });

  it('filters tracks by album match', () => {
    const visible = getVisibleTracks(tracks, 'alpha album', { key: 'title', direction: 'asc' });

    expect(visible.map((track) => track.id)).toEqual(['t4']);
  });

  it('sorts by title ascending', () => {
    expectOrder('title', 'asc', ['t2', 't3', 't1', 't4']);
  });

  it('sorts by title descending', () => {
    expectOrder('title', 'desc', ['t4', 't1', 't3', 't2']);
  });

  it('sorts by artist ascending', () => {
    expectOrder('artist_name', 'asc', ['t3', 't4', 't1', 't2']);
  });

  it('sorts by artist descending', () => {
    expectOrder('artist_name', 'desc', ['t2', 't1', 't3', 't4']);
  });

  it('sorts by album ascending', () => {
    expectOrder('album_title', 'asc', ['t4', 't3', 't2', 't1']);
  });

  it('sorts by album descending', () => {
    expectOrder('album_title', 'desc', ['t1', 't2', 't3', 't4']);
  });

  it('sorts by duration ascending', () => {
    expectOrder('duration', 'asc', ['t2', 't4', 't1', 't3']);
  });

  it('sorts by duration descending', () => {
    expectOrder('duration', 'desc', ['t3', 't1', 't2', 't4']);
  });

  it('sorts by added date ascending', () => {
    expectOrder('date_added', 'asc', ['t2', 't3', 't1', 't4']);
  });

  it('sorts by added date descending', () => {
    expectOrder('date_added', 'desc', ['t4', 't1', 't3', 't2']);
  });

  it('keeps input order as tie-breaker when sort values are equal', () => {
    const visible = getVisibleTracks(tieBreakerTracks, '', {
      key: 'artist_name',
      direction: 'asc',
    });

    expect(visible.map((track) => track.id)).toEqual(['t1', 't2', 't3']);
  });
});
