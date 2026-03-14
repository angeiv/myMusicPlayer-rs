<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import type { AppConfig, OutputDeviceInfo, PlaybackStateInfo, Track } from '../types';
  import { isTauri } from '../utils/env';
  import { getMockTracks } from '../mocks/library';

  const REFRESH_INTERVAL = 1000;

  const mockDevices: OutputDeviceInfo[] = [
    { id: 'default', name: 'System default', is_default: true },
    { id: 'scarlett-2i2', name: 'Scarlett 2i2', is_default: false },
    { id: 'airpods-pro', name: 'AirPods Pro', is_default: false },
  ];

  const fallbackLyrics = `Float softly through the midnight air
Windows glow with silver light
Every heartbeat keeps the rhythm
We are satellites tonight.`;

  let currentTrack: Track | null = null;
  let playbackState: PlaybackStateInfo = { state: 'stopped' };
  let volume = 1.0;
  let lastAudibleVolume = 0.68;
  let volumePercentUi = 100;
  let isVolumeAdjusting = false;
  let volumeAdjustTimer: ReturnType<typeof setTimeout> | null = null;
  let configCache: AppConfig | null = null;
  let lastPersistedSession: { trackId: string; positionSeconds: number } | null = null;
  let persistSessionTimer: ReturnType<typeof setTimeout> | null = null;
  let progress = 0;
  let duration = 0;
  let isSeeking = false;
  let seekCooldownTimer: ReturnType<typeof setTimeout> | null = null;
  let favorites = new Set<string>();
  let shuffleEnabled = false;
  let repeatMode: 'off' | 'all' | 'one' = 'off';
  let uiError = '';
  let showQueue = false;
  let showDevicePicker = false;
  let showLyricsPanel = false;
  let queueTracks: Track[] = isTauri ? [] : getMockTracks();
  let outputDevices: OutputDeviceInfo[] = isTauri ? [] : mockDevices;
  let selectedDeviceId = 'default';
  let lastUpdateTimer: ReturnType<typeof setInterval> | null = null;

  const repeatModes: Array<'off' | 'all' | 'one'> = ['off', 'all', 'one'];

  $: if (!isVolumeAdjusting) {
    volumePercentUi = Math.round(volume * 100);
  }

  const volumePercentage = () => Math.round(volume * 100);

  $: isPlaying = playbackState.state === 'playing';
  $: isMuted = volume <= 0;
  $: activeLyrics = (currentTrack?.lyrics?.trim() ?? fallbackLyrics).split('\n');
  $: remainingTime = duration > 0 ? Math.max(duration - progress, 0) : 0;
  $: progressPercent = duration ? Math.min(Math.max((progress / duration) * 100, 0), 100) : 0;

  onMount(async () => {
    if (isTauri) {
      await Promise.all([
        refreshState(),
        loadPlayMode(),
        loadOutputDevices(),
      ]);
      lastUpdateTimer = setInterval(refreshState, REFRESH_INTERVAL);
    } else {
      initializeMockPlayback();
      outputDevices = mockDevices;
      selectedDeviceId = outputDevices[0]?.id ?? 'default';
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

  async function loadOutputDevices() {
    if (!isTauri) {
      outputDevices = mockDevices;
      return;
    }

    try {
      const [devices, current] = await Promise.all([
        invoke<OutputDeviceInfo[]>('get_output_devices'),
        invoke<string | null>('get_output_device'),
      ]);
      outputDevices = (devices ?? []).filter((device: OutputDeviceInfo) => !device.is_default);
      selectedDeviceId = current ?? 'default';
    } catch (error) {
      console.error('Failed to load output devices:', error);
      outputDevices = [];
      selectedDeviceId = 'default';
    }
  }

  function applyBackendPlayMode(mode: unknown) {
    if (mode === 'random') {
      shuffleEnabled = true;
      repeatMode = 'off';
      return;
    }
    shuffleEnabled = false;
    if (mode === 'single_repeat') {
      repeatMode = 'one';
      return;
    }
    if (mode === 'list_repeat') {
      repeatMode = 'all';
      return;
    }
    repeatMode = 'off';
  }

  async function loadPlayMode() {
    if (!isTauri) {
      return;
    }

    try {
      const mode = await invoke<string>('get_play_mode');
      applyBackendPlayMode(mode);
    } catch (error) {
      console.error('Failed to load play mode:', error);
    }
  }

  function resolvePlayMode() {
    if (shuffleEnabled) {
      return 'random';
    }

    if (repeatMode === 'one') {
      return 'single_repeat';
    }

    if (repeatMode === 'all') {
      return 'list_repeat';
    }

    return 'sequential';
  }

  async function syncPlayMode() {
    if (!isTauri) {
      return;
    }

    try {
      await invoke('set_play_mode', { mode: resolvePlayMode() });
    } catch (error) {
      console.error('Failed to set play mode:', error);
    }
  }

  async function refreshQueue() {
    if (!isTauri) {
      return;
    }

    try {
      queueTracks = (await invoke<Track[]>('get_queue')) ?? [];
    } catch (error) {
      console.error('Failed to load queue:', error);
      queueTracks = [];
    }
  }

  onDestroy(() => {
    if (
      isTauri &&
      currentTrack &&
      (playbackState.state === 'playing' || playbackState.state === 'paused')
    ) {
      void persistLastSession(currentTrack.id, Math.max(0, Math.floor(progress)));
    }

    if (lastUpdateTimer) {
      clearInterval(lastUpdateTimer);
    }

    if (volumeAdjustTimer) {
      clearTimeout(volumeAdjustTimer);
      volumeAdjustTimer = null;
    }

    if (seekCooldownTimer) {
      clearTimeout(seekCooldownTimer);
      seekCooldownTimer = null;
    }

    if (persistSessionTimer) {
      clearTimeout(persistSessionTimer);
      persistSessionTimer = null;
    }
  });

  async function loadConfigFresh() {
    if (!isTauri) {
      return null;
    }
    try {
      configCache = await invoke<AppConfig>('get_config');
      return configCache;
    } catch (error) {
      console.warn('Failed to load config:', error);
      configCache = null;
      return null;
    }
  }

  function schedulePersistLastSession(trackId: string, positionSeconds: number) {
    if (!isTauri) {
      return;
    }
    if (!trackId) {
      return;
    }

    const pos = Math.max(0, Math.floor(positionSeconds));
    const prev = lastPersistedSession;
    if (prev && prev.trackId === trackId && Math.abs(prev.positionSeconds - pos) < 2) {
      return;
    }

    if (persistSessionTimer) {
      clearTimeout(persistSessionTimer);
    }
    persistSessionTimer = setTimeout(() => {
      persistSessionTimer = null;
      void persistLastSession(trackId, pos);
    }, 1200);
  }

  async function persistLastSession(trackId: string, positionSeconds: number) {
    try {
      await invoke('set_last_session', {
        lastTrackId: trackId,
        lastPositionSeconds: Math.max(0, Math.floor(positionSeconds)),
      });
      if (configCache) {
        configCache = {
          ...configCache,
          last_track_id: trackId,
          last_position_seconds: Math.max(0, Math.floor(positionSeconds)),
        };
      }
      lastPersistedSession = { trackId, positionSeconds };
    } catch (error) {
      console.warn('Failed to persist last session:', error);
    }
  }

  async function tryResumeLastSession(): Promise<boolean> {
    const config = await loadConfigFresh();
    const lastTrackId = config?.last_track_id ?? null;
    const lastPos = config?.last_position_seconds ?? 0;

    if (!lastTrackId) {
      return false;
    }
    try {
      const track = await invoke<Track | null>('get_track', { id: lastTrackId });
      if (!track) {
        return false;
      }

      await invoke('set_queue', { tracks: [track] });
      await invoke('play', { track });
      const posSeconds = Math.max(0, Math.floor(Number(lastPos) || 0));
      if (posSeconds > 0) {
        await invoke('seek', { position: posSeconds });
      }
      return true;
    } catch (error) {
      console.warn('Failed to resume last session:', error);
      return false;
    }
  }

  async function refreshState() {
    if (!isTauri) {
      return;
    }

    try {
      const [rawState, track, currentVolume] = await Promise.all([
        invoke<unknown>('get_playback_state'),
        invoke<Track | null>('get_current_track'),
        invoke<number>('get_volume'),
      ]);

      playbackState = normalizePlaybackState(rawState);
      currentTrack = track;
      if (!isVolumeAdjusting) {
        volume = typeof currentVolume === 'number' ? currentVolume : volume;
        if (volume > 0) {
          lastAudibleVolume = volume;
        }
      }

      if (playbackState.state === 'error') {
        uiError = playbackState.message;
      }

      if (!isSeeking) {
        if (playbackState.state === 'playing' || playbackState.state === 'paused') {
          progress = playbackState.position;
          duration = playbackState.duration;
        } else {
          progress = 0;
          duration = 0;
        }
      }

      if (currentTrack && (playbackState.state === 'playing' || playbackState.state === 'paused')) {
        schedulePersistLastSession(currentTrack.id, progress);
      }
    } catch (error) {
      console.error('Failed to refresh playback state:', error);
      uiError = 'Failed to refresh playback state.';
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
      uiError = '';
      if (isPlaying) {
        playbackState = { state: 'paused', position: progress, duration: duration };
        await invoke('pause');
      } else if (playbackState.state === 'paused') {
        playbackState = { state: 'playing', position: progress, duration: duration };
        await invoke('resume');
      } else if (!currentTrack) {
        if (await tryResumeLastSession()) {
          await refreshState();
          return;
        }
        await promptAndPlayFile();
        return;
      } else {
        playbackState = { state: 'playing', position: progress, duration: duration };
        await invoke('resume');
      }
      await refreshState();
    } catch (error) {
      console.error('Failed to toggle playback:', error);
      uiError = 'Playback operation failed.';
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

    uiError = '';

    try {
      playbackState = { state: 'playing', position: 0, duration: 0 };
      progress = 0;
      await invoke('pick_and_play_file');
      await refreshState();
    } catch (error) {
      console.error('Failed to play selected file:', error);
      uiError = error instanceof Error ? error.message : String(error);
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

    if (seekCooldownTimer) {
      clearTimeout(seekCooldownTimer);
    }
    seekCooldownTimer = setTimeout(() => {
      isSeeking = false;
      seekCooldownTimer = null;
      void refreshState();
    }, 450);
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
    isVolumeAdjusting = true;
    if (volumeAdjustTimer) {
      clearTimeout(volumeAdjustTimer);
    }
    volumeAdjustTimer = setTimeout(() => {
      isVolumeAdjusting = false;
      volumeAdjustTimer = null;
    }, 350);

    const value = Number(target.value) / 100;
    volume = value;
    if (value > 0) {
      lastAudibleVolume = value;
    }
    if (!isTauri) {
      return;
    }

    try {
      await invoke('set_volume', { volume: value });
    } catch (error) {
      console.error('Failed to set volume:', error);
    }
  }

  async function toggleMute() {
    if (volume > 0) {
      lastAudibleVolume = volume;
      volume = 0;
    } else {
      volume = lastAudibleVolume > 0 ? lastAudibleVolume : 0.68;
    }

    if (!isTauri) {
      return;
    }

    try {
      await invoke('set_volume', { volume });
    } catch (error) {
      console.error('Failed to toggle mute:', error);
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
    if (repeatMode !== 'off') {
      shuffleEnabled = false;
    }
    void syncPlayMode();
  }

  async function toggleShuffle() {
    shuffleEnabled = !shuffleEnabled;
    if (shuffleEnabled) {
      repeatMode = 'off';
    }
    await syncPlayMode();
  }

  async function handlePrevious() {
    if (!isTauri) {
      if (queueTracks.length === 0 || !currentTrack) {
        return;
      }
      const index = queueTracks.findIndex((t) => t.id === currentTrack?.id);
      const prev = index > 0 ? queueTracks[index - 1] : queueTracks[0];
      if (prev) {
        handleQueuePlay(prev);
      }
      return;
    }

    try {
      await invoke('previous_track');
      await refreshState();
      if (showQueue) {
        await refreshQueue();
      }
    } catch (error) {
      console.error('Failed to play previous track:', error);
    }
  }

  async function handleNext() {
    if (!isTauri) {
      if (queueTracks.length === 0 || !currentTrack) {
        return;
      }
      const index = queueTracks.findIndex((t) => t.id === currentTrack?.id);
      const next = index >= 0 && index + 1 < queueTracks.length ? queueTracks[index + 1] : queueTracks[0];
      if (next) {
        handleQueuePlay(next);
      }
      return;
    }

    try {
      await invoke('next_track');
      await refreshState();
      if (showQueue) {
        await refreshQueue();
      }
    } catch (error) {
      console.error('Failed to play next track:', error);
    }
  }

  function handleQueuePlay(track: Track) {
    if (!track) return;
    if (isTauri) {
      void (async () => {
        try {
          await invoke('play', { track });
          await refreshState();
        } catch (error) {
          console.error('Failed to play queue track:', error);
        }
      })();
      return;
    }
    currentTrack = track;
    duration = track.duration;
    progress = 0;
    playbackState = {
      state: 'playing',
      position: 0,
      duration: track.duration,
    };
  }

  async function handleSelectDevice(deviceId: string) {
    selectedDeviceId = deviceId;
    if (isTauri) {
      try {
        await invoke('set_output_device', {
          deviceId: deviceId === 'default' ? null : deviceId,
        });
        await refreshState();
      } catch (error) {
        console.error('Failed to switch output device:', error);
      }
      return;
    }
  }

  function toggleLyrics() {
    showLyricsPanel = !showLyricsPanel;
  }

  function closeTransientPopovers(except?: 'queue' | 'device') {
    if (except !== 'queue') showQueue = false;
    if (except !== 'device') showDevicePicker = false;
  }

  function toggleQueuePopover() {
    const next = !showQueue;
    closeTransientPopovers(next ? 'queue' : undefined);
    showQueue = next;
    if (showQueue) {
      void refreshQueue();
    }
  }

  function toggleDevicePopover() {
    const next = !showDevicePicker;
    closeTransientPopovers(next ? 'device' : undefined);
    showDevicePicker = next;
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
    queueTracks = getMockTracks();

    if (currentTrack) {
      if (!duration) {
        duration = currentTrack.duration;
      }
    } else {
      const [firstTrack] = queueTracks;
      currentTrack = firstTrack ?? null;
      duration = firstTrack?.duration ?? 0;
      progress = Math.min(42, duration || 0);
    }

    if (volume === 1.0) {
      volume = 0.68;
    }

    if (volume > 0) {
      lastAudibleVolume = volume;
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
  {#if uiError}
    <div class="error-banner" role="status">
      <span>{uiError}</span>
      <button type="button" on:click={() => (uiError = '')} aria-label="Dismiss error">✕</button>
    </div>
  {/if}
  <div class="now-playing">
    <div class="artwork" aria-hidden="true">
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
      <div class="badges">
        <span class="badge">{currentTrack?.genre ?? 'Uncategorized'}</span>
        {#if currentTrack?.year}
          <span class="badge subtle">{currentTrack.year}</span>
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
    <div class="progress-stack">
      <span class="time">{formatDuration(progress)}</span>
      <div class="progress-rail">
        <div class="progress-fill" style={`width: ${progressPercent}%`}></div>
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
          aria-label="Seek"
        />
      </div>
      <span class="time">-{formatDuration(remainingTime)}</span>
    </div>

    <div class="controls">
      <button
        class:active={shuffleEnabled}
        on:click={toggleShuffle}
        title="Toggle shuffle"
      >
        🔀
      </button>
      <button class="ghost" on:click={handlePrevious} title="Previous track">⏮</button>
      <button class={`play ${playingClass}`} on:click={togglePlayPause} aria-label="Play or pause">
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button class="ghost" on:click={handleNext} title="Next track">⏭</button>
      <button
        class:active={repeatMode !== 'off'}
        on:click={nextRepeatMode}
        title={`Repeat: ${repeatMode}`}
      >
        {repeatMode === 'one' ? '🔂' : '🔁'}
      </button>
      <button class="pill" on:click={promptAndPlayFile}>打开文件</button>
    </div>
  </div>

  <div class="extras">
    <div class="popover-group">
      <button on:click={toggleQueuePopover} aria-expanded={showQueue}>
        📃 队列
      </button>
      {#if showQueue}
        <div class="popover queue-popover">
          <p class="heading">接下来播放</p>
          {#if queueTracks.length === 0}
            <p class="muted">队列信息即将推出。</p>
          {:else}
            <ul>
              {#each queueTracks as track, index}
                <li class:active={currentTrack?.id === track.id}>
                  <button type="button" on:click={() => handleQueuePlay(track)}>
                    <span class="index">{index + 1}</span>
                    <div>
                      <p class="queue-title">{track.title}</p>
                      <p class="queue-artist">{track.artist_name ?? 'Unknown Artist'}</p>
                    </div>
                    <span class="queue-time">{formatDuration(track.duration)}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
    </div>

  <div class="volume-wrap">
      <button
        class:active={isMuted}
        on:click={() => void toggleMute()}
        aria-pressed={isMuted}
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        {volumePercentage() === 0 ? '🔇' : volumePercentage() < 50 ? '🔈' : '🔊'}
      </button>
      <div class="popover volume-popover" role="group" aria-label="Volume">
        <div class="volume-header">
          <span class="volume-title">音量</span>
          <span class="volume-value">{Math.round(volumePercentUi)}%</span>
        </div>
        <input type="range" min="0" max="100" bind:value={volumePercentUi} on:input={adjustVolume} />
      </div>
    </div>

    <div class="popover-group">
      <button on:click={toggleDevicePopover} aria-expanded={showDevicePicker}>🎧 设备</button>
      {#if showDevicePicker}
        <div class="popover device-popover">
          <p class="heading">输出设备</p>
          <ul>
            <li>
              <button
                type="button"
                class:selected={selectedDeviceId === 'default'}
                on:click={() => handleSelectDevice('default')}
              >
                <span class="device-name">System default</span>
                <span class="device-desc">Use the OS default output</span>
              </button>
            </li>
            {#each outputDevices as device}
              <li>
                <button
                  type="button"
                  class:selected={selectedDeviceId === device.id}
                  on:click={() => handleSelectDevice(device.id)}
                >
                  <span class="device-name">{device.name}</span>
                  <span class="device-desc">{device.is_default ? 'Default device' : 'Output device'}</span>
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>

    <button class:active={showLyricsPanel} on:click={toggleLyrics} aria-pressed={showLyricsPanel}>📝 歌词</button>
  </div>
</div>

{#if showLyricsPanel}
  <section class="lyrics-panel">
    <div class="lyrics-header">
      <div>
        <p class="eyebrow">实时歌词</p>
        <p class="lyrics-title">{currentTrack ? currentTrack.title : 'Lyrics'}</p>
      </div>
      <button on:click={toggleLyrics} aria-label="Close lyrics">✕</button>
    </div>
    <div class="lyrics-body">
      {#each activeLyrics as line}
        <p>{line}</p>
      {/each}
    </div>
  </section>
{/if}

<style>
  .player-bar {
    position: relative;
    display: grid;
    grid-template-columns: 1.2fr 1.6fr 0.9fr;
    align-items: center;
    gap: 24px;
    padding: 16px 28px;
    background: var(--player-bg);
    border-top: 1px solid var(--player-border);
    color: var(--player-fg);
    min-height: 110px;
  }

  .error-banner {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-radius: 999px;
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.35);
    color: rgba(254, 226, 226, 0.95);
    font-size: 0.85rem;
    max-width: min(900px, calc(100% - 32px));
    z-index: 10;
  }

  .error-banner span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .error-banner button {
    border: none;
    background: transparent;
    color: inherit;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    cursor: pointer;
  }

  .error-banner button:hover {
    background: rgba(239, 68, 68, 0.22);
  }

  .now-playing {
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 0;
  }

  .artwork {
    width: 68px;
    height: 68px;
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(79, 70, 229, 0.4), rgba(14, 165, 233, 0.35));
    display: grid;
    place-items: center;
    font-size: 1.6rem;
    font-weight: 700;
    text-transform: uppercase;
    color: rgba(241, 245, 249, 0.95);
  }

  .track-meta {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .track-meta .title {
    font-size: 1.05rem;
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .track-meta .artist {
    font-size: 0.85rem;
    color: rgba(226, 232, 240, 0.72);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .badges {
    display: flex;
    gap: 8px;
    font-size: 0.75rem;
    color: var(--player-muted);
  }

  .badge {
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--player-border));
  }

  .badge.subtle {
    background: color-mix(in srgb, var(--player-border) 60%, transparent);
    border-color: color-mix(in srgb, var(--player-border) 85%, transparent);
  }

  .favorite {
    border: none;
    background: transparent;
    color: rgba(248, 113, 113, 0.65);
    font-size: 1.5rem;
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
    gap: 16px;
  }

  .progress-stack {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 12px;
  }

  .time {
    font-size: 0.8rem;
    color: var(--player-muted);
    min-width: 40px;
    text-align: center;
  }

  .progress-rail {
    position: relative;
    height: 6px;
    background: color-mix(in srgb, var(--player-border) 55%, transparent);
    border-radius: 999px;
    overflow: hidden;
  }

  .progress-fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: linear-gradient(90deg, var(--player-progress-from), var(--player-progress-to));
    border-radius: inherit;
    pointer-events: none;
  }

  .progress-rail input[type='range'] {
    position: absolute;
    top: -6px;
    left: 0;
    width: 100%;
    height: 18px;
    background: transparent;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
  }

  .progress-rail input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--player-progress-from) 75%, #ffffff);
    border: 2px solid color-mix(in srgb, var(--player-progress-from) 70%, #000000);
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
    background: color-mix(in srgb, var(--accent) 14%, transparent);
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
    width: 52px;
    height: 52px;
    font-size: 1.35rem;
    background: rgba(59, 130, 246, 0.3);
    color: #e0f2fe;
    box-shadow: 0 10px 25px rgba(59, 130, 246, 0.25);
  }

  .controls .play.playing {
    background: rgba(16, 185, 129, 0.3);
    box-shadow: 0 10px 25px rgba(16, 185, 129, 0.25);
  }

  .controls .pill {
    width: auto;
    padding: 0 18px;
    font-size: 0.9rem;
    background: rgba(16, 185, 129, 0.25);
    border: 1px solid rgba(16, 185, 129, 0.45);
  }

  .extras {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
  }

  .extras > button,
  .popover-group > button {
    border: none;
    border-radius: 999px;
    padding: 8px 14px;
    background: rgba(30, 58, 138, 0.35);
    color: #bfdbfe;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .extras > button.active,
  .popover-group > button[aria-expanded='true'] {
    background: rgba(59, 130, 246, 0.3);
  }

  .extras > button:hover,
  .popover-group > button:hover {
    background: rgba(59, 130, 246, 0.25);
  }

  .popover-group {
    position: relative;
  }

  .popover {
    position: absolute;
    bottom: 120%;
    right: 0;
    background: rgba(15, 23, 42, 0.95);
    border: 1px solid rgba(148, 163, 184, 0.25);
    padding: 14px;
    border-radius: 14px;
    min-width: 220px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
    z-index: 20;
  }

  .popover p {
    margin: 0;
  }

  .heading {
    font-size: 0.85rem;
    font-weight: 600;
    margin-bottom: 8px;
    color: #e2e8f0;
  }

  .muted {
    font-size: 0.8rem;
    color: rgba(148, 163, 184, 0.8);
  }

  .queue-popover ul,
  .device-popover ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 240px;
    overflow-y: auto;
  }

  .queue-popover li button {
    width: 100%;
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 10px;
    align-items: center;
    border: none;
    background: color-mix(in srgb, var(--player-border) 55%, transparent);
    border-radius: 10px;
    padding: 8px 10px;
    color: inherit;
    cursor: pointer;
  }

  .queue-popover li button:hover {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }

  .queue-popover li.active button {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }

  .queue-title {
    font-size: 0.85rem;
    font-weight: 600;
  }

  .queue-artist {
    font-size: 0.75rem;
    color: var(--player-muted);
  }

  .queue-time {
    font-size: 0.75rem;
    color: var(--player-muted);
  }

  .index {
    font-variant-numeric: tabular-nums;
    font-size: 0.8rem;
    width: 1.5rem;
  }

  .volume-header {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .volume-title {
    font-size: 0.85rem;
    color: var(--player-muted);
  }

  .volume-value {
    font-variant-numeric: tabular-nums;
    font-size: 0.85rem;
    color: var(--player-muted);
  }

  .volume-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .volume-popover {
    bottom: calc(100% + 10px);
    right: auto;
    left: 50%;
    transform: translateX(-50%);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity 120ms ease,
      transform 120ms ease,
      visibility 120ms ease;
  }

  .volume-popover::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 12px;
    bottom: -12px;
  }

  .volume-wrap:hover .volume-popover,
  .volume-wrap:focus-within .volume-popover {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transform: translateX(-50%);
  }

  .device-popover button {
    width: 100%;
    text-align: left;
    border: none;
    background: rgba(30, 41, 59, 0.55);
    border-radius: 10px;
    padding: 8px 10px;
    color: inherit;
    cursor: pointer;
  }

  .device-popover button:hover {
    background: rgba(59, 130, 246, 0.2);
  }

  .device-popover button.selected {
    border: 1px solid rgba(96, 165, 250, 0.7);
  }

  .device-name {
    font-size: 0.85rem;
    font-weight: 600;
  }

  .device-desc {
    font-size: 0.75rem;
    color: rgba(148, 163, 184, 0.85);
  }

  .lyrics-panel {
    position: fixed;
    right: 32px;
    bottom: 132px;
    width: min(420px, 32vw);
    background: rgba(15, 23, 42, 0.98);
    border: 1px solid rgba(96, 165, 250, 0.35);
    border-radius: 20px;
    padding: 20px;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.45);
    z-index: 40;
    backdrop-filter: blur(14px);
  }

  .lyrics-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .lyrics-header .eyebrow {
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(148, 163, 184, 0.9);
  }

  .lyrics-title {
    font-size: 1.1rem;
    font-weight: 600;
    margin-top: 4px;
  }

  .lyrics-header button {
    border: none;
    border-radius: 999px;
    width: 32px;
    height: 32px;
    background: rgba(30, 64, 175, 0.4);
    color: #fff;
    cursor: pointer;
  }

  .lyrics-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 320px;
    overflow-y: auto;
  }

  .lyrics-body p {
    margin: 0;
    font-size: 0.95rem;
    color: rgba(241, 245, 249, 0.9);
  }

  @media (max-width: 1100px) {
    .player-bar {
      grid-template-columns: 1fr;
      gap: 16px;
      padding: 16px;
    }

    .extras {
      justify-content: flex-start;
    }

    .lyrics-panel {
      width: calc(100% - 48px);
      right: 24px;
    }
  }
</style>
