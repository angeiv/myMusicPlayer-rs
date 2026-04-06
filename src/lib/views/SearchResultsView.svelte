<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  import { playTrack as playTrackCommand, setQueue } from '../api/playback';
  import EmptyState from '../components/ui/EmptyState.svelte';
  import PageHeader from '../components/ui/PageHeader.svelte';
  import SurfacePanel from '../components/ui/SurfacePanel.svelte';
  import type { Album, Artist, SearchResults, Track } from '../types';
  import { formatDate, formatDuration } from '../utils/format';

  export let searchTerm = '';
  export let searchResults: SearchResults | null = null;
  export let isSearching = false;

  const dispatch = createEventDispatcher<{
    playTrack: { track: Track };
    openAlbum: { id: string };
    openArtist: { id: string };
  }>();

  $: tracks = searchResults?.tracks ?? [];
  $: albums = searchResults?.albums ?? [];
  $: artists = searchResults?.artists ?? [];
  $: hasResults = tracks.length > 0 || albums.length > 0 || artists.length > 0;
  $: subtitle = searchTerm.trim()
    ? `Results for “${searchTerm}”`
    : 'Search tracks, albums, and artists in your library.';

  async function playTrack(track: Track) {
    try {
      await setQueue(tracks);
      await playTrackCommand(track);
    } catch (error) {
      console.error('Failed to play track from search:', error);
    }

    dispatch('playTrack', { track });
  }

  function openAlbum(album: Album) {
    dispatch('openAlbum', { id: album.id });
  }

  function openArtist(artist: Artist) {
    dispatch('openArtist', { id: artist.id });
  }

  function handleTrackKeydown(event: KeyboardEvent, track: Track) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      playTrack(track);
    }
  }
</script>

