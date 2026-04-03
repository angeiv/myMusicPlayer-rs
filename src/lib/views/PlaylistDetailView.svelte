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
    lastRequestedId = id;

    await runGuardedRequest({
      id,
      tracker: requestTracker,
      onStart: () => {
        loading = true;
        error = '';
        feedback = '';
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
        error = 'Unable to load playlist.';
      },
      onFinally: () => {
        if (lastRequestedId === id) {
          loading = false;
        }
      },
    });
  }

  async function startTrackPlayback(track: Track) {
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

  async function handleRemoveTrack(index: number) {
    if (!playlistId) return;

    try {
      await removeFromPlaylist(playlistId, index);
      await loadPlaylist(playlistId, { force: true });
    } catch (err) {
      console.error('Failed to remove track:', err);
      alert('Failed to remove track from playlist.');
    }
  }

  async function handleRename() {
    if (!playlistId || !playlist) return;
    const name = window.prompt('Rename playlist', playlist.name);
    if (!name || name.trim() === playlist.name) return;

    const trimmed = name.trim();

    try {
      await updatePlaylistMetadata(playlistId, trimmed, playlist.description ?? null);
      await loadPlaylist(playlistId, { force: true });
      dispatch('refreshPlaylists');
    } catch (err) {
      console.error('Failed to rename playlist:', err);
      alert('Could not rename playlist.');
    }
  }
</script>

<section class="playlist-detail">
  {#if !playlistId}
    <div class="empty">Select a playlist to manage it.</div>
  {:else if loading}
    <div class="empty">Loading playlist…</div>
  {:else if error}
    <div class="empty">{error}</div>
  {:else if !playlist}
    <div class="empty">Playlist not found.</div>
  {:else}
    {#if feedback}
      <p class="feedback" role="status" aria-live="polite">{feedback}</p>
    {/if}

    <div class="hero">
      <div class="artwork">{playlist.name.charAt(0)}</div>
      <div class="info">
        <span class="label">Playlist</span>
        <h2>{playlist.name}</h2>
        <p class="description">{playlist.description ?? 'No description yet.'}</p>
        <div class="meta">
          <span>{tracks.length} tracks</span>
          <span>
            {formatLongDuration(tracks.reduce((acc, track) => acc + track.duration, 0))}
          </span>
          <span>Created {formatDate(playlist.created_at) || 'recently'}</span>
          <span>Updated {formatDate(playlist.updated_at) || 'recently'}</span>
        </div>
        <div class="hero-actions">
          <button
            class="primary"
            disabled={!canPlayPlaylist}
            aria-describedby={!canPlayPlaylist ? heroPlayHintId : undefined}
            title={!canPlayPlaylist ? heroPlayHint : undefined}
            on:click={handlePlayAll}
          >
            ▶ Play
          </button>
          <button on:click={handleRename}>✏ Rename</button>
          <button disabled title="Coming soon">➕ Add tracks</button>
          {#if !canPlayPlaylist}
            <span id={heroPlayHintId} class="sr-only">{heroPlayHint}</span>
          {/if}
        </div>
      </div>
    </div>

    <div class="tracks" role="table" aria-label="Playlist tracks">
      <div class="track-header" role="row">
        <div>#</div>
        <div>Title</div>
        <div>Album</div>
        <div>Duration</div>
        <div></div>
      </div>
      <div class="track-body">
        {#each tracks as track, index}
          {@const playable = isTrackPlayable(track)}
          {@const availability = getTrackAvailabilityState(track)}
          {@const availabilityBadge = getTrackAvailabilityBadge(track)}
          {@const availabilityDescription = getTrackAvailabilityDescription(track)}
          {@const availabilityDescriptionId = !playable ? `playlist-track-availability-${index}` : undefined}
          <div class="track-row" class:is-missing={!playable} role="row" data-availability={availability}>
            <div class="index">{formatTrackIndex(index)}</div>
            <div class="title">
              <span>{track.title}</span>
              <div class="meta-line">
                {#if availabilityBadge}
                  <span class="availability-badge">{availabilityBadge}</span>
                {/if}
                <small>{track.artist_name ?? 'Unknown artist'}</small>
              </div>
              {#if availabilityDescriptionId}
                <span id={availabilityDescriptionId} class="sr-only">{availabilityDescription}</span>
              {/if}
            </div>
            <div class="album">{track.album_title ?? 'Unknown album'}</div>
            <div class="duration">{formatDuration(track.duration)}</div>
            <div class="track-actions">
              <button
                class="ghost"
                aria-label={`播放 ${track.title}`}
                disabled={!playable}
                aria-describedby={!playable ? availabilityDescriptionId : undefined}
                title={!playable ? availabilityDescription : undefined}
                on:click={() => void startTrackPlayback(track)}
              >
                ▶
              </button>
              <button
                class="ghost"
                aria-label={`从歌单移除 ${track.title}`}
                on:click={() => void handleRemoveTrack(index)}
              >
                🗑
              </button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</section>

<style>
  .playlist-detail {
    padding: 32px 48px;
    color: #e2e8f0;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .empty {
    padding: 120px 0;
    text-align: center;
    border-radius: 24px;
    background: rgba(15, 23, 42, 0.65);
    color: rgba(148, 163, 184, 0.75);
  }

  .feedback {
    margin: 0;
    padding: 12px 16px;
    border-radius: 14px;
    border: 1px solid rgba(248, 113, 113, 0.28);
    background: rgba(15, 23, 42, 0.72);
    color: rgba(254, 202, 202, 0.92);
  }

  .hero {
    display: flex;
    gap: 24px;
    padding: 24px;
    border-radius: 24px;
    background: linear-gradient(140deg, rgba(79, 70, 229, 0.32), rgba(14, 116, 144, 0.22));
  }

  .artwork {
    width: 160px;
    height: 160px;
    border-radius: 24px;
    background: rgba(15, 23, 42, 0.6);
    display: grid;
    place-items: center;
    font-size: 3.5rem;
    font-weight: 700;
    letter-spacing: 0.12em;
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .label {
    font-size: 0.75rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(226, 232, 240, 0.65);
  }

  h2 {
    margin: 0;
    font-size: 2.3rem;
    color: #f4f4f5;
  }

  .description {
    margin: 0;
    color: rgba(226, 232, 240, 0.85);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    font-size: 0.84rem;
    color: rgba(191, 219, 254, 0.75);
  }

  .hero-actions {
    display: flex;
    gap: 12px;
  }

  .hero-actions button {
    border: none;
    border-radius: 999px;
    padding: 10px 20px;
    font-weight: 600;
    cursor: pointer;
    background: rgba(15, 23, 42, 0.45);
    color: #bfdbfe;
  }

  .hero-actions button:disabled,
  .track-actions button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .hero-actions .primary {
    background: rgba(99, 102, 241, 0.35);
    color: #eef2ff;
    box-shadow: 0 18px 30px rgba(99, 102, 241, 0.3);
  }

  .tracks {
    background: rgba(15, 23, 42, 0.78);
    border-radius: 20px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    overflow: hidden;
  }

  .track-header,
  .track-row {
    display: grid;
    grid-template-columns: 70px 2fr 1.5fr 120px 100px;
    align-items: center;
  }

  .track-header {
    padding: 14px 24px;
    font-size: 0.75rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(148, 163, 184, 0.8);
    background: rgba(30, 41, 59, 0.65);
  }

  .track-body {
    max-height: none;
    overflow: visible;
  }

  .track-row {
    padding: 14px 24px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.12);
    transition: background 0.15s ease;
  }

  .track-row:hover {
    background: rgba(79, 70, 229, 0.18);
  }

  .track-row.is-missing:hover {
    background: rgba(148, 163, 184, 0.08);
  }

  .track-row.is-missing .title > span {
    color: rgba(226, 232, 240, 0.82);
  }

  .track-row.is-missing .album,
  .track-row.is-missing .duration,
  .track-row.is-missing .index,
  .track-row.is-missing .meta-line small {
    color: rgba(148, 163, 184, 0.78);
  }

  .index {
    font-variant-numeric: tabular-nums;
    color: rgba(148, 163, 184, 0.8);
  }

  .title {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .title > span {
    display: block;
    font-weight: 600;
    color: #f8fafc;
  }

  .meta-line {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .meta-line small {
    color: rgba(148, 163, 184, 0.75);
    font-size: 0.75rem;
  }

  .availability-badge {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    border: 1px solid rgba(248, 113, 113, 0.35);
    background: rgba(127, 29, 29, 0.28);
    color: rgba(254, 202, 202, 0.92);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 2px 8px;
  }

  .album {
    color: rgba(226, 232, 240, 0.78);
  }

  .duration {
    font-variant-numeric: tabular-nums;
    color: rgba(148, 163, 184, 0.8);
  }

  .track-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .ghost {
    border: none;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(30, 41, 59, 0.6);
    color: #e2e8f0;
    cursor: pointer;
  }

  .ghost:hover {
    background: rgba(96, 165, 250, 0.3);
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

    .track-header,
    .track-row {
      grid-template-columns: 50px 2fr 1.2fr 80px 80px;
    }
  }
</style>
