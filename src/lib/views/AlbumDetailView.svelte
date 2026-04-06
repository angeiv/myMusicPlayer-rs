<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  import { getAlbum, getTracksByAlbum } from '../api/library';
  import { playTrack as playTrackCommand, setQueue } from '../api/playback';
  import { albumDetailCopy, commonCopy } from '../locales/zh-cn';
  import TrackActionRow from '../components/library/TrackActionRow.svelte';
  import EmptyState from '../components/ui/EmptyState.svelte';
  import PageHeader from '../components/ui/PageHeader.svelte';
  import SurfacePanel from '../components/ui/SurfacePanel.svelte';
  import type { Album, Track } from '../types';
  import {
    getMissingTrackPlayMessage,
    getPlayableTracks,
    getTrackAvailabilityBadge,
    getTrackAvailabilityDescription,
    getTrackAvailabilityState,
    isTrackPlayable,
  } from '../utils/track-availability';
  import { formatDate, formatDuration, formatLongDuration, formatTrackIndex } from '../utils/format';
  import { createStaleRequestTracker, runGuardedRequest } from './stale-request';

  export let albumId: string | null = null;

  const dispatch = createEventDispatcher<{ playTrack: { track: Track } }>();
  const requestTracker = createStaleRequestTracker();
  const heroPlayHintId = 'album-detail-play-hint';

  let album: Album | null = null;
  let tracks: Track[] = [];
  let loading = false;
  let error = '';
  let feedback = '';
  let lastRequestedId: string | null = null;
  let activeTrackId: string | null = null;
  let playingTrackId: string | null = null;

  $: playableTracks = getPlayableTracks(tracks);
  $: canPlayAlbum = playableTracks.length > 0;
  $: heroPlayHint = canPlayAlbum ? '' : getMissingTrackPlayMessage('collection');

  $: if (albumId) {
    void loadAlbum(albumId);
  } else {
    album = null;
    tracks = [];
    feedback = '';
    activeTrackId = null;
    playingTrackId = null;
  }

  async function loadAlbum(id: string) {
    if (lastRequestedId === id && (loading || album)) {
      return;
    }

    loading = true;
    error = '';
    feedback = '';
    activeTrackId = null;
    playingTrackId = null;
    lastRequestedId = id;

    await runGuardedRequest({
      id,
      tracker: requestTracker,
      onStart: () => {
        loading = true;
        error = '';
        feedback = '';
        activeTrackId = null;
        playingTrackId = null;
      },
      request: async () => {
        const [albumResponse, tracksResponse] = await Promise.all([
          getAlbum(id),
          getTracksByAlbum(id),
        ]);
        return { albumResponse, tracksResponse };
      },
      onSuccess: ({ albumResponse, tracksResponse }) => {
        album = albumResponse;
        tracks = tracksResponse ?? [];
      },
      onError: (err) => {
        console.error('Failed to load album detail:', err);
        album = null;
        tracks = [];
        error = 'Unable to load album information.';
      },
      onFinally: () => {
        if (lastRequestedId === id) {
          loading = false;
        }
      },
    });
  }

  async function startTrackPlayback(track: Track) {
    activeTrackId = track.id;

    if (!isTrackPlayable(track)) {
      feedback = getMissingTrackPlayMessage('track');
      return;
    }

    const queue = getPlayableTracks(tracks);
    if (queue.length === 0) {
      feedback = getMissingTrackPlayMessage('collection');
      return;
    }

    try {
      await setQueue(queue);
      await playTrackCommand(track);
      feedback = '';
      playingTrackId = track.id;
      dispatch('playTrack', { track });
    } catch (err) {
      console.error('Failed to play track:', err);
    }
  }

  function handlePlayAll() {
    const firstPlayableTrack = playableTracks[0];
    if (!firstPlayableTrack) {
      feedback = heroPlayHint;
      return;
    }

    void startTrackPlayback(firstPlayableTrack);
  }

  function handleRowFocus(track: Track) {
    activeTrackId = track.id;
  }

  function handleRowKeydown(event: KeyboardEvent, track: Track) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Space') {
      event.preventDefault();
      void startTrackPlayback(track);
    }
  }
</script>

