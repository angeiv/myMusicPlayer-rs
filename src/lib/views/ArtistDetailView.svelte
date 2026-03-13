<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import type { Album, Artist, Track } from '../types';
  import {
    formatDate,
    formatDuration,
    formatLongDuration,
    formatTrackIndex,
  } from '../utils/format';
  import { isTauri } from '../utils/env';
  import {
    getMockAlbumsByArtist,
    getMockArtistById,
    getMockTracksByArtist,
  } from '../mocks/library';

  export let artistId: string | null = null;

  const dispatch = createEventDispatcher<{
    playTrack: { track: Track };
    openAlbum: { id: string };
  }>();

  let artist: Artist | null = null;
  let tracks: Track[] = [];
  let albums: Album[] = [];
  let loading = false;
  let error = '';
  let lastRequestedId: string | null = null;

  $: if (artistId) {
    loadArtist(artistId);
  } else {
    artist = null;
    tracks = [];
    albums = [];
  }

  async function loadArtist(id: string) {
    if (lastRequestedId === id && (loading || artist)) {
      return;
    }

    loading = true;
    error = '';
    lastRequestedId = id;

    const loadFromMock = () => {
      artist = getMockArtistById(id);
      tracks = getMockTracksByArtist(id);
      albums = getMockAlbumsByArtist(id);
    };

    try {
      if (!isTauri) {
        loadFromMock();
        return;
      }

      const [artistData, tracksData, albumsData] = await Promise.all([
        invoke<Artist | null>('get_artist', { id }),
        invoke<Track[]>('get_tracks_by_artist', { artistId: id }),
        invoke<Album[]>('get_albums_by_artist', { artistId: id }),
      ]);

      if (lastRequestedId !== id) {
        return;
      }

      artist = artistData;
      tracks = tracksData ?? [];
      albums = albumsData ?? [];
    } catch (err) {
      console.error('Failed to load artist detail:', err);
      if (!isTauri) {
        loadFromMock();
        error = '';
      } else {
        artist = null;
        tracks = [];
        albums = [];
        error = 'Unable to load artist information.';
      }
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

  function handlePlayPopular() {
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

  function handleOpenAlbum(id: string) {
    dispatch('openAlbum', { id });
  }
</script>

<section class="artist-detail">
  {#if !artistId}
    <div class="empty">Select an artist to explore their music.</div>
  {:else if loading}
    <div class="empty">Loading artist…</div>
  {:else if error}
    <div class="empty">{error}</div>
  {:else if !artist}
    <div class="empty">Artist not found.</div>
  {:else}
    <div class="hero">
      <div class="avatar">{artist.name.charAt(0)}</div>
      <div class="info">
        <span class="label">Artist</span>
        <h2>{artist.name}</h2>
        <div class="meta">
          <span>{artist.album_count} albums</span>
          <span>{artist.track_count} tracks</span>
          <span>Since {formatDate(artist.date_added) || 'recently'}</span>
        </div>
        {#if artist.bio}
          <p class="bio">{artist.bio}</p>
        {/if}
        <div class="actions">
          <button class="primary" on:click={handlePlayPopular}>▶ Play Top Track</button>
          <button disabled title="Coming soon">Follow</button>
        </div>
      </div>
    </div>

    <div class="columns">
      <section class="popular">
        <header>
          <h3>Top Tracks</h3>
          <span>{formatLongDuration(tracks.reduce((sum, t) => sum + t.duration, 0))}</span>
        </header>
        {#if tracks.length === 0}
          <p class="muted">No tracks available.</p>
        {:else}
          <div class="track-table">
            {#each tracks as track, index}
              <div
                class="row"
                role="button"
                tabindex="0"
                on:dblclick={() => playTrack(track)}
                on:keydown={(event) => handleRowKeydown(event, track)}
              >
                <div class="index">{formatTrackIndex(index)}</div>
                <div class="title">
                  <span>{track.title}</span>
                  {#if track.album_title}
                    <small>{track.album_title}</small>
                  {/if}
                </div>
                <div class="duration">{formatDuration(track.duration)}</div>
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <section class="discography">
        <header>
          <h3>Discography</h3>
          <span>{albums.length} releases</span>
        </header>
        {#if albums.length === 0}
          <p class="muted">No albums recorded yet.</p>
        {:else}
          <div class="albums">
            {#each albums as album}
              <button class="album-card" on:click={() => handleOpenAlbum(album.id)}>
                <div class="artwork">{album.title.charAt(0)}</div>
                <div class="details">
                  <strong>{album.title}</strong>
                  <span>{album.year ?? 'Year unknown'}</span>
                  <span>{album.track_count} tracks · {formatLongDuration(album.duration)}</span>
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </section>
    </div>
  {/if}
</section>

<style>
  .artist-detail {
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
    background: linear-gradient(140deg, rgba(56, 189, 248, 0.28), rgba(14, 165, 233, 0.18));
  }

  .avatar {
    width: 160px;
    height: 160px;
    border-radius: 50%;
    background: rgba(15, 23, 42, 0.65);
    display: grid;
    place-items: center;
    font-size: 3.5rem;
    font-weight: 700;
    letter-spacing: 0.12em;
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .label {
    font-size: 0.75rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(226, 232, 240, 0.65);
  }

  h2 {
    margin: 0;
    font-size: 2.4rem;
    color: #f8fafc;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    font-size: 0.85rem;
    color: rgba(191, 219, 254, 0.75);
  }

  .bio {
    margin: 0;
    color: rgba(226, 232, 240, 0.8);
    max-width: 520px;
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
    background: rgba(14, 165, 233, 0.3);
    color: #e0f2fe;
    box-shadow: 0 18px 30px rgba(14, 165, 233, 0.3);
  }

  .columns {
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    gap: 24px;
  }

  section {
    background: rgba(15, 23, 42, 0.78);
    border-radius: 20px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    padding: 20px 24px;
  }

  section header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  section header h3 {
    margin: 0;
    font-size: 1.2rem;
    color: #f8fafc;
  }

  section header span {
    font-size: 0.85rem;
    color: rgba(148, 163, 184, 0.75);
  }

  .muted {
    color: rgba(148, 163, 184, 0.75);
  }

  .track-table {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 360px;
    overflow-y: auto;
  }

  .row {
    display: grid;
    grid-template-columns: 60px 1fr 80px;
    align-items: center;
    padding: 10px 12px;
    border-radius: 12px;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .row:hover {
    background: rgba(56, 189, 248, 0.16);
  }

  .index {
    font-variant-numeric: tabular-nums;
    color: rgba(148, 163, 184, 0.8);
  }

  .title span {
    color: #f8fafc;
    font-weight: 600;
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

  .albums {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 360px;
    overflow-y: auto;
  }

  .album-card {
    border: none;
    border-radius: 14px;
    padding: 12px;
    display: flex;
    gap: 12px;
    align-items: center;
    background: rgba(15, 23, 42, 0.6);
    color: inherit;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .album-card:hover {
    background: rgba(56, 189, 248, 0.16);
  }

  .album-card .artwork {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: rgba(14, 165, 233, 0.25);
    display: grid;
    place-items: center;
    font-weight: 700;
    letter-spacing: 0.1em;
  }

  .album-card .details {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
  }

  @media (max-width: 960px) {
    .artist-detail {
      padding: 24px;
    }

    .hero {
      flex-direction: column;
      align-items: flex-start;
    }

    .avatar {
      width: 120px;
      height: 120px;
    }

    .columns {
      grid-template-columns: 1fr;
    }
  }
</style>
