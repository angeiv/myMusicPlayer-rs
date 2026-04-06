<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  import { artistsCopy } from '../copy/zh-cn';
  import EmptyState from '../components/ui/EmptyState.svelte';
  import PageHeader from '../components/ui/PageHeader.svelte';
  import SurfacePanel from '../components/ui/SurfacePanel.svelte';
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
  <PageHeader title={artistsCopy.title} subtitle={artistsCopy.subtitle(artists.length)} />

  {#if isLibraryLoading}
    <EmptyState
      title={artistsCopy.loadingTitle}
      body={artistsCopy.loadingBody}
      align="center"
    />
  {:else if sortedArtists.length === 0}
    <EmptyState
      title={artistsCopy.emptyTitle}
      body={artistsCopy.emptyBody}
      align="center"
    />
  {:else}
    <SurfacePanel padding="spacious">
      <div class="grid">
        {#each sortedArtists as artist}
          <button class="card selection-guard" on:click={() => handleOpen(artist)}>
            <div class="avatar">{artist.name.charAt(0)}</div>
            <div class="details">
              <h3>{artist.name}</h3>
              <p>{artist.album_count} 张专辑 · {artist.track_count} 首歌曲</p>
              <span class="meta">{artistsCopy.joinedAt(formatDate(artist.date_added) || '最近')}</span>
            </div>
          </button>
        {/each}
      </div>
    </SurfacePanel>
  {/if}
</section>

<style>
  .artists-view {
    padding: 32px 48px;
    color: var(--text-primary);
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 20px;
  }

  .card {
    border: 1px solid var(--border-subtle);
    border-radius: 20px;
    background: color-mix(in srgb, var(--surface-panel-subtle) 86%, transparent);
    padding: 18px;
    display: flex;
    gap: 16px;
    align-items: center;
    cursor: pointer;
    color: inherit;
    text-align: left;
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease,
      border-color 0.2s ease;
  }

  .card:hover,
  .card:focus-visible {
    transform: translateY(-3px);
    border-color: color-mix(in srgb, var(--accent) 22%, var(--border-default));
    box-shadow: var(--shadow-soft);
    outline: none;
  }

  .avatar {
    width: 64px;
    height: 64px;
    border-radius: 20px;
    background: linear-gradient(
      160deg,
      color-mix(in srgb, var(--accent) 18%, transparent),
      color-mix(in srgb, var(--surface-panel-subtle) 92%, transparent)
    );
    display: grid;
    place-items: center;
    font-size: 1.6rem;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  .details {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .details h3 {
    margin: 0;
    font-size: 1.1rem;
    color: var(--text-primary);
  }

  .details p {
    margin: 0;
    color: var(--text-secondary);
  }

  .details .meta {
    display: inline-block;
    margin-top: 6px;
    font-size: 0.75rem;
    color: var(--text-tertiary);
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
