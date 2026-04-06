<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  import { artistDetailCopy, commonCopy } from '../copy/zh-cn';
  import EmptyState from '../components/ui/EmptyState.svelte';
  import PageHeader from '../components/ui/PageHeader.svelte';
  import SurfacePanel from '../components/ui/SurfacePanel.svelte';
  import { getAlbumsByArtist, getArtist, getTracksByArtist } from '../api/library';
  import { playTrack as playTrackCommand, setQueue } from '../api/playback';
  import type { Album, Artist, Track } from '../types';
  import { createStaleRequestTracker, runGuardedRequest } from './stale-request';
  import {
    formatDate,
    formatDuration,
    formatLongDuration,
    formatTrackIndex,
  } from '../utils/format';

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
  const requestTracker = createStaleRequestTracker();

  $: if (artistId) {
    void loadArtist(artistId);
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

    await runGuardedRequest({
      id,
      tracker: requestTracker,
      onStart: () => {
        loading = true;
        error = '';
      },
      request: async () => {
        const [artistData, tracksData, albumsData] = await Promise.all([
          getArtist(id),
          getTracksByArtist(id),
          getAlbumsByArtist(id),
        ]);
        return { artistData, tracksData, albumsData };
      },
      onSuccess: ({ artistData, tracksData, albumsData }) => {
        artist = artistData;
        tracks = tracksData ?? [];
        albums = albumsData ?? [];
      },
      onError: (err) => {
        console.error('Failed to load artist detail:', err);
        artist = null;
        tracks = [];
        albums = [];
        error = 'Unable to load artist information.';
      },
      onFinally: () => {
        if (lastRequestedId === id) {
          loading = false;
        }
      },
    });
  }

  async function playTrack(track: Track) {
    try {
      await setQueue(tracks);
      await playTrackCommand(track);
    } catch (err) {
      console.error('Failed to play track:', err);
    }
    dispatch('playTrack', { track });
  }

  function handlePlayPopular() {
    const first = tracks[0];
    if (first) {
      void playTrack(first);
    }
  }

  function handleRowKeydown(event: KeyboardEvent, track: Track) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void playTrack(track);
    }
  }

  function handleOpenAlbum(id: string) {
    dispatch('openAlbum', { id });
  }
</script>

