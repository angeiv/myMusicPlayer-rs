<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  import type { Track } from '../../types';
  import type { SongsSortDirection, SongsSortKey } from '../../features/songs-list/sort-filter';
  import {
    getTrackAvailabilityBadge,
    getTrackAvailabilityDescription,
    getTrackAvailabilityState,
    isTrackPlayable,
  } from '../../utils/track-availability';
  import { formatDate, formatDuration, formatTrackIndex } from '../../utils/format';

  export let tracks: Track[] = [];
  export let selectedIds: string[] = [];
  export let activeTrackId: string | null = null;
  export let playingTrackId: string | null = null;
  export let sortKey: SongsSortKey = 'title';
  export let sortDirection: SongsSortDirection = 'asc';

  type SongsTableEvents = {
    toggleSort: { key: SongsSortKey };
    rowClick: {
      track: Track;
      metaKey: boolean;
      ctrlKey: boolean;
      shiftKey: boolean;
      clickCount: number;
    };
    rowDoubleClick: { track: Track };
    rowFocus: { track: Track };
    rowKeydown: { track: Track; key: string };
    rowContextMenu: { track: Track; x: number; y: number; focusTarget?: HTMLElement | null };
  };

  type SortableColumn = {
    key: SongsSortKey;
    label: string;
    className: string;
    ariaLabel: string;
  };

  const dispatch = createEventDispatcher<SongsTableEvents>();
  const sortableColumns: SortableColumn[] = [
    { key: 'title', label: 'Title', className: 'title', ariaLabel: 'Sort by title' },
    { key: 'artist_name', label: 'Artist', className: 'artist', ariaLabel: 'Sort by artist' },
    { key: 'album_title', label: 'Album', className: 'album', ariaLabel: 'Sort by album' },
    { key: 'duration', label: 'Duration', className: 'duration', ariaLabel: 'Sort by duration' },
    { key: 'date_added', label: 'Added', className: 'added', ariaLabel: 'Sort by added date' },
  ];

  function getSortArrow(key: SongsSortKey): string {
    if (sortKey !== key) {
      return '';
    }

    return sortDirection === 'asc' ? '↑' : '↓';
  }

  function getAriaSort(key: SongsSortKey): 'ascending' | 'descending' | 'none' {
    if (sortKey !== key) {
      return 'none';
    }

    return sortDirection === 'asc' ? 'ascending' : 'descending';
  }

  function handleRowClick(event: MouseEvent, track: Track): void {
    dispatch('rowClick', {
      track,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      clickCount: event.detail,
    });
  }

  function handleRowDoubleClick(track: Track): void {
    dispatch('rowDoubleClick', { track });
  }

  function handleRowFocus(track: Track): void {
    dispatch('rowFocus', { track });
  }

  function handleRowKeydown(event: KeyboardEvent, track: Track): void {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Space') {
      event.preventDefault();
    }

    dispatch('rowKeydown', {
      track,
      key: event.key,
    });
  }

  function handleRowContextMenu(event: MouseEvent, track: Track): void {
    event.preventDefault();

    dispatch('rowContextMenu', {
      track,
      x: event.clientX,
      y: event.clientY,
      focusTarget: event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
    });
  }
</script>

