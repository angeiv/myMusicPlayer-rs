<script lang="ts">
  import { onDestroy } from 'svelte';

  import CoverArt from '../components/CoverArt.svelte';
  import type { OutputDeviceInfo, PlaybackStateInfo, Track } from '../types';
  import { getPlaybackSurfaceAvailability } from '../utils/track-availability';
  import QueueList from './QueueList.svelte';
  import { nowPlayingUi } from './now-playing';
  import { sharedPlayback } from './sharedPlayback';

  const playback = sharedPlayback;
  const nowPlayingState = nowPlayingUi.state;

  let currentTrack: Track | null = null;
  let currentTrackAvailability: ReturnType<typeof getPlaybackSurfaceAvailability> | null = null;
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
  let queueTracks: Track[] = [];
  let outputDevices: OutputDeviceInfo[] = [];
  let selectedDeviceId = 'default';
  let isPlaying = false;
  let isMuted = false;
  let isNowPlayingOpen = false;
  let wasNowPlayingOpen = false;
  let remainingTime = 0;
  let progressPercent = 0;
  let playingClass = '';
  let nowPlayingTrigger: HTMLButtonElement | null = null;

  $: currentTrack = $playback.currentTrack;
  $: playbackState = $playback.playbackState;
  $: currentTrackAvailability = currentTrack
    ? getPlaybackSurfaceAvailability(currentTrack, { isCurrent: true, playbackState })
    : null;
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
  $: remainingTime = duration > 0 ? Math.max(duration - progress, 0) : 0;
  $: progressPercent = duration ? Math.min(Math.max((progress / duration) * 100, 0), 100) : 0;

  const unsubscribeNowPlaying = nowPlayingState.subscribe(({ isOpen }) => {
    if (isOpen) {
      closeTransientPopovers();
    } else if (wasNowPlayingOpen) {
      nowPlayingTrigger?.focus();
    }

    isNowPlayingOpen = isOpen;
    wasNowPlayingOpen = isOpen;
  });

  onDestroy(() => {
    unsubscribeNowPlaying();
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

  function toggleNowPlaying() {
    if (!currentTrack) {
      return;
    }

    closeTransientPopovers();
    nowPlayingUi.toggle();
  }

  function closeTransientPopovers(except?: 'queue' | 'device') {
    if (except !== 'queue') showQueue = false;
    if (except !== 'device') showDevicePicker = false;
  }

  function toggleQueuePopover() {
    if (isNowPlayingOpen) {
      showQueue = false;
      return;
    }

    const next = !showQueue;
    closeTransientPopovers(next ? 'queue' : undefined);
    showQueue = next;
    if (showQueue) {
      void playback.refreshQueue();
    }
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

<div class="player-bar" data-surface="player-chrome">
  {#if uiError}
    <div class="error-banner" data-surface="feedback" data-tone="danger" role="status">
      <span>{uiError}</span>
      <button type="button" on:click={() => playback.dismissError()} aria-label="关闭错误提示">✕</button>
    </div>
  {/if}

  <div class="now-playing">
    <button
      bind:this={nowPlayingTrigger}
      type="button"
      class="now-playing-trigger"
      class:active={isNowPlayingOpen}
      data-variant="current-track"
      on:click={toggleNowPlaying}
      disabled={!currentTrack}
      aria-label={currentTrack ? `打开正在播放：${currentTrack.title}` : '当前没有正在播放内容'}
      aria-pressed={currentTrack ? isNowPlayingOpen : undefined}
    >
      <div class="current-track-cluster">
        <div class="current-track-cluster__artwork-slot" data-testid="bottom-player-artwork-slot">
          <CoverArt
            variant="bottom-bar"
            artworkPath={currentTrack?.artwork_path}
            title={currentTrack?.title ?? '暂无播放'}
            alt=""
          />
        </div>
        <div class="track-meta" data-availability={currentTrackAvailability?.availability ?? 'available'}>
          <div class="title">{currentTrack ? currentTrack.title : '暂无播放'}</div>
          <div class="artist">
            {#if currentTrack}
              {currentTrack.artist_name ?? '未知艺术家'} • {currentTrack.album_title ?? '单曲'}
            {:else}
              选择歌曲后即可在这里查看播放详情
            {/if}
          </div>
          <div class="badges">
            <span class="badge">{currentTrack?.genre ?? '未分类'}</span>
            {#if currentTrack?.year}
              <span class="badge subtle">{currentTrack.year}</span>
            {/if}
            {#if currentTrackAvailability?.badge}
              <span class="badge availability">{currentTrackAvailability.badge}</span>
            {/if}
          </div>
          {#if currentTrackAvailability?.description}
            <p class="availability-copy">{currentTrackAvailability.description}</p>
          {/if}
        </div>
      </div>
    </button>
    <button
      type="button"
      class="favorite"
      class:active={currentTrack && favorites.has(currentTrack.id)}
      on:click={toggleFavorite}
      aria-label={currentTrack && favorites.has(currentTrack.id) ? '取消收藏' : '收藏'}
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
          aria-label="拖动进度"
        />
      </div>
      <span class="time">-{formatDuration(remainingTime)}</span>
    </div>

    <div class="controls">
      <button
        type="button"
        class:active={shuffleEnabled}
        on:click={toggleShuffle}
        aria-label="切换随机播放"
        aria-pressed={shuffleEnabled}
      >
        <span class="transport-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M4 7h3l4.25 5 4.25 5H20" />
            <path d="M17 5.5 20 7l-3 1.5" />
            <path d="M4 17h3l2.5-3" />
            <path d="M15.5 12 20 17" />
            <path d="M17 15.5 20 17l-3 1.5" />
          </svg>
        </span>
      </button>
      <button type="button" class="ghost" on:click={handlePrevious} aria-label="上一首">
        <span class="transport-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M6.5 6.5v11" />
            <path d="M17.5 7 10 12l7.5 5V7Z" />
          </svg>
        </span>
      </button>
      <button class={`play ${playingClass}`} type="button" on:click={togglePlayPause} aria-label="播放或暂停">
        <span
          class={`transport-icon transport-play-icon ${isPlaying ? 'pause-glyph' : 'play-glyph'}`}
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" fill="none">
            {#if isPlaying}
              <path d="M9.25 7.5v9" />
              <path d="M14.75 7.5v9" />
            {:else}
              <path d="M9 7.25 16.5 12 9 16.75V7.25Z" fill="currentColor" stroke="none" />
            {/if}
          </svg>
        </span>
      </button>
      <button type="button" class="ghost" on:click={handleNext} aria-label="下一首">
        <span class="transport-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M17.5 6.5v11" />
            <path d="M6.5 7 14 12l-7.5 5V7Z" />
          </svg>
        </span>
      </button>
      <button
        type="button"
        class:active={repeatMode !== 'off'}
        on:click={nextRepeatMode}
        aria-label="切换重复模式"
        aria-pressed={repeatMode !== 'off'}
      >
        <span class="transport-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M7.5 7.5h9.5l2.5 2.5" />
            <path d="M7.5 16.5H17l2.5-2.5" />
            <path d="M17 5.5 19.5 10 15 10" />
            <path d="M7 18.5 4.5 14H9" />
          </svg>
        </span>
        {#if repeatMode === 'one'}
          <span class="transport-badge" aria-hidden="true">1</span>
        {/if}
      </button>
      <button class="pill" type="button" on:click={promptAndPlayFile}>打开文件</button>
    </div>
  </div>

  <div class="extras">
    <div class="popover-group">
      <button
        type="button"
        class="utility-trigger utility-icon-button"
        data-variant="utility"
        on:click={toggleQueuePopover}
        disabled={isNowPlayingOpen}
        aria-expanded={showQueue}
        aria-label="队列"
      >
        <span class="utility-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M7 6.75h11.25M7 12h11.25M7 17.25h8.25" />
            <circle cx="4.25" cy="6.75" r="1" fill="currentColor" stroke="none" />
            <circle cx="4.25" cy="12" r="1" fill="currentColor" stroke="none" />
            <circle cx="4.25" cy="17.25" r="1" fill="currentColor" stroke="none" />
          </svg>
        </span>
      </button>
      {#if showQueue}
        <div class="popover queue-popover" data-surface="popover">
          <p class="heading">接下来播放</p>
          <QueueList
            tracks={queueTracks}
            currentTrackId={currentTrack?.id ?? null}
            playbackState={playbackState}
            onSelect={handleQueuePlay}
            onRemove={(track) => void playback.removeQueueTrack(track.id)}
            onClear={() => void playback.clearQueue()}
          />
        </div>
      {/if}
    </div>

    <div class="volume-wrap popover-group">
      <button
        type="button"
        class="utility-trigger utility-icon-button volume-trigger"
        class:active={isMuted}
        data-variant="utility"
        on:click={() => void toggleMute()}
        aria-label={isMuted ? '取消静音' : '静音'}
        aria-pressed={isMuted}
      >
        <span class="utility-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M5.5 9.5v5h3.25l4 3V6.5l-4 3H5.5Z" />
            {#if isMuted}
              <path d="M16 9.5 19.5 14.5" />
              <path d="M19.5 9.5 16 14.5" />
            {:else if volumePercentage() < 50}
              <path d="M16 10.25c.9.55 1.35 1.14 1.35 1.75s-.45 1.2-1.35 1.75" />
            {:else}
              <path d="M15.75 8.5c1.4 1 2.1 2.17 2.1 3.5s-.7 2.5-2.1 3.5" />
              <path d="M18.5 6.5c2.1 1.6 3.15 3.43 3.15 5.5s-1.05 3.9-3.15 5.5" />
            {/if}
          </svg>
        </span>
      </button>
      <div class="popover volume-popover" data-surface="popover" role="group" aria-label="音量">
        <div class="volume-header">
          <span class="volume-title">音量</span>
          <span class="volume-value">{Math.round(volumePercentUi)}%</span>
        </div>
        <input type="range" min="0" max="100" bind:value={volumePercentUi} on:input={adjustVolume} />
      </div>
    </div>

    <div class="popover-group">
      <button
        type="button"
        class="utility-trigger utility-icon-button"
        data-variant="utility"
        on:click={toggleDevicePopover}
        aria-expanded={showDevicePicker}
        aria-label="输出设备"
      >
        <span class="utility-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M5.5 9.5v5h3.25l4 3V6.5l-4 3H5.5Z" />
            <path d="M15.75 8.5c1.4 1 2.1 2.17 2.1 3.5s-.7 2.5-2.1 3.5" />
          </svg>
        </span>
      </button>
      {#if showDevicePicker}
        <div class="popover device-popover" data-surface="popover">
          <p class="heading">输出设备</p>
          <ul>
            <li>
              <button
                type="button"
                class:selected={selectedDeviceId === 'default'}
                on:click={() => handleSelectDevice('default')}
              >
                <span class="device-name">系统默认</span>
                <span class="device-desc">使用系统默认输出</span>
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
                  <span class="device-desc">{asDevice(device).is_default ? '默认设备' : '输出设备'}</span>
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .player-bar {
    position: relative;
    display: grid;
    grid-template-columns: 1.2fr 1.6fr 0.9fr;
    align-items: center;
    gap: 24px;
    padding: 16px 28px;
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--surface-shell) 95%, var(--surface-canvas)),
        color-mix(in srgb, var(--surface-shell) 88%, var(--surface-canvas))
      );
    border-top: 1px solid var(--border-default);
    color: var(--text-primary);
    min-height: 110px;
    box-shadow: 0 -12px 28px color-mix(in srgb, var(--surface-canvas) 18%, transparent);
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
    background: color-mix(in srgb, var(--state-danger) 88%, var(--surface-elevated));
    border: 1px solid color-mix(in srgb, var(--state-danger) 85%, var(--border-default));
    color: var(--text-primary);
    font-size: 0.85rem;
    max-width: min(900px, calc(100% - 32px));
    z-index: 10;
    box-shadow: var(--shadow-soft);
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

  .error-banner button:hover,
  .error-banner button:focus-visible {
    background: color-mix(in srgb, var(--state-danger) 72%, transparent);
    outline: none;
  }

  .now-playing {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .now-playing-trigger {
    min-width: 0;
    flex: 1;
    display: flex;
    align-items: center;
    padding: 10px 12px;
    border: 1px solid transparent;
    border-radius: 20px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: left;
    transition:
      background 0.2s ease,
      border-color 0.2s ease,
      box-shadow 0.2s ease,
      transform 0.16s ease;
  }

  .now-playing-trigger:hover:not(:disabled),
  .now-playing-trigger:focus-visible,
  .now-playing-trigger.active {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border-color: color-mix(in srgb, var(--accent) 24%, transparent);
    box-shadow: var(--glow-accent);
    outline: none;
    transform: translateY(-1px);
  }

  .now-playing-trigger:disabled {
    cursor: not-allowed;
  }

  .current-track-cluster {
    min-width: 0;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .current-track-cluster__artwork-slot {
    inline-size: 72px;
    block-size: 72px;
    aspect-ratio: 1;
    flex: 0 0 72px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .track-meta {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .track-meta .title {
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .track-meta .artist {
    font-size: 0.85rem;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .badges {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .badge {
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border-default));
  }

  .badge.subtle {
    background: color-mix(in srgb, var(--surface-panel-subtle) 90%, transparent);
    border-color: var(--border-subtle);
  }

  .badge.availability {
    background: color-mix(in srgb, var(--state-danger) 88%, var(--surface-elevated));
    border-color: color-mix(in srgb, var(--state-danger) 82%, var(--border-default));
    color: var(--text-primary);
  }

  .availability-copy {
    margin: 0;
    font-size: 0.76rem;
    line-height: 1.4;
    color: color-mix(in srgb, var(--text-primary) 88%, var(--state-danger));
  }

  .favorite {
    flex: 0 0 auto;
    border: none;
    background: transparent;
    color: color-mix(in srgb, var(--text-secondary) 74%, var(--state-danger));
    font-size: 1.5rem;
    cursor: pointer;
    transition: transform 0.2s ease, color 0.2s ease;
  }

  .favorite.active {
    color: color-mix(in srgb, var(--text-primary) 86%, var(--state-danger));
    transform: scale(1.05);
  }

  .favorite:focus-visible {
    outline: none;
    transform: translateY(-1px);
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
    color: var(--text-secondary);
    min-width: 40px;
    text-align: center;
  }

  .progress-rail {
    position: relative;
    height: 6px;
    background: color-mix(in srgb, var(--border-default) 55%, transparent);
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
    background: color-mix(in srgb, var(--player-progress-from) 76%, var(--text-on-accent));
    border: 2px solid color-mix(in srgb, var(--player-progress-from) 38%, var(--surface-shell));
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .controls button {
    position: relative;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    cursor: pointer;
    transition:
      background 0.2s ease,
      color 0.2s ease,
      box-shadow 0.2s ease,
      transform 0.16s ease;
  }

  .controls button:hover:not(:disabled),
  .controls button:focus-visible {
    background: var(--accent-soft);
    color: var(--text-primary);
    transform: translateY(-1px);
    outline: none;
  }

  .controls button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .controls button.active,
  .controls button[aria-pressed='true'] {
    background: var(--state-selected);
    color: var(--text-primary);
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--accent) 24%, transparent),
      var(--shadow-soft);
  }

  .transport-icon {
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .transport-icon svg {
    width: 100%;
    height: 100%;
    stroke: currentColor;
    stroke-width: 1.85;
    stroke-linecap: round;
    stroke-linejoin: round;
    overflow: visible;
  }

  .transport-play-icon {
    width: 24px;
    height: 24px;
  }

  .transport-play-icon.play-glyph {
    transform: translateX(1px);
  }

  .controls .play {
    width: 52px;
    height: 52px;
    background: var(--accent-soft);
    color: var(--text-on-accent);
    box-shadow: var(--glow-accent);
  }

  .controls .play.playing {
    background: color-mix(in srgb, var(--state-playing) 80%, var(--surface-shell));
    box-shadow: 0 14px 30px color-mix(in srgb, var(--state-playing) 32%, transparent);
  }

  .transport-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--accent);
    color: var(--text-on-accent);
    font-size: 0.58rem;
    font-weight: 700;
    line-height: 1;
    box-shadow: var(--shadow-soft);
  }

  .controls .pill {
    width: auto;
    padding: 0 18px;
    font-size: 0.9rem;
    background: color-mix(in srgb, var(--state-playing) 72%, var(--surface-panel-subtle));
    border: 1px solid color-mix(in srgb, var(--state-playing) 78%, var(--border-default));
  }

  .extras {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
  }

  .utility-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border-default);
    background: color-mix(in srgb, var(--surface-panel-subtle) 92%, var(--surface-shell));
    color: var(--text-primary);
    cursor: pointer;
    box-shadow: var(--shadow-soft);
    transition:
      background 0.2s ease,
      border-color 0.2s ease,
      color 0.2s ease,
      box-shadow 0.2s ease,
      transform 0.16s ease;
  }

  .utility-trigger.active,
  .utility-trigger[aria-expanded='true'],
  .utility-trigger[aria-pressed='true'] {
    background: var(--state-selected);
    border-color: color-mix(in srgb, var(--accent) 34%, var(--border-default));
    color: var(--text-primary);
    box-shadow: var(--glow-accent);
  }

  .utility-trigger:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .utility-trigger:hover:not(:disabled),
  .utility-trigger:focus-visible {
    background: var(--accent-soft);
    border-color: color-mix(in srgb, var(--accent) 26%, var(--border-default));
    color: var(--text-primary);
    transform: translateY(-1px);
    outline: none;
  }

  .utility-icon-button {
    width: 44px;
    height: 44px;
    padding: 0;
    border-radius: 16px;
  }

  .utility-icon {
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .utility-icon svg {
    width: 100%;
    height: 100%;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
    overflow: visible;
  }

  .volume-trigger .utility-icon {
    transform: translateX(0.5px);
  }

  .popover-group {
    position: relative;
  }

  .popover {
    position: absolute;
    bottom: 120%;
    right: 0;
    background: color-mix(in srgb, var(--surface-elevated) 96%, var(--surface-shell));
    border: 1px solid var(--border-default);
    padding: 14px;
    border-radius: 16px;
    min-width: 220px;
    box-shadow: var(--shadow-elevated);
    color: var(--text-primary);
    z-index: 20;
  }

  .popover p {
    margin: 0;
  }

  .heading {
    font-size: 0.85rem;
    font-weight: 600;
    margin-bottom: 8px;
    color: var(--text-primary);
  }

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

  .volume-header {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .volume-title,
  .volume-value {
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .volume-value {
    font-variant-numeric: tabular-nums;
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
    border: 1px solid transparent;
    background: var(--surface-panel-subtle);
    border-radius: 10px;
    padding: 8px 10px;
    color: inherit;
    cursor: pointer;
    transition:
      background 0.2s ease,
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }

  .device-popover button:hover,
  .device-popover button:focus-visible {
    background: var(--accent-soft);
    border-color: color-mix(in srgb, var(--accent) 22%, var(--border-default));
    box-shadow: var(--shadow-soft);
    outline: none;
  }

  .device-popover button.selected {
    background: var(--state-selected);
    border-color: color-mix(in srgb, var(--accent) 34%, var(--border-default));
  }

  .device-name {
    font-size: 0.85rem;
    font-weight: 600;
  }

  .device-desc {
    font-size: 0.75rem;
    color: var(--text-secondary);
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
  }
</style>