<section class="artist-detail">
  {#if !artistId}
    <EmptyState
      title={artistDetailCopy.selectTitle}
      body={artistDetailCopy.selectBody}
      align="center"
    />
  {:else if loading}
    <EmptyState
      title={artistDetailCopy.loadingTitle}
      body={artistDetailCopy.loadingBody}
      align="center"
    />
  {:else if error}
    <EmptyState title={artistDetailCopy.unavailableTitle} body={error} tone="danger" align="center" />
  {:else if !artist}
    <EmptyState
      title={artistDetailCopy.notFoundTitle}
      body={artistDetailCopy.notFoundBody}
      align="center"
    />
  {:else}
    <SurfacePanel tone="elevated" padding="spacious">
      <div class="hero">
        <div class="avatar">{artist.name.charAt(0)}</div>
        <div class="hero-copy">
          <span class="eyebrow">{artistDetailCopy.eyebrow}</span>
          <PageHeader title={artist.name} subtitle={`${artist.album_count} 张专辑 · ${artist.track_count} 首歌曲`}>
            <div slot="actions" class="actions">
              <button class="primary" on:click={handlePlayPopular}>{artistDetailCopy.playTopTrack}</button>
              <button disabled title={commonCopy.comingSoon}>{artistDetailCopy.follow}</button>
            </div>
          </PageHeader>
          <div class="meta">
            <span>{artistDetailCopy.since(formatDate(artist.date_added) || commonCopy.recently)}</span>
          </div>
          {#if artist.bio}
            <p class="bio">{artist.bio}</p>
          {/if}
        </div>
      </div>
    </SurfacePanel>

    <div class="columns">
      <SurfacePanel padding="compact">
        <section class="panel-section popular">
          <header>
            <h3>{artistDetailCopy.topTracks}</h3>
            <span>{formatLongDuration(tracks.reduce((sum, t) => sum + t.duration, 0))}</span>
          </header>
          {#if tracks.length === 0}
            <EmptyState
              title={artistDetailCopy.noTracksTitle}
              body={artistDetailCopy.noTracksBody}
            />
          {:else}
            <div class="track-table">
              {#each tracks as track, index}
                <div
                  class="row"
                  role="button"
                  tabindex="0"
                  on:dblclick={() => void playTrack(track)}
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
      </SurfacePanel>

      <SurfacePanel padding="compact">
        <section class="panel-section discography">
          <header>
            <h3>{artistDetailCopy.discography}</h3>
            <span>{artistDetailCopy.releases(albums.length)}</span>
          </header>
          {#if albums.length === 0}
            <EmptyState
              title={artistDetailCopy.noAlbumsTitle}
              body={artistDetailCopy.noAlbumsBody}
            />
          {:else}
            <div class="albums">
              {#each albums as album}
                <button class="album-card" on:click={() => handleOpenAlbum(album.id)}>
                  <div class="artwork">{album.title.charAt(0)}</div>
                  <div class="details">
                    <strong>{album.title}</strong>
                    <span>{album.year ?? commonCopy.unknownYear}</span>
                    <span>{album.track_count} 首歌曲 · {formatLongDuration(album.duration)}</span>
                  </div>
                </button>
              {/each}
            </div>
          {/if}
        </section>
      </SurfacePanel>
    </div>
  {/if}
</section>

<style>
  .artist-detail {
    padding: 32px 48px;
    color: var(--text-primary);
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .hero {
    display: flex;
    gap: 28px;
    align-items: center;
  }

  .avatar {
    width: 160px;
    height: 160px;
    border-radius: 50%;
    background: linear-gradient(
      160deg,
      color-mix(in srgb, var(--accent) 18%, transparent),
      color-mix(in srgb, var(--surface-panel-subtle) 92%, transparent)
    );
    display: grid;
    place-items: center;
    font-size: 3.5rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    flex-shrink: 0;
  }

  .hero-copy {
    min-width: 0;
    display: grid;
    gap: 12px;
    width: 100%;
  }

  .eyebrow {
    font-size: 0.75rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    font-size: 0.85rem;
    color: var(--text-tertiary);
  }

  .bio {
    margin: 0;
    color: var(--text-secondary);
    max-width: 520px;
  }

  .actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .actions button {
    border: none;
    border-radius: 999px;
    padding: 10px 22px;
    font-weight: 600;
    cursor: pointer;
    background: color-mix(in srgb, var(--surface-panel-subtle) 88%, transparent);
    color: var(--text-primary);
    transition:
      background 0.16s ease,
      box-shadow 0.16s ease,
      transform 0.16s ease;
  }

  .actions button:hover:not(:disabled),
  .actions button:focus-visible:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 16%, var(--surface-panel-subtle));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 24%, transparent);
    transform: translateY(-1px);
    outline: none;
  }

  .actions button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .actions .primary {
    background: color-mix(in srgb, var(--accent) 18%, var(--surface-panel-subtle));
    box-shadow: var(--glow-accent);
  }

  .columns {
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    gap: 24px;
  }

  .panel-section {
    display: grid;
    gap: 16px;
  }

  .panel-section header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .panel-section header h3 {
    margin: 0;
    font-size: 1.2rem;
    color: var(--text-primary);
  }

  .panel-section header span {
    font-size: 0.85rem;
    color: var(--text-tertiary);
  }

  .track-table {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: none;
    overflow: visible;
  }

  .row {
    display: grid;
    grid-template-columns: 60px 1fr 80px;
    align-items: center;
    padding: 10px 12px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--surface-panel-subtle) 88%, transparent);
    cursor: pointer;
    transition:
      background 0.15s ease,
      box-shadow 0.15s ease;
  }

  .row:hover,
  .row:focus-visible {
    background: var(--accent-soft);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent);
    outline: none;
  }

  .index {
    font-variant-numeric: tabular-nums;
    color: var(--text-tertiary);
  }

  .title span {
    color: var(--text-primary);
    font-weight: 600;
  }

  .title small {
    color: var(--text-tertiary);
    font-size: 0.75rem;
  }

  .duration {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--text-tertiary);
  }

  .albums {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: none;
    overflow: visible;
  }

  .album-card {
    border: 1px solid var(--border-subtle);
    border-radius: 14px;
    padding: 12px;
    display: flex;
    gap: 12px;
    align-items: center;
    background: color-mix(in srgb, var(--surface-panel-subtle) 88%, transparent);
    color: inherit;
    cursor: pointer;
    transition:
      background 0.15s ease,
      box-shadow 0.15s ease,
      border-color 0.15s ease;
  }

  .album-card:hover,
  .album-card:focus-visible {
    background: var(--accent-soft);
    border-color: color-mix(in srgb, var(--accent) 20%, var(--border-default));
    box-shadow: var(--shadow-soft);
    outline: none;
  }

  .album-card .artwork {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
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

  .album-card .details span {
    color: var(--text-tertiary);
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
