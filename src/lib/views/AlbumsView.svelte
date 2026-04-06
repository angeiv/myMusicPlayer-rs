<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  import CoverArt from '../components/CoverArt.svelte';
  import EmptyState from '../components/ui/EmptyState.svelte';
  import PageHeader from '../components/ui/PageHeader.svelte';
  import SurfacePanel from '../components/ui/SurfacePanel.svelte';
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
  <PageHeader title="Albums" subtitle={`${albums.length} albums catalogued`} />

  {#if isLibraryLoading}
    <EmptyState
      title="Loading albums"
      body="Album artwork, counts, and durations will appear here when the library finishes loading."
      align="center"
    />
  {:else if sortedAlbums.length === 0}
    <EmptyState
      title="No albums available"
      body="Add music to your library to populate the album catalogue."
      align="center"
    />
  {:else}
    <SurfacePanel padding="spacious">
      <div class="grid">
        {#each sortedAlbums as album}
          <button class="card selection-guard" on:click={() => handleOpen(album)}>
            <CoverArt
              className="albums-view__artwork"
              artworkPath={album.artwork_path}
              title={album.title}
              alt=""
            />
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
    </SurfacePanel>
  {/if}
</section>

<style>
  .albums-view {
    padding: 32px 48px;
    color: var(--text-primary);
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 24px;
  }

  .card {
    border: 1px solid var(--border-subtle);
    border-radius: 22px;
    background: linear-gradient(
      160deg,
      color-mix(in srgb, var(--accent) 16%, var(--surface-panel-subtle)),
      color-mix(in srgb, var(--surface-panel) 94%, transparent)
    );
    padding: 20px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
    color: inherit;
    cursor: pointer;
    text-align: left;
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease,
      border-color 0.2s ease;
  }

  .card:hover,
  .card:focus-visible {
    transform: translateY(-3px);
    border-color: color-mix(in srgb, var(--accent) 28%, var(--border-default));
    box-shadow: var(--shadow-elevated);
    outline: none;
  }

  :global(.albums-view__artwork) {
    width: 140px;
    height: 140px;
    flex-shrink: 0;
  }

  .info {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .info h3 {
    margin: 0;
    font-size: 1.1rem;
    color: var(--text-primary);
  }

  .info p {
    margin: 0;
    color: var(--text-secondary);
  }

  .meta {
    margin-top: 8px;
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    font-size: 0.8rem;
    color: var(--text-tertiary);
  }

  @media (max-width: 820px) {
    .albums-view {
      padding: 24px;
    }

    :global(.albums-view__artwork) {
      width: 100%;
    }

    .grid {
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    }
  }
</style>
