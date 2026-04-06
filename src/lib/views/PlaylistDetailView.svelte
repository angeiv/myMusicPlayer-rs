<script context="module" lang="ts">
  type PlaylistLoadGuardState = {
    lastRequestedId: string | null;
    loading: boolean;
    hasPlaylist: boolean;
    force: boolean;
  };

  export function shouldSkipPlaylistLoad(id: string, state: PlaylistLoadGuardState): boolean {
    return !state.force && state.lastRequestedId === id && (state.loading || state.hasPlaylist);
  }
</script>

<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  import { playTrack as playTrackCommand, setQueue } from '../api/playback';
  import {
    getPlaylist,
    getPlaylistTracks,
    removeFromPlaylist,
    updatePlaylistMetadata,
  } from '../api/playlist';
  import { commonCopy, playlistDetailCopy } from '../copy/zh-cn';
  import TrackActionRow from '../components/library/TrackActionRow.svelte';
  import EmptyState from '../components/ui/EmptyState.svelte';
  import PageHeader from '../components/ui/PageHeader.svelte';
  import SurfacePanel from '../components/ui/SurfacePanel.svelte';
  import type { Playlist, Track } from '../types';
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

  export let playlistId: string | null = null;

  const dispatch = createEventDispatcher<{
    playTrack: { track: Track };
    refreshPlaylists: void;
  }>();

  const requestTracker = createStaleRequestTracker();
  const heroPlayHintId = 'playlist-detail-play-hint';

  let playlist: Playlist | null = null;
  let tracks: Track[] = [];
  let loading = false;
  let error = '';
  let feedback = '';
  let lastRequestedId: string | null = null;
  let activeTrackId: string | null = null;
  let playingTrackId: string | null = null;

  type LoadPlaylistOptions = {
    force?: boolean;
  };

  $: playableTracks = getPlayableTracks(tracks);
  $: canPlayPlaylist = playableTracks.length > 0;
  $: heroPlayHint = canPlayPlaylist ? '' : getMissingTrackPlayMessage('collection');

  $: if (playlistId) {
    void loadPlaylist(playlistId);
  } else {
    playlist = null;
    tracks = [];
    feedback = '';
    activeTrackId = null;
    playingTrackId = null;
  }

  async function loadPlaylist(id: string, options: LoadPlaylistOptions = {}) {
    if (
      shouldSkipPlaylistLoad(id, {
        lastRequestedId,
        loading,
        hasPlaylist: Boolean(playlist),
        force: options.force ?? false,
      })
    ) {
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
        const playlistData = await getPlaylist(id);
        if (!playlistData) {
          return { playlistData, tracks: [] as Track[] };
        }

        const resolved = await getPlaylistTracks(id);
        return { playlistData, tracks: resolved ?? [] };
      },
      onSuccess: ({ playlistData, tracks: resolvedTracks }) => {
        playlist = playlistData;
        tracks = resolvedTracks;
      },
      onError: (err) => {
        console.error('Failed to load playlist detail:', err);
        playlist = null;
        tracks = [];
        error = '无法加载播放列表。';
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

  async function handleRemoveTrack(index: number) {
    if (!playlistId) return;

    try {
      await removeFromPlaylist(playlistId, index);
      await loadPlaylist(playlistId, { force: true });
    } catch (err) {
      console.error('Failed to remove track:', err);
      alert(playlistDetailCopy.removeTrackFailed);
    }
  }

  async function handleRename() {
    if (!playlistId || !playlist) return;
    const name = window.prompt(playlistDetailCopy.renamePrompt, playlist.name);
    if (!name || name.trim() === playlist.name) return;

    const trimmed = name.trim();

    try {
      await updatePlaylistMetadata(playlistId, trimmed, playlist.description ?? null);
      await loadPlaylist(playlistId, { force: true });
      dispatch('refreshPlaylists');
    } catch (err) {
      console.error('Failed to rename playlist:', err);
      alert(playlistDetailCopy.renameFailed);
    }
  }
</script>

<section class="playlist-detail">
  {#if !playlistId}
    <EmptyState
      title={playlistDetailCopy.selectTitle}
      body={playlistDetailCopy.selectBody}
      align="center"
    />
  {:else if loading}
    <EmptyState
      title={playlistDetailCopy.loadingTitle}
      body={playlistDetailCopy.loadingBody}
      align="center"
    />
  {:else if error}
    <EmptyState title={playlistDetailCopy.unavailableTitle} body={error} tone="danger" align="center" />
  {:else if !playlist}
    <EmptyState
      title={playlistDetailCopy.notFoundTitle}
      body={playlistDetailCopy.notFoundBody}
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
        <div class="artwork">{playlist.name.charAt(0)}</div>
        <div class="hero-copy">
          <span class="eyebrow">{playlistDetailCopy.eyebrow}</span>
          <PageHeader title={playlist.name} subtitle={playlist.description ?? commonCopy.noDescriptionYet}>
            <div slot="actions" class="hero-actions">
              <button
                class="primary"
                disabled={!canPlayPlaylist}
                aria-describedby={!canPlayPlaylist ? heroPlayHintId : undefined}
                title={!canPlayPlaylist ? heroPlayHint : undefined}
                on:click={handlePlayAll}
              >
                {playlistDetailCopy.play}
              </button>
              <button on:click={handleRename}>{playlistDetailCopy.rename}</button>
              <button disabled title={commonCopy.comingSoon}>{playlistDetailCopy.addTracks}</button>
            </div>
          </PageHeader>
          <div class="meta">
            <span>{tracks.length} 首歌曲</span>
            <span>{formatLongDuration(tracks.reduce((acc, track) => acc + track.duration, 0))}</span>
            <span>{commonCopy.createdAt(formatDate(playlist.created_at) || commonCopy.recently)}</span>
            <span>{commonCopy.updatedAt(formatDate(playlist.updated_at) || commonCopy.recently)}</span>
          </div>
          {#if !canPlayPlaylist}
            <span id={heroPlayHintId} class="sr-only">{heroPlayHint}</span>
          {/if}
        </div>
      </div>
    </SurfacePanel>

    <SurfacePanel padding="compact">
      <div class="tracks" role="table" aria-label={playlistDetailCopy.tableAriaLabel}>
        <div class="track-header" role="row">
          <div>#</div>
          <div>{playlistDetailCopy.columns.title}</div>
          <div>{playlistDetailCopy.columns.album}</div>
          <div>{playlistDetailCopy.columns.duration}</div>
          <div></div>
        </div>
        <div class="track-body">
          {#each tracks as track, index}
            {@const playable = isTrackPlayable(track)}
            {@const availability = getTrackAvailabilityState(track)}
            {@const availabilityBadge = getTrackAvailabilityBadge(track)}
            {@const availabilityDescription = getTrackAvailabilityDescription(track)}
            {@const availabilityDescriptionId = !playable ? `playlist-track-availability-${index}` : undefined}
            <TrackActionRow
              availability={availability}
              active={activeTrackId === track.id}
              playing={playingTrackId === track.id}
              interactive={true}
              role="row"
              tabindex={0}
              ariaDisabled={!playable ? 'true' : undefined}
              ariaDescribedBy={availabilityDescriptionId}
              columnTemplate="64px minmax(0, 2fr) minmax(0, 1.25fr) 96px 116px"
              on:focus={() => handleRowFocus(track)}
              on:click={() => handleRowFocus(track)}
              on:dblclick={() => void startTrackPlayback(track)}
              on:keydown={(event) => handleRowKeydown(event, track)}
            >
              <div class="track-action-row__cell track-action-row__numeric index">{formatTrackIndex(index)}</div>
              <div class="track-action-row__cell track-action-row__title-stack">
                <span class="track-action-row__title">{track.title}</span>
                <div class="track-action-row__meta">
                  {#if availabilityBadge}
                    <span class="track-action-row__badge">{availabilityBadge}</span>
                  {/if}
                  <small class="track-action-row__meta-text">{track.artist_name ?? commonCopy.unknownArtist}</small>
                </div>
                {#if availabilityDescriptionId}
                  <span id={availabilityDescriptionId} class="sr-only">{availabilityDescription}</span>
                {/if}
              </div>
              <div class="track-action-row__cell track-action-row__muted album">{track.album_title ?? commonCopy.unknownAlbum}</div>
              <div class="track-action-row__cell track-action-row__numeric duration">{formatDuration(track.duration)}</div>
              <div class="track-action-row__cell track-action-row__actions">
                <button
                  class="track-action-row__button"
                  aria-label={`播放 ${track.title}`}
                  disabled={!playable}
                  aria-describedby={!playable ? availabilityDescriptionId : undefined}
                  title={!playable ? availabilityDescription : undefined}
                  on:click|stopPropagation={() => void startTrackPlayback(track)}
                >
                  ▶
                </button>
                <button
                  class="track-action-row__button"
                  aria-label={`从歌单移除 ${track.title}`}
                  on:click|stopPropagation={() => void handleRemoveTrack(index)}
                >
                  🗑
                </button>
              </div>
            </TrackActionRow>
          {/each}
        </div>
      </div>
    </SurfacePanel>
  {/if}
</section>

<style>
  .playlist-detail {
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
    gap: 24px;
    align-items: center;
  }

  .artwork {
    width: 160px;
    height: 160px;
    border-radius: 24px;
    background: linear-gradient(
      150deg,
      color-mix(in srgb, var(--accent) 22%, transparent),
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
    font-size: 0.84rem;
    color: var(--text-tertiary);
  }

  .hero-actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .hero-actions button {
    border: none;
    border-radius: 999px;
    padding: 10px 20px;
    font-weight: 600;
    cursor: pointer;
    background: color-mix(in srgb, var(--surface-panel-subtle) 88%, transparent);
    color: var(--text-primary);
    transition:
      background 0.16s ease,
      box-shadow 0.16s ease,
      transform 0.16s ease;
  }

  .hero-actions button:hover:not(:disabled),
  .hero-actions button:focus-visible:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 16%, var(--surface-panel-subtle));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 24%, transparent);
    transform: translateY(-1px);
    outline: none;
  }

  .hero-actions button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .hero-actions .primary {
    background: color-mix(in srgb, var(--accent) 18%, var(--surface-panel-subtle));
    box-shadow: var(--glow-accent);
  }

  .tracks {
    overflow: hidden;
  }

  .track-header {
    display: grid;
    grid-template-columns: 64px minmax(0, 2fr) minmax(0, 1.25fr) 96px 116px;
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

  .album,
  .duration {
    min-width: 0;
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

  @media (max-width: 940px) {
    .playlist-detail {
      padding: 24px;
    }

    .hero {
      flex-direction: column;
      align-items: flex-start;
    }

    .artwork {
      width: 120px;
      height: 120px;
    }

    .track-header {
      grid-template-columns: 50px minmax(0, 2fr) minmax(0, 1.2fr) 80px 88px;
      padding: 12px 20px;
    }
  }
</style>
