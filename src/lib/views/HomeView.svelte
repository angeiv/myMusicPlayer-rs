<script lang="ts">
  import EmptyState from '../components/ui/EmptyState.svelte';
  import PageHeader from '../components/ui/PageHeader.svelte';
  import SurfacePanel from '../components/ui/SurfacePanel.svelte';
  import { commonCopy, homeCopy } from '../copy/zh-cn';
  import type { Album, Artist, Playlist, Track } from '../types';
  import { formatDuration, formatLongDuration } from '../utils/format';

  export let tracks: Track[] = [];
  export let albums: Album[] = [];
  export let artists: Artist[] = [];
  export let playlists: Playlist[] = [];

  $: totalDuration = tracks.reduce((sum, track) => sum + track.duration, 0);
  $: averageDuration = tracks.length ? Math.round(totalDuration / tracks.length) : 0;
  $: totalAlbumDuration = albums.reduce((sum, album) => sum + album.duration, 0);
  $: recentTracks = tracks
    .slice()
    .sort((a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime())
    .slice(0, 5);
  $: leadingArtists = artists.slice(0, 5);
</script>

<section class="home">
  <PageHeader title={homeCopy.title} subtitle={homeCopy.subtitle}>
    <div slot="actions" class="home-summary-chip">
      <span>{formatLongDuration(totalDuration)}</span>
      <small>{homeCopy.totalListeningTime}</small>
    </div>
  </PageHeader>

  <div class="stats-grid">
    <SurfacePanel tone="inset" padding="compact">
      <div class="stat-card">
        <span class="stat-label">{homeCopy.songs}</span>
        <strong>{tracks.length}</strong>
        <span class="stat-meta">{homeCopy.averageLength(Math.floor(averageDuration / 60))}</span>
      </div>
    </SurfacePanel>

    <SurfacePanel tone="inset" padding="compact">
      <div class="stat-card">
        <span class="stat-label">{homeCopy.albums}</span>
        <strong>{albums.length}</strong>
        <span class="stat-meta">{formatLongDuration(totalAlbumDuration)}</span>
      </div>
    </SurfacePanel>

    <SurfacePanel tone="inset" padding="compact">
      <div class="stat-card">
        <span class="stat-label">{homeCopy.artists}</span>
        <strong>{artists.length}</strong>
        <span class="stat-meta">{homeCopy.diverseCollection}</span>
      </div>
    </SurfacePanel>

    <SurfacePanel tone="inset" padding="compact">
      <div class="stat-card">
        <span class="stat-label">{homeCopy.playlists}</span>
        <strong>{playlists.length}</strong>
        <span class="stat-meta">{homeCopy.customMixes}</span>
      </div>
    </SurfacePanel>
  </div>

  <div class="panel-grid">
    <SurfacePanel padding="spacious">
      <div class="section-heading">
        <span class="eyebrow">{homeCopy.libraryEyebrow}</span>
        <h3>{homeCopy.recentTracksTitle}</h3>
      </div>

      {#if recentTracks.length === 0}
        <EmptyState title={homeCopy.noRecentTracksTitle} body={homeCopy.noRecentTracksBody} />
      {:else}
        <ul class="summary-list">
          {#each recentTracks as track}
            <li class="summary-card selection-guard">
              <span class="title">{track.title}</span>
              <span class="meta">{track.artist_name ?? commonCopy.unknownArtist} · {formatDuration(track.duration)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </SurfacePanel>

    <SurfacePanel padding="spacious">
      <div class="section-heading">
        <span class="eyebrow">{homeCopy.browseEyebrow}</span>
        <h3>{homeCopy.topArtistsTitle}</h3>
      </div>

      {#if leadingArtists.length === 0}
        <EmptyState title={homeCopy.noArtistStatsTitle} body={homeCopy.noArtistStatsBody} />
      {:else}
        <ul class="summary-list">
          {#each leadingArtists as artist}
            <li class="summary-card selection-guard">
              <span class="title">{artist.name}</span>
              <span class="meta">{homeCopy.artistSummary(artist.album_count, artist.track_count)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </SurfacePanel>
  </div>
</section>

<style>
  .home {
    padding: 32px 48px;
    color: var(--text-primary);
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .home-summary-chip {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.2rem;
    min-width: 0;
    padding: 0.9rem 1rem;
    border-radius: 18px;
    border: 1px solid color-mix(in srgb, var(--accent) 16%, var(--border-default));
    background: color-mix(in srgb, var(--accent) 10%, var(--surface-panel));
    box-shadow: var(--shadow-soft);
    text-align: right;
  }

  .home-summary-chip span {
    font-weight: 700;
    color: var(--text-primary);
  }

  .home-summary-chip small {
    color: var(--text-tertiary);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
  }

  .stat-card {
    display: grid;
    gap: 0.45rem;
    min-width: 0;
  }

  .stat-label {
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }

  .stat-card strong {
    font-size: 2rem;
    line-height: 1;
    color: var(--text-primary);
  }

  .stat-meta {
    color: var(--text-secondary);
    font-size: 0.82rem;
  }

  .panel-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
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
    font-size: 1.15rem;
    color: var(--text-primary);
  }

  .summary-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .summary-card {
    display: grid;
    gap: 0.2rem;
    padding: 0.9rem 1rem;
    border-radius: 16px;
    background: color-mix(in srgb, var(--surface-panel-subtle) 88%, transparent);
    border: 1px solid var(--border-subtle);
  }

  .title {
    font-weight: 600;
    color: var(--text-primary);
  }

  .meta {
    font-size: 0.84rem;
    color: var(--text-secondary);
  }

  @media (max-width: 820px) {
    .home {
      padding: 24px;
    }

    .home-summary-chip {
      align-items: flex-start;
      text-align: left;
      width: 100%;
    }
  }
</style>
