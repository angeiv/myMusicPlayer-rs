<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Album } from '../types';
  import { formatLongDuration } from '../utils/format';

  export let albums: Album[] = [];
  export let isLibraryLoading = false;

  const dispatch = createEventDispatcher<{ openAlbum: { id: string } }>();

  $: sortedAlbums = albums.slice().sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
  );

  function handleOpen(album: Album) {
    dispatch('openAlbum', { id: album.id });
  }
</script>

<section class="albums-view">
  <div class="header">
    <h2>Albums</h2>
    <p>{albums.length} albums catalogued</p>
  </div>

  {#if isLibraryLoading}
    <div class="empty">Loading albums…</div>
  {:else if sortedAlbums.length === 0}
    <div class="empty">No albums available.</div>
  {:else}
    <div class="grid">
      {#each sortedAlbums as album}
        <button class="card" on:click={() => handleOpen(album)}>
          <div class="artwork">
            <span>{album.title.charAt(0)}</span>
          </div>
          <div class="info">
            <h3>{album.title}</h3>
            <p>{album.artist_name ?? 'Various artists'}</p>
            <div class="meta">
              <span>{album.track_count} tracks</span>
              <span>{formatLongDuration(album.duration)}</span>
              {#if album.year}
                <span>{album.year}</span>
              {/if}
            </div>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</section>

<style>
  .albums-view {
    padding: 32px 48px;
    color: var(--app-fg);
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .header h2 {
    margin: 0;
    font-size: 1.8rem;
    color: var(--app-fg);
  }

  .header p {
    margin: 4px 0 0 0;
    color: var(--muted-fg);
  }

  .empty {
    padding: 80px 0;
    text-align: center;
    border-radius: 20px;
    background: var(--panel-bg);
    color: var(--muted-fg);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 24px;
  }

  .card {
    border: none;
    border-radius: 20px;
    background: linear-gradient(160deg, rgba(30, 64, 175, 0.35), rgba(2, 132, 199, 0.18));
    padding: 20px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
    color: inherit;
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .card:hover {
    transform: translateY(-4px);
    box-shadow: 0 20px 45px rgba(14, 116, 144, 0.25);
  }

  .artwork {
    width: 140px;
    height: 140px;
    border-radius: 18px;
    background: rgba(15, 23, 42, 0.5);
    display: grid;
    place-items: center;
    font-size: 3rem;
    font-weight: 700;
    letter-spacing: 0.12em;
  }

  .info h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #f8fafc;
  }

  .info p {
    margin: 6px 0 0 0;
    color: rgba(226, 232, 240, 0.75);
  }

  .meta {
    margin-top: 12px;
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    font-size: 0.8rem;
    color: rgba(148, 163, 184, 0.85);
  }

  @media (max-width: 820px) {
    .albums-view {
      padding: 24px;
    }

    .artwork {
      width: 100%;
    }

    .grid {
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    }
  }
</style>
