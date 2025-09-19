<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Artist } from '../types';
  import { formatDate } from '../utils/format';

  export let artists: Artist[] = [];
  export let isLibraryLoading = false;

  const dispatch = createEventDispatcher<{ openArtist: { id: string } }>();

  $: sortedArtists = artists.slice().sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );

  function handleOpen(artist: Artist) {
    dispatch('openArtist', { id: artist.id });
  }
</script>

<section class="artists-view">
  <div class="header">
    <h2>Artists</h2>
    <p>{artists.length} artists discovered</p>
  </div>

  {#if isLibraryLoading}
    <div class="empty">Loading artists…</div>
  {:else if sortedArtists.length === 0}
    <div class="empty">No artists found.</div>
  {:else}
    <div class="grid">
      {#each sortedArtists as artist}
        <button class="card" on:click={() => handleOpen(artist)}>
          <div class="avatar">{artist.name.charAt(0)}</div>
          <div class="details">
            <h3>{artist.name}</h3>
            <p>{artist.album_count} albums · {artist.track_count} tracks</p>
            <span class="meta">Joined {formatDate(artist.date_added) || 'recently'}</span>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</section>

<style>
  .artists-view {
    padding: 32px 48px;
    color: #e2e8f0;
    display: flex;
    flex-direction: column;
    gap: 20px;
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

  .empty {
    padding: 80px 0;
    text-align: center;
    border-radius: 20px;
    background: rgba(15, 23, 42, 0.65);
    color: rgba(148, 163, 184, 0.75);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 20px;
  }

  .card {
    border: none;
    border-radius: 18px;
    background: rgba(15, 23, 42, 0.7);
    padding: 18px;
    display: flex;
    gap: 16px;
    align-items: center;
    cursor: pointer;
    color: inherit;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .card:hover {
    transform: translateY(-4px);
    box-shadow: 0 16px 32px rgba(15, 23, 42, 0.45);
  }

  .avatar {
    width: 64px;
    height: 64px;
    border-radius: 20px;
    background: linear-gradient(160deg, rgba(56, 189, 248, 0.4), rgba(14, 165, 233, 0.2));
    display: grid;
    place-items: center;
    font-size: 1.6rem;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  .details h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #f8fafc;
  }

  .details p {
    margin: 4px 0 0 0;
    color: rgba(226, 232, 240, 0.75);
  }

  .details .meta {
    display: inline-block;
    margin-top: 10px;
    font-size: 0.75rem;
    color: rgba(148, 163, 184, 0.7);
  }

  @media (max-width: 820px) {
    .artists-view {
      padding: 24px;
    }

    .grid {
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    }
  }
</style>