<div class="songs-table" role="table" aria-label="Songs list">
  <div class="table-header" role="row">
    <div class="index" role="columnheader">#</div>

    {#each sortableColumns as column}
      <div class={column.className} role="columnheader" aria-sort={getAriaSort(column.key)}>
        <button
          type="button"
          class="column-sort-button"
          aria-label={column.ariaLabel}
          on:click={() => dispatch('toggleSort', { key: column.key })}
        >
          <span>{column.label}</span>
          <span class="sort-indicator" aria-hidden="true">{getSortArrow(column.key)}</span>
        </button>
      </div>
    {/each}
  </div>

  <div class="table-body" role="rowgroup">
    {#each tracks as track, index}
      {@const selected = selectedIds.includes(track.id)}
      {@const active = activeTrackId === track.id}
      {@const playing = playingTrackId === track.id}
      {@const playable = isTrackPlayable(track)}
      {@const availability = getTrackAvailabilityState(track)}
      {@const availabilityBadge = getTrackAvailabilityBadge(track)}
      {@const availabilityDescription = getTrackAvailabilityDescription(track)}
      {@const availabilityDescriptionId = !playable ? `songs-track-availability-${index}` : undefined}
      <div
        class="row"
        class:is-selected={selected}
        class:is-active={active}
        class:is-playing={playing}
        class:is-missing={!playable}
        role="row"
        tabindex="0"
        data-surface="action-row"
        data-selected={selected ? 'true' : 'false'}
        data-active={active ? 'true' : 'false'}
        data-playing={playing ? 'true' : 'false'}
        data-availability={availability}
        aria-describedby={availabilityDescriptionId}
        on:click={(event) => handleRowClick(event, track)}
        on:dblclick={() => handleRowDoubleClick(track)}
        on:focus={() => handleRowFocus(track)}
        on:keydown={(event) => handleRowKeydown(event, track)}
        on:contextmenu={(event) => handleRowContextMenu(event, track)}
      >
        <div class="index" role="cell">{formatTrackIndex(index)}</div>
        <div class="title" role="cell">
          <span class="track-title">{track.title}</span>
          <div class="meta-line">
            {#if availabilityBadge}
              <span class="availability-badge">{availabilityBadge}</span>
            {/if}
            <span class="format">{track.format?.toUpperCase()}</span>
          </div>
          {#if availabilityDescriptionId}
            <span id={availabilityDescriptionId} class="sr-only">{availabilityDescription}</span>
          {/if}
        </div>
        <div class="artist" role="cell">{track.artist_name ?? 'Unknown artist'}</div>
        <div class="album" role="cell">{track.album_title ?? 'Unknown album'}</div>
        <div class="duration" role="cell">{formatDuration(track.duration)}</div>
        <div class="added" role="cell">{formatDate(track.date_added)}</div>
      </div>
    {/each}
  </div>
</div>

<style>
  .songs-table {
    overflow: hidden;
    border-radius: 18px;
    background: transparent;
  }

  .table-header,
  .row {
    display: grid;
    grid-template-columns: 80px 2.5fr 2fr 2fr 1fr 1.2fr;
    align-items: center;
  }

  .table-header {
    padding: 12px 20px;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-tertiary);
    background: color-mix(in srgb, var(--surface-panel-subtle) 88%, transparent);
    border-bottom: 1px solid var(--border-subtle);
  }

  .table-header .index,
  .table-header [role='columnheader'] {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .table-header .column-sort-button {
    width: 100%;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .table-header .column-sort-button:hover,
  .table-header .column-sort-button:focus-visible {
    color: var(--text-primary);
    outline: none;
  }

  .table-header .index {
    justify-content: center;
  }

  .sort-indicator {
    min-width: 0.75rem;
    color: color-mix(in srgb, var(--accent) 40%, var(--text-tertiary));
  }

  .table-body {
    overflow: visible;
  }

  .row {
    padding: 12px 20px;
    border-bottom: 1px solid var(--border-subtle);
    transition:
      background 0.2s ease,
      box-shadow 0.2s ease,
      border-color 0.2s ease;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
  }

  .row * {
    user-select: none;
    -webkit-user-select: none;
  }

  .row:hover {
    background: var(--accent-soft);
  }

  .row:focus-visible {
    outline: none;
    box-shadow:
      var(--focus-ring),
      inset 0 0 0 1px color-mix(in srgb, var(--accent) 26%, transparent);
  }

  .row.is-selected {
    background: var(--state-selected);
  }

  .row.is-active {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 42%, transparent);
  }

  .row.is-playing {
    background: color-mix(in srgb, var(--state-playing) 44%, var(--surface-panel-subtle));
  }

  .row.is-playing .track-title {
    color: color-mix(in srgb, var(--accent) 32%, var(--text-primary));
  }

  .row.is-missing:not(.is-playing) .track-title {
    color: var(--text-secondary);
  }

  .row.is-missing .artist,
  .row.is-missing .album,
  .row.is-missing .duration,
  .row.is-missing .added,
  .row.is-missing .format,
  .row.is-missing .index {
    color: var(--text-tertiary);
  }

  .index {
    font-variant-numeric: tabular-nums;
    text-align: center;
    color: var(--text-tertiary);
  }

  .title {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .track-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    color: var(--text-primary);
  }

  .meta-line {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .availability-badge {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--state-danger) 64%, var(--border-default));
    background: color-mix(in srgb, var(--state-danger) 45%, transparent);
    color: var(--text-primary);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 2px 8px;
  }

  .format {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-tertiary);
  }

  .artist,
  .album {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-secondary);
  }

  .duration,
  .added {
    font-variant-numeric: tabular-nums;
    color: var(--text-tertiary);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 1024px) {
    .table-header,
    .row {
      grid-template-columns: 60px 2fr 1.5fr 1.5fr 1fr 1.2fr;
    }
  }
</style>
