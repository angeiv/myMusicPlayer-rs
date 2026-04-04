<script lang="ts">
  import { afterUpdate, tick } from 'svelte';

  import CoverArt from '../components/CoverArt.svelte';
  import type { PlaybackStateInfo, Track } from '../types';
  import { getPlaybackSurfaceAvailability } from '../utils/track-availability';
  import NowPlayingLyricsTab from './NowPlayingLyricsTab.svelte';
  import { nowPlayingUi, type NowPlayingTab } from './now-playing';
  import QueueList from './QueueList.svelte';
  import { sharedPlayback } from './sharedPlayback';

  const overlayTitleId = 'now-playing-overlay-title';
  const lyricsTabId = 'now-playing-overlay-tab-lyrics';
  const queueTabId = 'now-playing-overlay-tab-queue';
  const lyricsPanelId = 'now-playing-overlay-panel-lyrics';
  const queuePanelId = 'now-playing-overlay-panel-queue';

  const nowPlayingState = nowPlayingUi.state;

  let isOpen = false;
  let activeTab: NowPlayingTab = 'lyrics';
  let currentTrack: Track | null = null;
  let currentTrackAvailability: ReturnType<typeof getPlaybackSurfaceAvailability> | null = null;
  let playbackState: PlaybackStateInfo = { state: 'stopped' };
  let progress = 0;
  let queueTracks: Track[] = [];
  let backButton: HTMLButtonElement | null = null;
  let lyricsTabButton: HTMLButtonElement | null = null;
  let queueTabButton: HTMLButtonElement | null = null;
  let wasOpen = false;

  $: isOpen = $nowPlayingState.isOpen;
  $: activeTab = $nowPlayingState.activeTab;
  $: currentTrack = $sharedPlayback.currentTrack;
  $: playbackState = $sharedPlayback.playbackState;
  $: currentTrackAvailability = currentTrack
    ? getPlaybackSurfaceAvailability(currentTrack, { isCurrent: true, playbackState })
    : null;
  $: progress = $sharedPlayback.progress;
  $: queueTracks = $sharedPlayback.queueTracks;

  afterUpdate(async () => {
    if (!isOpen) {
      wasOpen = false;
      return;
    }

    if (wasOpen) {
      return;
    }

    wasOpen = true;
    await tick();
    (backButton ?? (activeTab === 'queue' ? queueTabButton : lyricsTabButton))?.focus();
  });

  function closeOverlay(): void {
    nowPlayingUi.close();
  }

  function handleWindowKeydown(event: KeyboardEvent): void {
    if (!isOpen || event.key !== 'Escape') {
      return;
    }

    event.preventDefault();
    closeOverlay();
  }

  function activateTab(tab: NowPlayingTab): void {
    nowPlayingUi.setActiveTab(tab);

    if (tab === 'queue') {
      void sharedPlayback.refreshQueue();
    }
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
</script>

<svelte:window on:keydown={handleWindowKeydown} />

{#if isOpen}
  <section class="now-playing-overlay" aria-labelledby={overlayTitleId} data-surface="overlay">
    <div class="overlay-header">
      <button
        bind:this={backButton}
        type="button"
        class="overlay-back"
        on:click={closeOverlay}
        aria-label="返回播放器"
      >
        <span aria-hidden="true">←</span>
      </button>

      <div class="overlay-heading">
        <p class="overlay-eyebrow">播放详情</p>
        <h2 id={overlayTitleId}>正在播放</h2>
        <p class="overlay-subtitle">
          {#if currentTrack}
            {currentTrack.artist_name ?? 'Unknown Artist'} · {currentTrack.album_title ?? 'Single'}
          {:else}
            打开歌曲后可在这里查看播放详情与队列。
          {/if}
        </p>
      </div>

      <div class="overlay-tabs" role="tablist" aria-label="正在播放视图">
        <button
          bind:this={lyricsTabButton}
          id={lyricsTabId}
          type="button"
          role="tab"
          data-variant="tab"
          class:active={activeTab === 'lyrics'}
          aria-controls={lyricsPanelId}
          aria-selected={activeTab === 'lyrics'}
          tabindex={activeTab === 'lyrics' ? 0 : -1}
          on:click={() => activateTab('lyrics')}
        >
          歌词
        </button>
        <button
          bind:this={queueTabButton}
          id={queueTabId}
          type="button"
          role="tab"
          data-variant="tab"
          class:active={activeTab === 'queue'}
          aria-controls={queuePanelId}
          aria-selected={activeTab === 'queue'}
          tabindex={activeTab === 'queue' ? 0 : -1}
          on:click={() => activateTab('queue')}
        >
          队列
        </button>
      </div>
    </div>

    <div class="overlay-body">
      <aside class="track-summary" data-surface="panel" aria-label="当前歌曲信息">
        <CoverArt
          className="now-playing-overlay__artwork"
          artworkPath={currentTrack?.artwork_path}
          title={currentTrack?.title ?? '尚未开始播放'}
          alt={currentTrack ? `${currentTrack.title} 的封面` : ''}
        />

        <div class="track-copy" data-availability={currentTrackAvailability?.availability ?? 'available'}>
          <p class="track-title">{currentTrack?.title ?? '尚未开始播放'}</p>
          <p class="track-artist">{currentTrack?.artist_name ?? 'Unknown Artist'}</p>
          {#if currentTrackAvailability?.badge}
            <span class="availability-badge">{currentTrackAvailability.badge}</span>
          {/if}
          {#if currentTrackAvailability?.description}
            <p class="track-status">{currentTrackAvailability.description}</p>
          {/if}
        </div>

        <dl class="track-meta-grid">
          <div>
            <dt>专辑</dt>
            <dd>{currentTrack?.album_title ?? 'Single'}</dd>
          </div>
          <div>
            <dt>时长</dt>
            <dd>{formatDuration(currentTrack?.duration)}</dd>
          </div>
          <div>
            <dt>流派</dt>
            <dd>{currentTrack?.genre ?? '未分类'}</dd>
          </div>
          <div>
            <dt>队列</dt>
            <dd>{queueTracks.length} 首</dd>
          </div>
        </dl>
      </aside>

      <div class="overlay-panel">
        {#if activeTab === 'lyrics'}
          <div
            id={lyricsPanelId}
            role="tabpanel"
            aria-labelledby={lyricsTabId}
            class="panel-card lyrics-panel"
            data-surface="panel"
          >
            <NowPlayingLyricsTab
              track={currentTrack}
              progress={progress}
              playbackState={playbackState}
              onSeekToTimestamp={(seconds) => void sharedPlayback.playFromLyricsTimestamp(seconds)}
            />
          </div>
        {:else}
          <div
            id={queuePanelId}
            role="tabpanel"
            aria-labelledby={queueTabId}
            class="panel-card queue-panel"
            data-surface="panel"
          >
            <QueueList
              tracks={queueTracks}
              currentTrackId={currentTrack?.id ?? null}
              playbackState={playbackState}
              onSelect={(track) => void sharedPlayback.playQueueTrack(track)}
              onRemove={(track) => void sharedPlayback.removeQueueTrack(track.id)}
              onClear={() => void sharedPlayback.clearQueue()}
            />
          </div>
        {/if}
      </div>
    </div>
  </section>
{/if}

<style>
  .now-playing-overlay {
    position: fixed;
    inset: 24px 24px 126px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 24px;
    border-radius: 28px;
    background:
      radial-gradient(circle at top, color-mix(in srgb, var(--accent) 10%, transparent), transparent 30%),
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--surface-elevated) 96%, var(--surface-shell)),
        color-mix(in srgb, var(--surface-shell) 88%, var(--surface-canvas))
      );
    border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--border-default));
    box-shadow: var(--shadow-elevated);
    backdrop-filter: blur(18px);
    z-index: 30;
    overflow: hidden;
  }

  .overlay-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 16px;
    align-items: center;
  }

  .overlay-back,
  .overlay-tabs button {
    border: 1px solid var(--border-default);
    background: color-mix(in srgb, var(--surface-panel-subtle) 90%, var(--surface-shell));
    color: var(--text-primary);
    cursor: pointer;
    transition:
      transform 0.16s ease,
      background 0.2s ease,
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }

  .overlay-back {
    width: 48px;
    height: 48px;
    border-radius: 999px;
    font-size: 1.2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .overlay-back:hover,
  .overlay-back:focus-visible,
  .overlay-tabs button:hover,
  .overlay-tabs button:focus-visible {
    outline: none;
    transform: translateY(-1px);
    background: var(--accent-soft);
    border-color: color-mix(in srgb, var(--accent) 28%, var(--border-default));
    box-shadow: var(--shadow-soft);
  }

  .overlay-heading {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .overlay-heading h2,
  .overlay-heading p,
  .track-copy p,
  .track-meta-grid dt,
  .track-meta-grid dd {
    margin: 0;
  }

  .overlay-eyebrow {
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }

  .overlay-heading h2 {
    font-size: 1.65rem;
    line-height: 1.1;
    color: var(--text-primary);
  }

  .overlay-subtitle {
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .overlay-tabs {
    display: inline-flex;
    gap: 10px;
    align-items: center;
    justify-content: flex-end;
  }

  .overlay-tabs button {
    min-width: 84px;
    padding: 10px 16px;
    border-radius: 999px;
    font-size: 0.95rem;
  }

  .overlay-tabs button.active,
  .overlay-tabs button[aria-selected='true'] {
    background: var(--state-selected);
    border-color: color-mix(in srgb, var(--accent) 32%, var(--border-default));
    box-shadow: var(--glow-accent);
  }

  .overlay-body {
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(280px, 0.92fr) minmax(0, 1.3fr);
    gap: 20px;
  }

  .track-summary,
  .panel-card {
    min-height: 0;
    border-radius: 24px;
    border: 1px solid var(--border-default);
    background: color-mix(in srgb, var(--surface-panel) 92%, var(--surface-shell));
    box-shadow: var(--shadow-soft);
  }

  .track-summary {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  :global(.now-playing-overlay__artwork) {
    width: min(100%, 320px);
    aspect-ratio: 1;
    border-radius: 24px;
  }

  .track-copy {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .track-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .track-artist {
    font-size: 1rem;
    color: var(--text-secondary);
  }

  .availability-badge {
    display: inline-flex;
    width: fit-content;
    padding: 4px 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--state-danger) 84%, var(--surface-elevated));
    border: 1px solid color-mix(in srgb, var(--state-danger) 72%, var(--border-default));
    color: var(--text-primary);
    font-size: 0.78rem;
    font-weight: 600;
    line-height: 1.3;
  }

  .track-status {
    font-size: 0.9rem;
    line-height: 1.5;
    color: color-mix(in srgb, var(--text-primary) 86%, var(--state-danger));
  }

  .track-meta-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .track-meta-grid div {
    padding: 14px;
    border-radius: 18px;
    background: var(--surface-panel-subtle);
    border: 1px solid var(--border-subtle);
  }

  .track-meta-grid dt {
    font-size: 0.78rem;
    color: var(--text-tertiary);
    margin-bottom: 6px;
  }

  .track-meta-grid dd {
    font-size: 0.95rem;
    color: var(--text-primary);
    word-break: break-word;
  }

  .overlay-panel,
  .panel-card {
    min-height: 0;
  }

  .panel-card {
    height: 100%;
    padding: 24px;
    overflow: auto;
  }

  .lyrics-panel {
    min-height: 0;
  }

  .queue-panel {
    padding: 20px;
  }

  @media (max-width: 960px) {
    .now-playing-overlay {
      inset: 16px 16px 118px;
      padding: 18px;
      border-radius: 24px;
    }

    .overlay-header,
    .overlay-body {
      grid-template-columns: 1fr;
    }

    .overlay-tabs {
      justify-content: flex-start;
      flex-wrap: wrap;
    }

    :global(.now-playing-overlay__artwork) {
      width: min(100%, 240px);
    }
  }
</style>
