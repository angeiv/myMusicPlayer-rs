<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  import { buildLyricsPanelState, type LyricsLine } from './lyrics';
  import { createPlaybackStore } from '../stores/playback';
  import type { OutputDeviceInfo, PlaybackStateInfo, Track } from '../types';

  const playback = createPlaybackStore();

  let currentTrack: Track | null = null;
  let playbackState: PlaybackStateInfo = { state: 'stopped' };
  let volume = 1;
  let volumePercentUi = 100;
  let isVolumeAdjusting = false;
  let volumeAdjustTimer: ReturnType<typeof setTimeout> | null = null;
  let progress = 0;
  let duration = 0;
  let favorites = new Set<string>();
  let shuffleEnabled = false;
  let repeatMode: 'off' | 'all' | 'one' = 'off';
  let uiError = '';
  let showQueue = false;
  let showDevicePicker = false;
  let showLyricsPanel = false;
  let queueTracks: Track[] = [];
  let outputDevices: OutputDeviceInfo[] = [];
  let selectedDeviceId = 'default';
  let isPlaying = false;
  let isMuted = false;
  let lyricsLines: LyricsLine[] = [];
  let activeLyricIndex = -1;
  let hasTimedLyrics = false;
  let remainingTime = 0;
  let progressPercent = 0;
  let playingClass = '';

  $: currentTrack = $playback.currentTrack;
  $: playbackState = $playback.playbackState;
  $: volume = $playback.volume;
  $: progress = $playback.progress;
  $: duration = $playback.duration;
  $: queueTracks = $playback.queueTracks;
  $: outputDevices = $playback.outputDevices;
  $: selectedDeviceId = $playback.selectedDeviceId;
  $: shuffleEnabled = $playback.shuffleEnabled;
  $: repeatMode = $playback.repeatMode;
  $: uiError = $playback.uiError;

  $: if (!isVolumeAdjusting) {
    volumePercentUi = Math.round(volume * 100);
  }

  const volumePercentage = () => Math.round(volume * 100);

  $: isPlaying = playbackState.state === 'playing';
  $: isMuted = volume <= 0;
  $: ({ lines: lyricsLines, activeIndex: activeLyricIndex, hasTimedLyrics } = buildLyricsPanelState(
    currentTrack?.lyrics,
    progress
  ));
  $: remainingTime = duration > 0 ? Math.max(duration - progress, 0) : 0;
  $: progressPercent = duration ? Math.min(Math.max((progress / duration) * 100, 0), 100) : 0;

  onMount(() => {
    void playback.start();

    return () => {
      playback.destroy();
    };
  });

  onDestroy(() => {
    if (volumeAdjustTimer) {
      clearTimeout(volumeAdjustTimer);
      volumeAdjustTimer = null;
    }
  });

  async function togglePlayPause() {
    await playback.togglePlayPause();
  }

  async function promptAndPlayFile() {
    await playback.promptAndPlayFile();
  }

  async function handleSeek(event: Event) {
    const target = event.target as HTMLInputElement;
    await playback.commitSeek(Number(target.value));
  }

  function handleSeekStart() {
    playback.beginSeek();
  }

  function handleSeekMove(event: Event) {
    playback.previewSeek(Number((event.target as HTMLInputElement).value));
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

    volumePercentUi = Number(target.value);
    await playback.setVolume(volumePercentUi / 100);
  }

  async function toggleMute() {
    await playback.toggleMute();
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
    void playback.cycleRepeatMode();
  }

  async function toggleShuffle() {
    await playback.toggleShuffle();
  }

  async function handlePrevious() {
    await playback.playPrevious(showQueue);
  }

  async function handleNext() {
    await playback.playNext(showQueue);
  }

  function handleQueuePlay(track: Track) {
    void playback.playQueueTrack(track);
  }

  async function handleSelectDevice(deviceId: string) {
    await playback.selectOutputDevice(deviceId);
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
      void playback.refreshQueue();
    }
  }

  function asTrack(value: unknown): Track {
    return value as Track;
  }

  function asDevice(value: unknown): OutputDeviceInfo {
    return value as OutputDeviceInfo;
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

</script>

<div class="player-bar">
  {#if uiError}
    <div class="error-banner" role="status">
      <span>{uiError}</span>
      <button type="button" on:click={() => playback.dismissError()} aria-label="Dismiss error">✕</button>
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
      <button class="utility-trigger" on:click={toggleQueuePopover} aria-expanded={showQueue}>
        📃 队列
      </button>
      {#if showQueue}
        <div class="popover queue-popover">
          <p class="heading">接下来播放</p>
          {#if queueTracks.length === 0}
            <p class="muted">队列信息即将推出。</p>
          {:else}
            <ul>
              {#each queueTracks as track, index (asTrack(track).id)}
                <li class:active={currentTrack?.id === asTrack(track).id}>
                  <button type="button" on:click={() => handleQueuePlay(asTrack(track))}>
                    <span class="index">{index + 1}</span>
                    <div>
                      <p class="queue-title">{asTrack(track).title}</p>
                      <p class="queue-artist">{asTrack(track).artist_name ?? 'Unknown Artist'}</p>
                    </div>
                    <span class="queue-time">{formatDuration(asTrack(track).duration)}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
    </div>

  <div class="volume-wrap popover-group">
      <button
        class="utility-trigger volume-trigger"
        class:active={isMuted}
        on:click={() => void toggleMute()}
        aria-label={isMuted ? '取消静音' : '静音'}
        aria-pressed={isMuted}
      >
        <span class="volume-icon">{volumePercentage() === 0 ? '🔇' : volumePercentage() < 50 ? '🔈' : '🔊'}</span>
        <span class="volume-trigger-value">{Math.round(volumePercentUi)}%</span>
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
      <button class="utility-trigger" on:click={toggleDevicePopover} aria-expanded={showDevicePicker}>🎧 设备</button>
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
            {#each outputDevices as device (asDevice(device).id)}
              <li>
                <button
                  type="button"
                  class:selected={selectedDeviceId === asDevice(device).id}
                  on:click={() => handleSelectDevice(asDevice(device).id)}
                >
                  <span class="device-name">{asDevice(device).name}</span>
                  <span class="device-desc">{asDevice(device).is_default ? 'Default device' : 'Output device'}</span>
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>

    <button class="utility-trigger" class:active={showLyricsPanel} on:click={toggleLyrics} aria-pressed={showLyricsPanel}>📝 歌词</button>
  </div>
</div>

{#if showLyricsPanel}
  <section class="lyrics-panel">
    <div class="lyrics-header">
      <div>
        <p class="eyebrow">{hasTimedLyrics ? '实时歌词' : '本地歌词'}</p>
        <p class="lyrics-title">{currentTrack ? currentTrack.title : '歌词'}</p>
      </div>
      <button on:click={toggleLyrics} aria-label="Close lyrics">✕</button>
    </div>
    <div class="lyrics-body">
      {#if lyricsLines.length === 0}
        <div class="lyrics-empty">
          <p class="lyrics-empty-title">{currentTrack ? '未找到本地歌词' : '播放歌曲后可在这里查看本地歌词'}</p>
          <p class="lyrics-empty-hint">
            {#if currentTrack}
              当前歌曲未找到同名 `.lrc` 文件。
            {:else}
              当前面板会显示正在播放歌曲的本地歌词。
            {/if}
          </p>
        </div>
      {:else}
        {#each lyricsLines as line, index (line.id)}
          <p class:active={index === activeLyricIndex}>{line.text}</p>
        {/each}
      {/if}
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

  .utility-trigger {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid rgba(96, 165, 250, 0.16);
    border-radius: 999px;
    padding: 8px 14px;
    background: rgba(30, 58, 138, 0.35);
    color: #bfdbfe;
    cursor: pointer;
    transition:
      background 0.2s ease,
      border-color 0.2s ease,
      transform 0.16s ease;
  }

  .utility-trigger.active,
  .utility-trigger[aria-expanded='true'] {
    background: rgba(59, 130, 246, 0.3);
    border-color: rgba(96, 165, 250, 0.34);
  }

  .utility-trigger:hover,
  .utility-trigger:focus-visible {
    background: rgba(59, 130, 246, 0.25);
    border-color: rgba(96, 165, 250, 0.28);
    transform: translateY(-1px);
    outline: none;
  }

  .volume-trigger {
    min-width: 96px;
    font-variant-numeric: tabular-nums;
  }

  .volume-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.1rem;
  }

  .volume-trigger-value {
    min-width: 3ch;
    text-align: right;
    font-size: 0.85rem;
    letter-spacing: 0.02em;
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
    transition: color 0.2s ease, transform 0.2s ease, opacity 0.2s ease;
    opacity: 0.62;
  }

  .lyrics-body p.active {
    color: #ffffff;
    opacity: 1;
    transform: translateX(4px);
  }

  .lyrics-empty {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 4px;
  }

  .lyrics-empty-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: rgba(248, 250, 252, 0.96);
  }

  .lyrics-empty-hint {
    margin: 0;
    font-size: 0.85rem;
    line-height: 1.5;
    color: rgba(148, 163, 184, 0.92);
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
