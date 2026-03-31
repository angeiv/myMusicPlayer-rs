<script lang="ts">
  import { afterUpdate, tick } from 'svelte';

  import QueueList from './QueueList.svelte';
  import { nowPlayingUi, type NowPlayingTab } from './now-playing';
  import { sharedPlayback } from './sharedPlayback';
  import type { Track } from '../types';

  const overlayTitleId = 'now-playing-overlay-title';
  const lyricsTabId = 'now-playing-overlay-tab-lyrics';
  const queueTabId = 'now-playing-overlay-tab-queue';
  const lyricsPanelId = 'now-playing-overlay-panel-lyrics';
  const queuePanelId = 'now-playing-overlay-panel-queue';

  const nowPlayingState = nowPlayingUi.state;

  let isOpen = false;
  let activeTab: NowPlayingTab = 'lyrics';
  let currentTrack: Track | null = null;
  let queueTracks: Track[] = [];
  let backButton: HTMLButtonElement | null = null;
  let lyricsTabButton: HTMLButtonElement | null = null;
  let queueTabButton: HTMLButtonElement | null = null;
  let wasOpen = false;

  $: isOpen = $nowPlayingState.isOpen;
  $: activeTab = $nowPlayingState.activeTab;
  $: currentTrack = $sharedPlayback.currentTrack;
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

  function artworkLabel(track: Track | null): string {
    const source = track?.title?.trim() || '♪';
    return source.charAt(0).toUpperCase();
  }
</script>

<svelte:window on:keydown={handleWindowKeydown} />

{#if isOpen}
  <section class="now-playing-overlay" aria-labelledby={overlayTitleId}>
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
      <aside class="track-summary" aria-label="当前歌曲信息">
        <div class="artwork" aria-hidden="true">{artworkLabel(currentTrack)}</div>

        <div class="track-copy">
          <p class="track-title">{currentTrack?.title ?? '尚未开始播放'}</p>
          <p class="track-artist">{currentTrack?.artist_name ?? 'Unknown Artist'}</p>
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
          >
            <div class="panel-copy">
              <p class="panel-eyebrow">歌词</p>
              <h3>{currentTrack?.title ?? '歌词内容'}</h3>
              <p>
                Task 5 将在这里接入完整歌词组件。当前阶段先提供 overlay 外壳、焦点、和
                tab 契约。
              </p>
            </div>
            <div class="panel-placeholder" aria-hidden="true">
              <span>♪</span>
            </div>
          </div>
        {:else}
          <div id={queuePanelId} role="tabpanel" aria-labelledby={queueTabId} class="panel-card queue-panel">
            <QueueList
              tracks={queueTracks}
              currentTrackId={currentTrack?.id ?? null}
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
      linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.94)),
      color-mix(in srgb, var(--app-bg) 92%, #020617);
    border: 1px solid color-mix(in srgb, var(--accent) 28%, rgba(148, 163, 184, 0.16));
    box-shadow:
      0 28px 72px rgba(2, 6, 23, 0.48),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
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
    border: 1px solid color-mix(in srgb, var(--player-border) 75%, transparent);
    background: color-mix(in srgb, var(--player-border) 55%, rgba(15, 23, 42, 0.8));
    color: rgba(241, 245, 249, 0.96);
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
    background: color-mix(in srgb, var(--accent) 18%, rgba(15, 23, 42, 0.88));
    border-color: color-mix(in srgb, var(--accent) 55%, rgba(96, 165, 250, 0.45));
    box-shadow: 0 12px 26px rgba(37, 99, 235, 0.16);
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
  .panel-copy p,
  .track-meta-grid dt,
  .track-meta-grid dd {
    margin: 0;
  }

  .overlay-eyebrow,
  .panel-eyebrow {
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(148, 163, 184, 0.9);
  }

  .overlay-heading h2 {
    font-size: 1.65rem;
    line-height: 1.1;
    color: rgba(248, 250, 252, 0.98);
  }

  .overlay-subtitle {
    color: rgba(203, 213, 225, 0.82);
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
    background: rgba(37, 99, 235, 0.32);
    border-color: rgba(96, 165, 250, 0.5);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.06),
      0 14px 30px rgba(37, 99, 235, 0.22);
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
    border: 1px solid color-mix(in srgb, var(--player-border) 78%, transparent);
    background: color-mix(in srgb, var(--player-border) 42%, rgba(15, 23, 42, 0.85));
  }

  .track-summary {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .artwork {
    width: min(100%, 320px);
    aspect-ratio: 1;
    border-radius: 24px;
    display: grid;
    place-items: center;
    font-size: clamp(3rem, 8vw, 6rem);
    font-weight: 700;
    color: rgba(241, 245, 249, 0.96);
    background:
      radial-gradient(circle at top left, rgba(96, 165, 250, 0.36), transparent 48%),
      linear-gradient(135deg, rgba(79, 70, 229, 0.4), rgba(14, 165, 233, 0.28));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
  }

  .track-copy {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .track-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: rgba(248, 250, 252, 0.98);
  }

  .track-artist {
    font-size: 1rem;
    color: rgba(203, 213, 225, 0.84);
  }

  .track-meta-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .track-meta-grid div {
    padding: 14px;
    border-radius: 18px;
    background: rgba(15, 23, 42, 0.45);
  }

  .track-meta-grid dt {
    font-size: 0.78rem;
    color: rgba(148, 163, 184, 0.9);
    margin-bottom: 6px;
  }

  .track-meta-grid dd {
    font-size: 0.95rem;
    color: rgba(241, 245, 249, 0.94);
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
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 18px;
    align-items: stretch;
  }

  .panel-copy {
    display: flex;
    flex-direction: column;
    gap: 10px;
    justify-content: center;
  }

  .panel-copy h3 {
    margin: 0;
    font-size: 1.3rem;
    color: rgba(248, 250, 252, 0.98);
  }

  .panel-copy p:last-child {
    line-height: 1.7;
    color: rgba(203, 213, 225, 0.86);
  }

  .panel-placeholder {
    width: clamp(110px, 18vw, 180px);
    min-height: 100%;
    border-radius: 22px;
    display: grid;
    place-items: center;
    background: linear-gradient(180deg, rgba(37, 99, 235, 0.18), rgba(15, 23, 42, 0.3));
    color: rgba(191, 219, 254, 0.92);
    font-size: clamp(2rem, 6vw, 3.2rem);
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
    .overlay-body,
    .lyrics-panel {
      grid-template-columns: 1fr;
    }

    .overlay-tabs {
      justify-content: flex-start;
      flex-wrap: wrap;
    }

    .artwork {
      width: min(100%, 240px);
    }

    .panel-placeholder {
      width: 100%;
      min-height: 120px;
    }
  }
</style>
