// @vitest-environment jsdom

import { cleanup, render, within } from '@testing-library/svelte';
import type { Component, ComponentProps } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';

import SongsTable from '../lib/components/songs/SongsTable.svelte';
import type { SongsSortDirection, SongsSortKey } from '../lib/features/songs-list/sort-filter';
import type { Track } from '../lib/types';

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

const tracks: Track[] = [createTrack({ id: 'track-1', title: 'Alpha' })];

type SongsTableProps = ComponentProps<typeof SongsTable>;

const SongsTableHarness = SongsTable as unknown as Component<SongsTableProps>;

function renderSongsTable(
  overrides: Partial<SongsTableProps> = {},
  sortKey: SongsSortKey = 'title',
  sortDirection: SongsSortDirection = 'asc',
) {
  const props = {
    tracks,
    selectedIds: [],
    activeTrackId: null,
    playingTrackId: null,
    sortKey,
    sortDirection,
    ...overrides,
  } satisfies SongsTableProps;

  return render(SongsTableHarness, { props });
}

afterEach(() => {
  cleanup();
});

describe('SongsTable', () => {
  it('keeps columnheader semantics on header cells while rendering sortable buttons inside them', () => {
    const { container } = renderSongsTable();

    const titleHeader = container.querySelector('.table-header > .title[role="columnheader"]');
    expect(titleHeader).not.toBeNull();

    const titleButton = within(titleHeader as HTMLElement).getByRole('button', {
      name: 'Sort by title',
    });
    expect(titleButton.getAttribute('role')).toBeNull();
  });

  it('exposes the current sort state from the header cell rather than the nested button', () => {
    const { container } = renderSongsTable({}, 'duration', 'desc');

    const durationHeader = container.querySelector('.table-header > .duration[role="columnheader"]');
    expect(durationHeader?.getAttribute('aria-sort')).toBe('descending');

    const durationButton = within(durationHeader as HTMLElement).getByRole('button', {
      name: 'Sort by duration',
    });
    expect(durationButton.hasAttribute('aria-sort')).toBe(false);
  });
});