<section class="search-results">
  <PageHeader title="Search" subtitle={subtitle} />

  {#if isSearching}
    <SurfacePanel tone="inset" padding="spacious">
      <EmptyState
        title="Searching library"
        body="We’re checking tracks, albums, and artists for your latest keyword."
        align="center"
      />
    </SurfacePanel>
  {:else if !hasResults}
    <SurfacePanel tone="inset" padding="spacious">
      <EmptyState
        title="No matches yet"
        body="No results yet. Try a different keyword."
        align="center"
      />
    </SurfacePanel>
  {:else}
    <div class="columns">
      <SurfacePanel padding="spacious">
        <div class="section-heading">
          <span class="eyebrow">Tracks</span>
          <h3>Quick play results</h3>
        </div>

        {#if tracks.length === 0}
          <p class="empty-note">No tracks found.</p>
        {:else}
          <ul class="result-list">
            {#each tracks.slice(0, 10) as track}
              <li class="result-list__row selection-guard">
                <div
                  class="track-copy selection-guard"
                  role="button"
                  tabindex="0"
                  aria-label={`打开 ${track.title}`}
                  on:dblclick={() => playTrack(track)}
                  on:keydown={(event) => handleTrackKeydown(event, track)}
                >
                  <strong>{track.title}</strong>
                  <span>{track.artist_name ?? 'Unknown artist'} • {track.album_title ?? 'Unknown album'}</span>
                </div>
                <div class="track-meta">
                  <span>{formatDuration(track.duration)}</span>
                  <button
                    class="result-icon-button"
                    type="button"
                    aria-label={`播放 ${track.title}`}
                    on:click={() => playTrack(track)}
                  >
                    ▶
                  </button>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </SurfacePanel>

      <SurfacePanel padding="spacious">
        <div class="section-heading">
          <span class="eyebrow">Albums</span>
          <h3>Open album detail</h3>
        </div>

        {#if albums.length === 0}
          <p class="empty-note">No albums found.</p>
        {:else}
          <ul class="result-list">
            {#each albums.slice(0, 8) as album}
              <li>
                <button
                  class="list-button selection-guard"
                  type="button"
                  aria-label={`打开专辑 ${album.title}`}
                  on:click={() => openAlbum(album)}
                >
                  <div class="artwork">{album.title.charAt(0)}</div>
                  <div class="list-copy">
                    <strong>{album.title}</strong>
                    <span>{album.artist_name ?? 'Various artists'} · {album.track_count} tracks</span>
                    <span>Released {album.year ?? 'unknown'}</span>
                  </div>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </SurfacePanel>

      <SurfacePanel padding="spacious">
        <div class="section-heading">
          <span class="eyebrow">Artists</span>
          <h3>Jump to artist</h3>
        </div>

        {#if artists.length === 0}
          <p class="empty-note">No artists found.</p>
        {:else}
          <ul class="result-list">
            {#each artists.slice(0, 8) as artist}
              <li>
                <button
                  class="list-button selection-guard"
                  type="button"
                  aria-label={`打开艺人 ${artist.name}`}
                  on:click={() => openArtist(artist)}
                >
                  <div class="avatar">{artist.name.charAt(0)}</div>
                  <div class="list-copy">
                    <strong>{artist.name}</strong>
                    <span>{artist.album_count} albums · {artist.track_count} tracks</span>
                    <span>Added {formatDate(artist.date_added) || 'recently'}</span>
                  </div>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </SurfacePanel>
    </div>
  {/if}
</section>

<style>
  .search-results {
    padding: 32px 48px;
    color: var(--text-primary);
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .columns {
    display: grid;
    grid-template-columns: 1.2fr 1fr 1fr;
    gap: 20px;
  }

  .section-heading {
    display: grid;
    gap: 0.35rem;
    margin-bottom: 1rem;
  }

  .eyebrow {
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }

  .section-heading h3 {
    margin: 0;
    font-size: 1.05rem;
    color: var(--text-primary);
  }

  .empty-note {
    color: var(--text-secondary);
  }

  .result-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .result-list__row,
  .list-button {
    width: 100%;
    border-radius: 18px;
    border: 1px solid var(--border-subtle);
    background: color-mix(in srgb, var(--surface-panel-subtle) 88%, transparent);
    transition:
      border-color 0.18s ease,
      box-shadow 0.18s ease,
      transform 0.18s ease;
  }

  .result-list__row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
  }

  .track-copy {
    min-width: 0;
    display: grid;
    gap: 0.2rem;
    cursor: pointer;
    border-radius: 12px;
  }

  .track-copy strong,
  .list-copy strong {
    color: var(--text-primary);
  }

  .track-copy span,
  .list-copy span,
  .track-meta span {
    font-size: 0.82rem;
    color: var(--text-secondary);
  }

  .track-copy:focus-visible,
  .list-button:focus-visible,
  .result-icon-button:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .result-list__row:hover,
  .result-list__row:focus-within,
  .list-button:hover,
  .list-button:focus-visible {
    border-color: color-mix(in srgb, var(--accent) 22%, var(--border-default));
    box-shadow: var(--shadow-soft);
    transform: translateY(-1px);
  }

  .track-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  .result-icon-button {
    width: 38px;
    height: 38px;
    border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--border-default));
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 14%, var(--surface-panel-subtle));
    color: var(--text-primary);
    cursor: pointer;
  }

  .list-button {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 14px;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .artwork,
  .avatar {
    width: 48px;
    height: 48px;
    border-radius: 16px;
    background: linear-gradient(
      160deg,
      color-mix(in srgb, var(--accent) 18%, transparent),
      color-mix(in srgb, var(--surface-panel-subtle) 92%, transparent)
    );
    display: grid;
    place-items: center;
    font-weight: 700;
    letter-spacing: 0.1em;
    flex-shrink: 0;
  }

  .avatar {
    border-radius: 50%;
  }

  .list-copy {
    min-width: 0;
    display: grid;
    gap: 0.2rem;
  }

  @media (max-width: 1024px) {
    .columns {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 820px) {
    .search-results {
      padding: 24px;
    }
  }
</style>
