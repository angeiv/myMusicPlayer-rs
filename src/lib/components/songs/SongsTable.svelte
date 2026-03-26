<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  import type { Track } from '../../types';
  import { formatDate, formatDuration, formatTrackIndex } from '../../utils/format';
  import type { SongsSortDirection, SongsSortKey } from '../../features/songs-list/sort-filter';

  export let tracks: Track[] = [];
  export let selectedIds: string[] = [];
  export let activeTrackId: string | null = null;
  export let playingTrackId: string | null = null;
  export let sortKey: SongsSortKey = 'title';
  export let sortDirection: SongsSortDirection = 'asc';

  type SongsTableEvents = {
    toggleSort: { key: SongsSortKey };
    rowClick: { track: Track; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean };
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

  function isSelected(trackId: string): boolean {
    return selectedIds.includes(trackId);
  }

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
    });
  }

  function handleRowDoubleClick(track: Track): void {
    dispatch('rowDoubleClick', { track });
  }

  function handleRowFocus(track: Track): void {
    dispatch('rowFocus', { track });
  }

  function handleRowKeydown(event: KeyboardEvent, track: Track): void {
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
      <button
        type="button"
        class={column.className}
        role="columnheader"
        aria-label={column.ariaLabel}
        aria-sort={getAriaSort(column.key)}
        on:click={() => dispatch('toggleSort', { key: column.key })}
      >
        <span>{column.label}</span>
        <span class="sort-indicator" aria-hidden="true">{getSortArrow(column.key)}</span>
      </button>
    {/each}
  </div>

  <div class="table-body" role="rowgroup">
    {#each tracks as track, index}
      <div
        class="row"
        class:is-selected={isSelected(track.id)}
        class:is-active={activeTrackId === track.id}
        class:is-playing={playingTrackId === track.id}
        role="row"
        tabindex="0"
        data-selected={isSelected(track.id) ? 'true' : 'false'}
        data-active={activeTrackId === track.id ? 'true' : 'false'}
        data-playing={playingTrackId === track.id ? 'true' : 'false'}
        on:click={(event) => handleRowClick(event, track)}
        on:dblclick={() => handleRowDoubleClick(track)}
        on:focus={() => handleRowFocus(track)}
        on:keydown={(event) => handleRowKeydown(event, track)}
        on:contextmenu={(event) => handleRowContextMenu(event, track)}
      >
        <div class="index" role="cell">{formatTrackIndex(index)}</div>
        <div class="title" role="cell">
          <span class="track-title">{track.title}</span>
          <span class="format">{track.format?.toUpperCase()}</span>
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
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    border-radius: 16px;
    overflow: hidden;
    backdrop-filter: blur(12px);
  }

  .table-header,
  .row {
    display: grid;
    grid-template-columns: 80px 2.5fr 2fr 2fr 1fr 1.2fr;
    align-items: center;
  }

  .table-header {
    background: var(--panel-bg);
    padding: 12px 20px;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--muted-fg);
  }

  .table-header button,
  .table-header .index {
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
  }

  .table-header button {
    cursor: pointer;
  }

  .table-header button:hover,
  .table-header button:focus-visible {
    color: #eff6ff;
    outline: none;
  }

  .table-header .index {
    justify-content: center;
  }

  .sort-indicator {
    min-width: 0.75rem;
    color: rgba(191, 219, 254, 0.8);
  }

  .table-body {
    overflow: visible;
  }

  .row {
    padding: 12px 20px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.12);
    transition:
      background 0.2s ease,
      box-shadow 0.2s ease;
    cursor: pointer;
  }

  .row:hover {
    background: rgba(59, 130, 246, 0.12);
  }

  .row:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.5);
  }

  .row.is-selected {
    background: rgba(59, 130, 246, 0.18);
  }

  .row.is-active {
    box-shadow: inset 0 0 0 1px rgba(125, 211, 252, 0.7);
  }

  .row.is-playing .track-title {
    color: #93c5fd;
  }

  .index {
    font-variant-numeric: tabular-nums;
    text-align: center;
    color: rgba(148, 163, 184, 0.9);
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
    color: #f8fafc;
  }

  .format {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(148, 163, 184, 0.55);
  }

  .artist,
  .album {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgba(226, 232, 240, 0.8);
  }

  .duration,
  .added {
    font-variant-numeric: tabular-nums;
    color: rgba(148, 163, 184, 0.85);
  }

  @media (max-width: 1024px) {
    .table-header,
    .row {
      grid-template-columns: 60px 2fr 1.5fr 1.5fr 1fr 1.2fr;
    }
  }
</style>