<section class="album-detail">
  {#if !albumId}
    <EmptyState
      title={albumDetailCopy.selectTitle}
      body={albumDetailCopy.selectBody}
      align="center"
    />
  {:else if loading}
    <EmptyState
      title={albumDetailCopy.loadingTitle}
      body={albumDetailCopy.loadingBody}
      align="center"
    />
  {:else if error}
    <EmptyState title={albumDetailCopy.unavailableTitle} body={error} tone="danger" align="center" />
  {:else if !album}
    <EmptyState
      title={albumDetailCopy.notFoundTitle}
      body={albumDetailCopy.notFoundBody}
      align="center"
    />
  {:else}
    {#if feedback}
      <SurfacePanel tone="inset" padding="compact">
        <p class="feedback" role="status" aria-live="polite">{feedback}</p>
      </SurfacePanel>
    {/if}

    <SurfacePanel tone="elevated" padding="spacious">
      <div class="hero">
        <div class="artwork">{album.title.charAt(0)}</div>
        <div class="hero-copy">
          <span class="eyebrow">{albumDetailCopy.eyebrow}</span>
          <PageHeader
            title={album.title}
            subtitle={album.artist_name ?? commonCopy.variousArtists}
          >
            <div slot="actions" class="actions">
              <button
                class="primary"
                disabled={!canPlayAlbum}
                aria-describedby={!canPlayAlbum ? heroPlayHintId : undefined}
                title={!canPlayAlbum ? heroPlayHint : undefined}
                on:click={handlePlayAll}
              >
                ▶ {albumDetailCopy.play}
              </button>
              <button disabled title={commonCopy.comingSoon}>☆ {albumDetailCopy.favorite}</button>
            </div>
          </PageHeader>
          <div class="meta">
            <span>{album.track_count} 首歌曲</span>
            <span>{formatLongDuration(album.duration)}</span>
            {#if album.year}
              <span>{album.year}</span>
            {/if}
            <span>{commonCopy.addedAt(formatDate(album.date_added) || commonCopy.recently)}</span>
          </div>
          {#if !canPlayAlbum}
            <span id={heroPlayHintId} class="sr-only">{heroPlayHint}</span>
          {/if}
        </div>
      </div>
    </SurfacePanel>

    <SurfacePanel padding="compact">
      <div class="tracks" role="table" aria-label={albumDetailCopy.tableAriaLabel}>
        <div class="track-header" role="row">
          <div>#</div>
          <div>{albumDetailCopy.columns.title}</div>
          <div>{albumDetailCopy.columns.duration}</div>
        </div>
        <div class="track-body">
          {#each tracks as track, index}
            {@const playable = isTrackPlayable(track)}
            {@const availability = getTrackAvailabilityState(track)}
            {@const availabilityBadge = getTrackAvailabilityBadge(track)}
            {@const availabilityDescription = getTrackAvailabilityDescription(track)}
            {@const availabilityDescriptionId = !playable ? `album-track-availability-${index}` : undefined}
            <TrackActionRow
              availability={availability}
              active={activeTrackId === track.id}
              playing={playingTrackId === track.id}
              interactive={true}
              role="row"
              tabindex={0}
              ariaDisabled={!playable ? 'true' : undefined}
              ariaDescribedBy={availabilityDescriptionId}
              columnTemplate="72px minmax(0, 1fr) 112px"
              on:focus={() => handleRowFocus(track)}
              on:click={() => handleRowFocus(track)}
              on:dblclick={() => void startTrackPlayback(track)}
              on:keydown={(event) => handleRowKeydown(event, track)}
            >
              <div class="track-action-row__cell track-action-row__numeric index">{formatTrackIndex(index)}</div>
              <div class="track-action-row__cell track-action-row__title-stack">
                <span class="track-action-row__title">{track.title}</span>
                {#if availabilityBadge || (track.artist_name && track.artist_name !== album?.artist_name)}
                  <div class="track-action-row__meta">
                    {#if availabilityBadge}
                      <span class="track-action-row__badge">{availabilityBadge}</span>
                    {/if}
                    {#if track.artist_name && track.artist_name !== album?.artist_name}
                      <small class="track-action-row__meta-text">{track.artist_name}</small>
                    {/if}
                  </div>
                {/if}
                {#if availabilityDescriptionId}
                  <span id={availabilityDescriptionId} class="sr-only">{availabilityDescription}</span>
                {/if}
              </div>
              <div class="track-action-row__cell track-action-row__numeric duration">{formatDuration(track.duration)}</div>
            </TrackActionRow>
          {/each}
        </div>
      </div>
    </SurfacePanel>
  {/if}
</section>

<style>
  .album-detail {
    padding: 32px 48px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    color: var(--text-primary);
  }

  .feedback {
    color: var(--text-secondary);
  }

  .hero {
    display: flex;
    gap: 28px;
    align-items: center;
  }

  .artwork {
    width: 180px;
    height: 180px;
    border-radius: 22px;
    background: linear-gradient(
      160deg,
      color-mix(in srgb, var(--accent) 18%, transparent),
      color-mix(in srgb, var(--surface-panel-subtle) 92%, transparent)
    );
    display: grid;
    place-items: center;
    font-size: 4rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    color: var(--text-primary);
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

  .tracks {
    overflow: hidden;
  }

  .track-header {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr) 112px;
    align-items: center;
    padding: 12px 24px;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 0.75rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-tertiary);
    background: color-mix(in srgb, var(--surface-panel-subtle) 90%, transparent);
  }

  .track-body {
    max-height: none;
    overflow: visible;
  }

  .index {
    text-align: center;
  }

  .duration {
    text-align: right;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 900px) {
    .album-detail {
      padding: 24px;
    }

    .hero {
      flex-direction: column;
      align-items: flex-start;
    }

    .artwork {
      width: 140px;
      height: 140px;
    }

    .track-header {
      grid-template-columns: 60px minmax(0, 1fr) 96px;
      padding: 12px 20px;
    }
  }
</style>
