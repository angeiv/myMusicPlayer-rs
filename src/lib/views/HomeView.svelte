<script lang="ts">
  import type { Album, Artist, Playlist, Track } from '../types';
  import { formatDuration, formatLongDuration } from '../utils/format';

  export let tracks: Track[] = [];
  export let albums: Album[] = [];
  export let artists: Artist[] = [];
  export let playlists: Playlist[] = [];

  $: totalDuration = tracks.reduce((sum, track) => sum + track.duration, 0);
  $: averageDuration = tracks.length ? Math.round(totalDuration / tracks.length) : 0;
</script>

<section class="home">
  <header>
    <h2>Music Overview</h2>
    <p>Welcome back! Here's a snapshot of your collection.</p>
  </header>

  <div class="stats">
    <div class="stat-card">
      <span class="label">Songs</span>
      <strong>{tracks.length}</strong>
      <span class="meta">Average length {Math.floor(averageDuration / 60)} min</span>
    </div>
    <div class="stat-card">
      <span class="label">Albums</span>
      <strong>{albums.length}</strong>
      <span class="meta">{formatLongDuration(albums.reduce((sum, album) => sum + album.duration, 0))}</span>
    </div>
    <div class="stat-card">
      <span class="label">Artists</span>
      <strong>{artists.length}</strong>
      <span class="meta">Diverse collection</span>
    </div>
    <div class="stat-card">
      <span class="label">Playlists</span>
      <strong>{playlists.length}</strong>
      <span class="meta">Custom mixes</span>
    </div>
  </div>

  <div class="panels">
    <section class="panel">
      <h3>Recently Added Tracks</h3>
      {#if tracks.length === 0}
        <p class="muted">Add songs to see them here.</p>
      {:else}
        <ul>
          {#each tracks
            .slice()
            .sort((a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime())
            .slice(0, 5) as track}
            <li>
              <span class="title">{track.title}</span>
              <span class="meta">{track.artist_name ?? 'Unknown artist'} · {formatDuration(track.duration)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="panel">
      <h3>Top Artists</h3>
      {#if artists.length === 0}
        <p class="muted">Scan your library to populate artists.</p>
      {:else}
        <ul>
          {#each artists.slice(0, 5) as artist}
            <li>
              <span class="title">{artist.name}</span>
              <span class="meta">{artist.album_count} albums · {artist.track_count} tracks</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
</section>

<style>
  .home {
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
    margin: 6px 0 0 0;
    color: rgba(148, 163, 184, 0.75);
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
  }

  .stat-card {
    background: linear-gradient(140deg, rgba(59, 130, 246, 0.24), rgba(14, 116, 144, 0.18));
    border-radius: 18px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .stat-card .label {
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(226, 232, 240, 0.65);
  }

  .stat-card strong {
    font-size: 2rem;
    color: #f8fafc;
  }

  .stat-card .meta {
    font-size: 0.78rem;
    color: rgba(191, 219, 254, 0.75);
  }

  .panels {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 24px;
  }

  .panel {
    background: rgba(15, 23, 42, 0.78);
    border-radius: 20px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .panel h3 {
    margin: 0;
    font-size: 1.2rem;
    color: #f8fafc;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  li .title {
    display: block;
    font-weight: 600;
    color: #f8fafc;
  }

  li .meta {
    font-size: 0.8rem;
    color: rgba(148, 163, 184, 0.75);
  }

  .muted {
    color: rgba(148, 163, 184, 0.75);
  }

  @media (max-width: 820px) {
    .home {
      padding: 24px;
    }
  }
</style>
