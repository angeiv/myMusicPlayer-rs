<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import type { Album, Track } from '../types';
  import { formatDate, formatDuration, formatLongDuration, formatTrackIndex } from '../utils/format';
  import { isTauri } from '../utils/env';
  import { getMockAlbumById, getMockTracksByAlbum } from '../mocks/library';

  export let albumId: string | null = null;

  const dispatch = createEventDispatcher<{ playTrack: { track: Track } }>();

  let album: Album | null = null;
  let tracks: Track[] = [];
  let loading = false;
  let error = '';
  let lastRequestedId: string | null = null;

  $: if (albumId) {
    loadAlbum(albumId);
  } else {
    album = null;
    tracks = [];
  }

  async function loadAlbum(id: string) {
    if (lastRequestedId === id && (loading || album)) {
      return;
    }

    loading = true;
    error = '';
    lastRequestedId = id;

    const loadFromMock = () => {
      album = getMockAlbumById(id);
      tracks = getMockTracksByAlbum(id);
    };

    try {
      if (!isTauri) {
        loadFromMock();
        return;
      }

      const [albumResponse, tracksResponse] = await Promise.all([
        invoke<Album | null>('get_album', { id }),
        invoke<Track[]>('get_tracks_by_album', { albumId: id }),
      ]);

      if (lastRequestedId !== id) {
        return;
      }

      album = albumResponse;
      tracks = tracksResponse ?? [];
    } catch (err) {
      console.error('Failed to load album detail:', err);
      loadFromMock();
      error = isTauri ? 'Unable to load album information.' : '';
    } finally {
      if (lastRequestedId === id) {
        loading = false;
      }
    }
  }

  async function playTrack(track: Track) {
    if (isTauri) {
      try {
        await invoke('play', { track });
      } catch (err) {
        console.error('Failed to play track:', err);
      }
    }

    dispatch('playTrack', { track });
  }

  function handlePlayAll() {
    const first = tracks[0];
    if (first) {
      playTrack(first);
    }
  }

  function handleRowKeydown(event: KeyboardEvent, track: Track) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      playTrack(track);
    }
  }
</script>

<section class="album-detail">
  {#if !albumId}
    <div class="empty">
      <p>Select an album to see its details.</p>
    </div>
  {:else if loading}
    <div class="empty">
      <p>Loading album…</p>
    </div>
  {:else if error}
    <div class="empty">
      <p>{error}</p>
    </div>
  {:else if !album}
    <div class="empty">
      <p>Album not found.</p>
    </div>
  {:else}
    <div class="hero">
      <div class="artwork">{album.title.charAt(0)}</div>
      <div class="info">
        <span class="label">Album</span>
        <h2>{album.title}</h2>
        <p class="artist">{album.artist_name ?? 'Various artists'}</p>
        <div class="meta">
          <span>{album.track_count} tracks</span>
          <span>{formatLongDuration(album.duration)}</span>
          {#if album.year}
            <span>{album.year}</span>
          {/if}
          <span>Added {formatDate(album.date_added) || 'recently'}</span>
        </div>
        <div class="actions">
          <button class="primary" on:click={handlePlayAll}>▶ Play</button>
          <button disabled title="Coming soon">☆ Favorite</button>
        </div>
      </div>
    </div>

    <div class="tracks" role="table" aria-label="Album tracks">
      <div class="track-header" role="row">
        <div>#</div>
        <div>Title</div>
        <div>Duration</div>
      </div>
      <div class="track-body">
        {#each tracks as track, index}
          <div
            class="track-row"
            role="row"
            tabindex="0"
            on:dblclick={() => playTrack(track)}
            on:keydown={(event) => handleRowKeydown(event, track)}
          >
            <div class="index">{formatTrackIndex(index)}</div>
            <div class="title">
              <span>{track.title}</span>
              {#if track.artist_name && track.artist_name !== album?.artist_name}
                <small>{track.artist_name}</small>
              {/if}
            </div>
            <div class="duration">{formatDuration(track.duration)}</div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</section>

<style>
  .album-detail {
    padding: 32px 48px;
    color: #e2e8f0;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .empty {
    padding: 120px 0;
    text-align: center;
    border-radius: 24px;
    background: rgba(15, 23, 42, 0.65);
    color: rgba(148, 163, 184, 0.75);
  }

  .hero {
    display: flex;
    gap: 28px;
    align-items: center;
    padding: 24px;
    border-radius: 24px;
    background: linear-gradient(140deg, rgba(30, 64, 175, 0.35), rgba(2, 132, 199, 0.2));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .artwork {
    width: 180px;
    height: 180px;
    border-radius: 20px;
    background: rgba(15, 23, 42, 0.6);
    display: grid;
    place-items: center;
    font-size: 4rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    color: rgba(248, 250, 252, 0.92);
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .info .label {
    font-size: 0.75rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(226, 232, 240, 0.65);
  }

  .info h2 {
    margin: 0;
    font-size: 2.4rem;
    color: #f8fafc;
  }

  .artist {
    margin: 0;
    font-size: 1.1rem;
    color: rgba(226, 232, 240, 0.8);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    font-size: 0.85rem;
    color: rgba(191, 219, 254, 0.75);
  }

  .actions {
    display: flex;
    gap: 12px;
  }

  .actions button {
    border: none;
    border-radius: 999px;
    padding: 10px 22px;
    font-weight: 600;
    cursor: pointer;
    background: rgba(15, 23, 42, 0.45);
    color: #bfdbfe;
  }

  .actions .primary {
    background: rgba(59, 130, 246, 0.35);
    color: #e0f2fe;
    box-shadow: 0 18px 30px rgba(37, 99, 235, 0.32);
  }

  .tracks {
    background: rgba(15, 23, 42, 0.78);
    border-radius: 20px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    overflow: hidden;
  }

  .track-header,
  .track-row {
    display: grid;
    grid-template-columns: 80px 1fr 120px;
    align-items: center;
  }

  .track-header {
    padding: 14px 24px;
    font-size: 0.75rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(148, 163, 184, 0.8);
    background: rgba(30, 41, 59, 0.65);
  }

  .track-body {
    max-height: calc(100vh - 320px);
    overflow-y: auto;
  }

  .track-row {
    padding: 14px 24px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.12);
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .track-row:hover {
    background: rgba(59, 130, 246, 0.16);
  }

  .index {
    font-variant-numeric: tabular-nums;
    color: rgba(148, 163, 184, 0.8);
  }

  .title span {
    display: block;
    font-weight: 600;
    color: #f8fafc;
  }

  .title small {
    color: rgba(148, 163, 184, 0.75);
    font-size: 0.75rem;
  }

  .duration {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: rgba(148, 163, 184, 0.8);
  }

  @media (max-width: 900px) {
    .album-detail {
      padding: 24px;
    }

    .hero {
      flex-direction: column;
      align-items: flex-start;
    }

    .artwork {
      width: 140px;
      height: 140px;
    }

    .track-header,
    .track-row {
      grid-template-columns: 60px 1fr 100px;
    }
  }
</style>
