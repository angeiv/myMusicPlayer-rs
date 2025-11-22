<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { open } from '@tauri-apps/plugin-dialog';
  import type { PlaybackStateInfo, Track } from '../types';
  import { isTauri } from '../utils/env';
  import { getMockTracks } from '../mocks/library';

  const REFRESH_INTERVAL = 1000;

  let currentTrack: Track | null = null;
  let playbackState: PlaybackStateInfo = { state: 'stopped' };
  let volume = 1.0;
  let progress = 0;
  let duration = 0;
  let isSeeking = false;
  let favorites = new Set<string>();
  let shuffleEnabled = false;
  let repeatMode: 'off' | 'all' | 'one' = 'off';
  let showQueue = false;
  let showVolumeSlider = false;
  let lastUpdateTimer: ReturnType<typeof setInterval> | null = null;

  const repeatModes: Array<'off' | 'all' | 'one'> = ['off', 'all', 'one'];

  const volumePercentage = () => Math.round(volume * 100);

  // Make isPlaying reactive
  $: isPlaying = playbackState.state === 'playing';

  onMount(async () => {
    if (isTauri) {
      await refreshState();
      lastUpdateTimer = setInterval(refreshState, REFRESH_INTERVAL);
    } else {
      initializeMockPlayback();
      lastUpdateTimer = setInterval(() => {
        if (playbackState.state !== 'playing') {
          return;
        }
        if (!duration && currentTrack) {
          duration = currentTrack.duration;
        }
        const total = duration || currentTrack?.duration || 0;
        if (total === 0) return;
        progress = Math.min(progress + 1, total);
        if (progress >= total) {
          progress = 0;
        }
        playbackState = { state: 'playing', position: progress, duration: total };
      }, REFRESH_INTERVAL);
    }
  });

  onDestroy(() => {
    if (lastUpdateTimer) {
      clearInterval(lastUpdateTimer);
    }
  });

  async function refreshState() {
    if (!isTauri) {
      return;
    }

    try {
      const [rawState, track, currentVolume] = await Promise.all([
        invoke('get_playback_state'),
        invoke('get_current_track'),
        invoke('get_volume'),
      ]);

      playbackState = normalizePlaybackState(rawState);
      currentTrack = track as Track | null;
      volume = typeof currentVolume === 'number' ? currentVolume : volume;

      if (!isSeeking) {
        if (playbackState.state === 'playing' || playbackState.state === 'paused') {
          progress = playbackState.position;
          duration = playbackState.duration;
        } else {
          progress = 0;
          duration = 0;
        }
      }
    } catch (error) {
      console.error('Failed to refresh playback state:', error);
    }
  }

  function normalizePlaybackState(raw: unknown): PlaybackStateInfo {
    if (!raw) {
      return { state: 'stopped' };
    }

    if (typeof raw === 'string') {
      if (raw === 'Stopped') return { state: 'stopped' };
      if (raw.startsWith('Error')) return { state: 'error', message: raw };
      return { state: 'stopped' };
    }

    if (typeof raw === 'object') {
      const data = raw as Record<string, any>;
      if (data['Playing']) {
        const playing = data['Playing'];
        return {
          state: 'playing',
          position: Number(playing?.position ?? 0),
          duration: Number(playing?.duration ?? 0),
        };
      }
      if (data['Paused']) {
        const paused = data['Paused'];
        return {
          state: 'paused',
          position: Number(paused?.position ?? 0),
          duration: Number(paused?.duration ?? 0),
        };
      }
      if (data['Stopped'] !== undefined) {
        return { state: 'stopped' };
      }
      if (data['Error']) {
        const message = typeof data['Error'] === 'string' ? data['Error'] : 'Playback error';
        return { state: 'error', message };
      }
      // Some serializers may lowercase variant names
      if (data['playing']) {
        const playing = data['playing'];
        return {
          state: 'playing',
          position: Number(playing?.position ?? 0),
          duration: Number(playing?.duration ?? 0),
        };
      }
      if (data['paused']) {
        const paused = data['paused'];
        return {
          state: 'paused',
          position: Number(paused?.position ?? 0),
          duration: Number(paused?.duration ?? 0),
        };
      }
    }

    return { state: 'stopped' };
  }

  async function togglePlayPause() {
    if (!isTauri) {
      if (!currentTrack) {
        initializeMockPlayback();
      }
      if (playbackState.state === 'playing') {
        playbackState = { state: 'paused', position: progress, duration: duration || currentTrack?.duration || 0 };
      } else {
        const total = duration || currentTrack?.duration || 0;
        playbackState = { state: 'playing', position: progress, duration: total };
      }
      return;
    }

    try {
      if (isPlaying) {
        // Optimistically update UI
        playbackState = { state: 'paused', position: progress, duration: duration };
        await invoke('pause');
      } else if (playbackState.state === 'paused') {
        // Optimistically update UI
        playbackState = { state: 'playing', position: progress, duration: duration };
        await invoke('resume');
      } else if (!currentTrack) {
        await promptAndPlayFile();
        return;
      } else {
        // Optimistically update UI
        playbackState = { state: 'playing', position: progress, duration: duration };
        await invoke('resume');
      }
      // Refresh state after command completes to ensure sync
      await refreshState();
    } catch (error) {
      console.error('Failed to toggle playback:', error);
      // Revert optimistic update on error
      await refreshState();
    }
  }

  async function promptAndPlayFile() {
    if (!isTauri) {
      initializeMockPlayback();
      playbackState = {
        state: 'playing',
        position: 0,
        duration: duration || currentTrack?.duration || 0,
      };
      progress = 0;
      return;
    }

    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'Audio',
            extensions: ['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a'],
          },
        ],
      });

      if (typeof selected === 'string') {
        // Optimistically set to playing state
        playbackState = { state: 'playing', position: 0, duration: 0 };
        progress = 0;
        await invoke('play_file', { filePath: selected });
        // Refresh to get actual track info and duration
        await refreshState();
      }
    } catch (error) {
      console.error('Failed to choose file:', error);
      await refreshState();
    }
  }

  async function handleSeek(event: Event) {
    const target = event.target as HTMLInputElement;
    const nextPosition = Number(target.value);
    progress = nextPosition;

    if (!isTauri) {
      if (duration === 0 && currentTrack) {
        duration = currentTrack.duration;
      }
      playbackState = {
        state: playbackState.state === 'paused' ? 'paused' : 'playing',
        position: progress,
        duration: duration || currentTrack?.duration || 0,
      };
      isSeeking = false;
      return;
    }

    if (playbackState.state === 'playing' || playbackState.state === 'paused') {
      try {
        await invoke('seek', { position: Math.round(nextPosition) });
      } catch (error) {
        console.error('Failed to seek:', error);
      }
    }

    isSeeking = false;
    await refreshState();
  }

  function handleSeekStart() {
    isSeeking = true;
  }

  function handleSeekMove(event: Event) {
    if (!isSeeking) return;
    const target = event.target as HTMLInputElement;
    progress = Number(target.value);
  }

  async function adjustVolume(event: Event) {
    const target = event.target as HTMLInputElement;
    const value = Number(target.value) / 100;
    volume = value;
    if (!isTauri) {
      return;
    }

    try {
      await invoke('set_volume', { volume: value });
    } catch (error) {
      console.error('Failed to set volume:', error);
    }
  }

  function toggleFavorite() {
    if (!currentTrack) return;
    if (favorites.has(currentTrack.id)) {
      favorites.delete(currentTrack.id);
    } else {
      favorites.add(currentTrack.id);
    }
  }

  function nextRepeatMode() {
    const index = repeatModes.indexOf(repeatMode);
    const nextIndex = index === -1 ? 0 : (index + 1) % repeatModes.length;
    repeatMode = repeatModes[nextIndex]!;
  }

  function formatDuration(totalSeconds: number | undefined): string {
    if (!totalSeconds || Number.isNaN(totalSeconds)) {
      return '0:00';
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60)
      .toString()
      .padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  $: playingClass = isPlaying ? 'playing' : '';

  function initializeMockPlayback() {
    if (currentTrack) {
      if (!duration) {
        duration = currentTrack.duration;
      }
    } else {
      const [firstTrack] = getMockTracks();
      currentTrack = firstTrack ?? null;
      duration = firstTrack?.duration ?? 0;
      progress = Math.min(42, duration || 0);
    }

    if (volume === 1.0) {
      volume = 0.68;
    }

    if (currentTrack) {
      const total = duration || currentTrack.duration;
      playbackState = {
        state: 'playing',
        position: Math.min(progress, total),
        duration: total,
      };
    } else {
      playbackState = { state: 'stopped' };
    }
  }
</script>

<div class="player-bar">
  <div class="now-playing">
    <div class="artwork">
      <span>{currentTrack ? currentTrack.title.charAt(0) : '♪'}</span>
    </div>
    <div class="track-meta">
      <div class="title">{currentTrack ? currentTrack.title : 'Nothing playing'}</div>
      <div class="artist">
        {#if currentTrack}
          {currentTrack.artist_name ?? 'Unknown Artist'} • {currentTrack.album_title ?? 'Single'}
        {:else}
          Choose a track to start listening
        {/if}
      </div>
    </div>
    <button
      class="favorite"
      class:active={currentTrack && favorites.has(currentTrack.id)}
      on:click={toggleFavorite}
      aria-label="Toggle favorite"
    >
      {#if currentTrack && favorites.has(currentTrack.id)}❤{:else}♡{/if}
    </button>
  </div>

  <div class="playback">
    <div class="controls">
      <button
        class:active={shuffleEnabled}
        on:click={() => (shuffleEnabled = !shuffleEnabled)}
        title="Toggle shuffle"
      >
        🔀
      </button>
      <button class="ghost" disabled title="Previous track coming soon">⏮</button>
      <button class={`play ${playingClass}`} on:click={togglePlayPause}>
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button class="ghost" disabled title="Next track coming soon">⏭</button>
      <button
        class:active={repeatMode !== 'off'}
        on:click={nextRepeatMode}
        title={`Repeat: ${repeatMode}`}
      >
        {repeatMode === 'one' ? '🔂' : '🔁'}
      </button>
    </div>

    <div class="progress">
      <span class="time">{formatDuration(progress)}</span>
      <input
        type="range"
        min="0"
        max={duration || 0}
        step="1"
        value={progress}
        on:mousedown={handleSeekStart}
        on:touchstart={handleSeekStart}
        on:input={handleSeekMove}
        on:change={handleSeek}
      />
      <span class="time">{formatDuration(duration)}</span>
    </div>
  </div>

  <div class="extras">
    <div class="queue">
      <button on:click={() => (showQueue = !showQueue)} aria-expanded={showQueue}>
        📃 Queue
      </button>
      {#if showQueue}
        <div class="popover">
          <p class="heading">Up next</p>
          <p class="muted">Queue management is coming soon.</p>
        </div>
      {/if}
    </div>

    <div class="volume">
      <button on:click={() => (showVolumeSlider = !showVolumeSlider)} aria-expanded={showVolumeSlider}>
        {volumePercentage() === 0 ? '🔇' : volumePercentage() < 50 ? '🔈' : '🔊'}
      </button>
      {#if showVolumeSlider}
        <div class="popover">
          <label>
            Volume {Math.round(volume * 100)}%
            <input type="range" min="0" max="100" value={volumePercentage()} on:input={adjustVolume} />
          </label>
        </div>
      {/if}
    </div>

    <button class="ghost" disabled title="Lyrics view coming soon">📝 Lyrics</button>
  </div>
</div>

<style>
  .player-bar {
    height: 96px;
    padding: 12px 24px;
    background: linear-gradient(180deg, #111827, #0f172a);
    border-top: 1px solid rgba(148, 163, 184, 0.12);
    display: grid;
    grid-template-columns: 1fr 2fr 1fr;
    align-items: center;
    gap: 24px;
    color: #e2e8f0;
  }

  .now-playing {
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 0;
  }

  .artwork {
    width: 64px;
    height: 64px;
    border-radius: 8px;
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.4), rgba(14, 116, 144, 0.4));
    display: grid;
    place-items: center;
    font-size: 1.5rem;
    color: rgba(224, 242, 254, 0.95);
    font-weight: 700;
    text-transform: uppercase;
  }

  .track-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .title {
    font-size: 1rem;
    font-weight: 600;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .artist {
    font-size: 0.85rem;
    color: rgba(226, 232, 240, 0.72);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .favorite {
    border: none;
    background: transparent;
    color: rgba(248, 113, 113, 0.6);
    font-size: 1.4rem;
    cursor: pointer;
    transition: transform 0.2s ease, color 0.2s ease;
  }

  .favorite.active {
    color: rgba(248, 113, 113, 0.95);
    transform: scale(1.05);
  }

  .playback {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
    justify-content: center;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .controls button {
    border: none;
    background: transparent;
    color: inherit;
    font-size: 1rem;
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    cursor: pointer;
    transition: background 0.2s ease, transform 0.2s ease;
  }

  .controls button:hover:not(:disabled) {
    background: rgba(59, 130, 246, 0.18);
  }

  .controls button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .controls button.active {
    background: rgba(59, 130, 246, 0.25);
    color: #bfdbfe;
  }

  .controls .play {
    width: 48px;
    height: 48px;
    font-size: 1.3rem;
    background: rgba(59, 130, 246, 0.3);
    color: #e0f2fe;
    box-shadow: 0 10px 25px rgba(59, 130, 246, 0.25);
  }

  .controls .play.playing {
    background: rgba(16, 185, 129, 0.3);
    box-shadow: 0 10px 25px rgba(16, 185, 129, 0.25);
  }

  .progress {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 12px;
    width: 100%;
    align-items: center;
  }

  .progress .time {
    font-size: 0.75rem;
    color: rgba(148, 163, 184, 0.7);
    min-width: 40px;
    text-align: center;
  }

  .progress input[type='range'] {
    width: 100%;
    accent-color: #60a5fa;
  }

  .extras {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 16px;
  }

  .extras button {
    border: none;
    border-radius: 999px;
    padding: 8px 14px;
    background: rgba(30, 58, 138, 0.35);
    color: #bfdbfe;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .extras button:hover {
    background: rgba(59, 130, 246, 0.25);
  }

  .extras .ghost {
    background: transparent;
    color: rgba(148, 163, 184, 0.7);
    border: 1px dashed rgba(148, 163, 184, 0.3);
  }

  .extras .ghost:hover {
    background: rgba(71, 85, 105, 0.25);
  }

  .queue,
  .volume {
    position: relative;
  }

  .popover {
    position: absolute;
    bottom: 120%;
    right: 0;
    background: rgba(15, 23, 42, 0.95);
    border: 1px solid rgba(148, 163, 184, 0.2);
    padding: 12px;
    border-radius: 12px;
    min-width: 180px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
    z-index: 10;
  }

  .popover p {
    margin: 0;
  }

  .popover .heading {
    font-size: 0.85rem;
    font-weight: 600;
    margin-bottom: 6px;
    color: #e2e8f0;
  }

  .popover .muted {
    font-size: 0.75rem;
    color: rgba(148, 163, 184, 0.75);
  }

  .volume label {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 0.8rem;
    color: rgba(226, 232, 240, 0.86);
  }

  .volume input[type='range'] {
    accent-color: #f59e0b;
  }

  @media (max-width: 1100px) {
    .player-bar {
      grid-template-columns: 1.3fr 1.7fr 1fr;
      padding: 12px 16px;
      gap: 16px;
    }

    .artwork {
      width: 56px;
      height: 56px;
    }

    .controls .play {
      width: 44px;
      height: 44px;
    }
  }

  @media (max-width: 900px) {
    .player-bar {
      grid-template-columns: 1fr;
      gap: 12px;
      height: auto;
    }

    .extras {
      justify-content: flex-start;
    }

    .progress {
      width: 90%;
    }
  }
</style>
