<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import type { Track } from '../types';
  import { formatDate, formatDuration, formatTrackIndex } from '../utils/format';
  import { isTauri } from '../utils/env';

  export let tracks: Track[] = [];
  export let isLibraryLoading = false;
  export let searchTerm = '';

  type SortKey = 'title' | 'album_title' | 'artist_name' | 'duration' | 'date_added';

  const dispatch = createEventDispatcher<{ playTrack: { track: Track } }>();

  let sortKey: SortKey = 'title';
  let sortDirection: 'asc' | 'desc' = 'asc';
  let contextMenuTrack: Track | null = null;
  let contextMenuPosition = { x: 0, y: 0 };

  $: filteredTracks = tracks
    .filter((track) => {
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      return (
        track.title.toLowerCase().includes(q) ||
        (track.artist_name ?? '').toLowerCase().includes(q) ||
        (track.album_title ?? '').toLowerCase().includes(q)
      );
    })
    .slice();

  $: sortedTracks = filteredTracks.sort((a, b) => {
    const dir = sortDirection === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'duration':
        return (a.duration - b.duration) * dir;
      case 'date_added':
        return (
          new Date(a.date_added).getTime() - new Date(b.date_added).getTime()
        ) * dir;
      case 'album_title':
        return ((a.album_title ?? '').localeCompare(b.album_title ?? '', undefined, { sensitivity: 'base' })) * dir;
      case 'artist_name':
        return ((a.artist_name ?? '').localeCompare(b.artist_name ?? '', undefined, { sensitivity: 'base' })) * dir;
      default:
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) * dir;
    }
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDirection = 'asc';
    }
  }

  async function playTrack(track: Track) {
    if (isTauri) {
      try {
        await invoke('play', { track });
      } catch (error) {
        console.error('Failed to play track:', error);
      }
    }
    dispatch('playTrack', { track });
  }

  function handleRowDoubleClick(track: Track) {
    playTrack(track);
  }

  function handleRowKeydown(event: KeyboardEvent, track: Track) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      playTrack(track);
    }
  }

  function handleContextMenu(event: MouseEvent, track: Track) {
    event.preventDefault();
    contextMenuTrack = track;
    contextMenuPosition = { x: event.clientX, y: event.clientY };
  }

  function closeContextMenu() {
    contextMenuTrack = null;
  }

  onMount(() => {
    window.addEventListener('click', closeContextMenu);
  });

  onDestroy(() => {
    window.removeEventListener('click', closeContextMenu);
  });
</script>

<div class="songs-view">
  <div class="header">
    <h2>Songs</h2>
    <p>{tracks.length} tracks in your library</p>
  </div>

  {#if isLibraryLoading}
    <div class="empty">
      <p>Scanning library…</p>
    </div>
  {:else if sortedTracks.length === 0}
    <div class="empty">
      <p>No songs matched your search.</p>
    </div>
  {:else}
    <div class="table" role="table" aria-label="Songs list">
      <div class="table-header" role="row">
        <button class="index" on:click={() => toggleSort('title')} aria-label="Sort by title">
          #
        </button>
        <button class="title" on:click={() => toggleSort('title')} aria-label="Sort by title">
          Title
        </button>
        <button class="artist" on:click={() => toggleSort('artist_name')} aria-label="Sort by artist">
          Artist
        </button>
        <button class="album" on:click={() => toggleSort('album_title')} aria-label="Sort by album">
          Album
        </button>
        <button class="duration" on:click={() => toggleSort('duration')} aria-label="Sort by duration">
          Duration
        </button>
        <button class="added" on:click={() => toggleSort('date_added')} aria-label="Sort by added date">
          Added
        </button>
      </div>

      <div class="table-body">
        {#each sortedTracks as track, index}
          <div
            class="row"
            role="row"
            tabindex="0"
            on:dblclick={() => handleRowDoubleClick(track)}
            on:keydown={(event) => handleRowKeydown(event, track)}
            on:contextmenu={(event) => handleContextMenu(event, track)}
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
  {/if}

  {#if contextMenuTrack}
    <div
      class="context-menu"
      style={`top:${contextMenuPosition.y}px;left:${contextMenuPosition.x}px;`}
    >
      <button on:click={() => playTrack(contextMenuTrack!)}>▶ Play</button>
      <button disabled title="Coming soon">➕ Add to playlist</button>
      <button disabled title="Coming soon">🗑 Remove from library</button>
    </div>
  {/if}
</div>

<style>
  .songs-view {
    padding: 32px 48px;
    color: #e2e8f0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .header h2 {
    margin: 0;
    font-size: 1.8rem;
    color: #f8fafc;
  }

  .header p {
    margin: 4px 0 0 0;
    color: rgba(148, 163, 184, 0.75);
  }

  .table {
    background: rgba(15, 23, 42, 0.75);
    border: 1px solid rgba(148, 163, 184, 0.18);
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
    background: rgba(30, 41, 59, 0.75);
    padding: 12px 20px;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: rgba(148, 163, 184, 0.85);
  }

  .table-header button {
    background: none;
    border: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .table-header .index {
    text-align: center;
  }

  .table-body {
    max-height: calc(100vh - 260px);
    overflow-y: overlay;
  }

  .row {
    padding: 12px 20px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.12);
    transition: background 0.2s ease;
    cursor: pointer;
  }

  .row:hover {
    background: rgba(59, 130, 246, 0.12);
  }

  .index {
    font-variant-numeric: tabular-nums;
    text-align: center;
    color: rgba(148, 163, 184, 0.9);
  }

  .title {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .track-title {
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
    color: rgba(226, 232, 240, 0.8);
  }

  .duration,
  .added {
    font-variant-numeric: tabular-nums;
    color: rgba(148, 163, 184, 0.85);
  }

  .empty {
    padding: 80px 0;
    text-align: center;
    color: rgba(148, 163, 184, 0.75);
    background: rgba(15, 23, 42, 0.65);
    border-radius: 16px;
  }

  .context-menu {
    position: fixed;
    min-width: 180px;
    background: rgba(15, 23, 42, 0.95);
    border-radius: 12px;
    border: 1px solid rgba(59, 130, 246, 0.2);
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 50;
  }

  .context-menu button {
    background: none;
    border: none;
    color: #e2e8f0;
    text-align: left;
    padding: 10px 16px;
    cursor: pointer;
  }

  .context-menu button:hover:not(:disabled) {
    background: rgba(59, 130, 246, 0.2);
  }

  .context-menu button:disabled {
    color: rgba(148, 163, 184, 0.5);
    cursor: not-allowed;
  }

  @media (max-width: 1024px) {
    .table-header,
    .row {
      grid-template-columns: 60px 2fr 1.5fr 1.5fr 1fr 1.2fr;
    }
  }

  @media (max-width: 820px) {
    .songs-view {
      padding: 24px;
    }

    .table-body {
      max-height: none;
    }
  }
</style>
