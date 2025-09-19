<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import type { Playlist, Track } from '../types';
  import { formatDate, formatDuration, formatLongDuration, formatTrackIndex } from '../utils/format';
  import { isTauri } from '../utils/env';
  import {
    getMockPlaylistById,
    getMockPlaylistTracks,
    removeMockTrackFromPlaylist,
    renameMockPlaylist,
  } from '../mocks/library';

  export let playlistId: string | null = null;

  const dispatch = createEventDispatcher<{ playTrack: { track: Track } }>();

  let playlist: Playlist | null = null;
  let tracks: Track[] = [];
  let loading = false;
  let error = '';
  let lastRequestedId: string | null = null;

  $: if (playlistId) {
    loadPlaylist(playlistId);
  } else {
    playlist = null;
    tracks = [];
  }

  async function loadPlaylist(id: string) {
    if (lastRequestedId === id && (loading || playlist)) {
      return;
    }

    loading = true;
    error = '';
    lastRequestedId = id;

    const loadFromMock = () => {
      playlist = getMockPlaylistById(id);
      tracks = getMockPlaylistTracks(id);
    };

    try {
      if (!isTauri) {
        loadFromMock();
        return;
      }

      const playlistData = await invoke<Playlist | null>('get_playlist', { id });
      if (lastRequestedId !== id) {
        return;
      }

      playlist = playlistData;
      if (!playlistData) {
        tracks = [];
        return;
      }

      const trackRequests = playlistData.track_ids.map((trackId) =>
        invoke<Track | null>('get_track', { id: trackId })
      );
      const resolved = await Promise.all(trackRequests);
      if (lastRequestedId !== id) {
        return;
      }

      tracks = resolved.filter((track): track is Track => !!track);
    } catch (err) {
      console.error('Failed to load playlist detail:', err);
      loadFromMock();
      error = isTauri ? 'Unable to load playlist.' : '';
    } finally {
      if (lastRequestedId === id) {
        loading = false;
      }
    }
  }

  async function playTrack(track: Track) {
    if (isTauri) {
      try {
        await invoke('play', { track });
      } catch (err) {
        console.error('Failed to play track:', err);
      }
    }
    dispatch('playTrack', { track });
  }

  function handlePlayAll() {
    const first = tracks[0];
    if (first) {
      playTrack(first);
    }
  }

  async function handleRemoveTrack(index: number) {
    if (!playlistId) return;
    if (!isTauri) {
      removeMockTrackFromPlaylist(playlistId, index);
      await loadPlaylist(playlistId);
      return;
    }

    try {
      await invoke('remove_from_playlist', { playlistId, trackIndex: index });
      await loadPlaylist(playlistId);
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

    if (!isTauri) {
      renameMockPlaylist(playlistId, trimmed);
      await loadPlaylist(playlistId);
      return;
    }

    try {
      await invoke('update_playlist_metadata', {
        id: playlistId,
        name: trimmed,
        description: playlist.description,
      });
      await loadPlaylist(playlistId);
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
        <div class="actions">
          <button class="primary" on:click={handlePlayAll}>▶ Play</button>
          <button on:click={handleRename}>✏ Rename</button>
          <button disabled title="Coming soon">➕ Add tracks</button>
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
          <div class="track-row" role="row">
            <div class="index">{formatTrackIndex(index)}</div>
            <div class="title">
              <span>{track.title}</span>
              <small>{track.artist_name ?? 'Unknown artist'}</small>
            </div>
            <div class="album">{track.album_title ?? 'Unknown album'}</div>
            <div class="duration">{formatDuration(track.duration)}</div>
            <div class="actions">
              <button class="ghost" on:click={() => playTrack(track)}>▶</button>
              <button class="ghost" on:click={() => handleRemoveTrack(index)}>🗑</button>
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

  .actions {
    display: flex;
    gap: 12px;
  }

  .actions button {
    border: none;
    border-radius: 999px;
    padding: 10px 20px;
    font-weight: 600;
    cursor: pointer;
    background: rgba(15, 23, 42, 0.45);
    color: #bfdbfe;
  }

  .actions .primary {
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
    max-height: calc(100vh - 320px);
    overflow-y: auto;
  }

  .track-row {
    padding: 14px 24px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.12);
    transition: background 0.15s ease;
  }

  .track-row:hover {
    background: rgba(79, 70, 229, 0.18);
  }

  .index {
    font-variant-numeric: tabular-nums;
    color: rgba(148, 163, 184, 0.8);
  }

  .title span {
    display: block;
    font-weight: 600;
    color: #f8fafc;
  }

  .title small {
    color: rgba(148, 163, 184, 0.75);
    font-size: 0.75rem;
  }

  .album {
    color: rgba(226, 232, 240, 0.78);
  }

  .duration {
    font-variant-numeric: tabular-nums;
    color: rgba(148, 163, 184, 0.8);
  }

  .track-row .actions {
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
