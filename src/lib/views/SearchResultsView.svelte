<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { playTrack as playTrackCommand, setQueue } from '../api/playback';
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
  <header>
    <h2>Search</h2>
    {#if searchTerm.trim()}
      <p>Results for “{searchTerm}”</p>
    {/if}
  </header>

  {#if isSearching}
    <div class="state">Searching…</div>
  {:else if !tracks.length && !albums.length && !artists.length}
    <div class="state">No results yet. Try a different keyword.</div>
  {:else}
    <div class="columns">
      <section>
        <h3>Tracks</h3>
        {#if tracks.length === 0}
          <p class="muted">No tracks found.</p>
        {:else}
          <ul>
            {#each tracks.slice(0, 10) as track}
              <li>
                <div
                  class="info"
                  role="button"
                  tabindex="0"
                  on:dblclick={() => playTrack(track)}
                  on:keydown={(event) => handleTrackKeydown(event, track)}
                >
                  <strong>{track.title}</strong>
                  <span>{track.artist_name ?? 'Unknown artist'} • {track.album_title ?? 'Unknown album'}</span>
                </div>
                <div class="meta">
                  <span>{formatDuration(track.duration)}</span>
                  <button on:click={() => playTrack(track)}>▶</button>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section>
        <h3>Albums</h3>
        {#if albums.length === 0}
          <p class="muted">No albums found.</p>
        {:else}
          <ul>
            {#each albums.slice(0, 8) as album}
              <li>
                <button class="list-button" on:click={() => openAlbum(album)}>
                  <div class="artwork">{album.title.charAt(0)}</div>
                  <div>
                    <strong>{album.title}</strong>
                    <span>{album.artist_name ?? 'Various artists'} · {album.track_count} tracks</span>
                    <span>Released {album.year ?? 'unknown'}</span>
                  </div>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section>
        <h3>Artists</h3>
        {#if artists.length === 0}
          <p class="muted">No artists found.</p>
        {:else}
          <ul>
            {#each artists.slice(0, 8) as artist}
              <li>
                <button class="list-button" on:click={() => openArtist(artist)}>
                  <div class="avatar">{artist.name.charAt(0)}</div>
                  <div>
                    <strong>{artist.name}</strong>
                    <span>{artist.album_count} albums · {artist.track_count} tracks</span>
                    <span>Added {formatDate(artist.date_added) || 'recently'}</span>
                  </div>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>
  {/if}
</section>

<style>
  .search-results {
    padding: 32px 48px;
    color: #e2e8f0;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  header h2 {
    margin: 0;
    font-size: 1.8rem;
    color: #f8fafc;
  }

  header p {
    margin: 4px 0 0 0;
    color: rgba(148, 163, 184, 0.75);
  }

  .state {
    padding: 60px 0;
    text-align: center;
    border-radius: 20px;
    background: rgba(15, 23, 42, 0.65);
    color: rgba(148, 163, 184, 0.75);
  }

  .columns {
    display: grid;
    grid-template-columns: 1.2fr 1fr 1fr;
    gap: 24px;
  }

  section {
    background: rgba(15, 23, 42, 0.78);
    border-radius: 20px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  section h3 {
    margin: 0;
    font-size: 1.2rem;
    color: #f8fafc;
  }

  .muted {
    color: rgba(148, 163, 184, 0.75);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: 14px;
    background: rgba(30, 41, 59, 0.4);
  }

  li .info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    cursor: pointer;
  }

  li strong {
    color: #f8fafc;
  }

  li span {
    color: rgba(148, 163, 184, 0.75);
    font-size: 0.8rem;
  }

  li button {
    border: none;
    border-radius: 999px;
    background: rgba(59, 130, 246, 0.25);
    color: #bfdbfe;
    width: 36px;
    height: 36px;
    cursor: pointer;
  }

  .info:focus {
    outline: 2px solid rgba(96, 165, 250, 0.6);
    outline-offset: 2px;
  }

  .list-button {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    border: none;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .list-button:hover {
    background: rgba(59, 130, 246, 0.16);
  }

  .list-button:focus {
    outline: 2px solid rgba(96, 165, 250, 0.6);
    outline-offset: 2px;
  }

  .artwork,
  .avatar {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    background: rgba(15, 23, 42, 0.6);
    display: grid;
    place-items: center;
    font-weight: 700;
    letter-spacing: 0.1em;
    margin-right: 12px;
  }

  .avatar {
    border-radius: 50%;
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
