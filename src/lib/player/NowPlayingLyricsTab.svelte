<script lang="ts">
  import { afterUpdate, onDestroy } from 'svelte';

  import { buildLyricsPanelState, type LyricsLine } from './lyrics';
  import type { PlaybackStateInfo, Track } from '../types';

  export let track: Track | null = null;
  export let progress = 0;
  export let playbackState: PlaybackStateInfo = { state: 'stopped' };
  export let onSeekToTimestamp: (seconds: number) => void = () => {};

  let scrollRegion: HTMLDivElement | null = null;
  const lineElements = new Map<string, HTMLElement>();

  let lines: LyricsLine[] = [];
  let activeIndex = -1;
  let hasTimedLyrics = false;
  let isBrowseMode = false;
  let selectedIndex: number | null = null;
  let browseTimer: ReturnType<typeof setTimeout> | null = null;
  let lastTrackId: string | null = null;
  let lastFollowSignature = '';

  $: lyricsState = buildLyricsPanelState(track?.lyrics, progress);
  $: lines = lyricsState.lines;
  $: activeIndex = lyricsState.activeIndex;
  $: hasTimedLyrics = lyricsState.hasTimedLyrics;
  $: selectedLine = selectedIndex === null ? null : lines[selectedIndex] ?? null;

  function clearBrowseTimer(): void {
    if (!browseTimer) {
      return;
    }

    clearTimeout(browseTimer);
    browseTimer = null;
  }

  function resetBrowseMode(): void {
    clearBrowseTimer();
    isBrowseMode = false;
    selectedIndex = null;
  }

  function scheduleBrowseReset(): void {
    clearBrowseTimer();
    browseTimer = setTimeout(() => {
      resetBrowseMode();
      scrollActiveLineIntoView();
    }, 5_000);
  }

  function scrollActiveLineIntoView(): void {
    if (activeIndex < 0) {
      return;
    }

    const line = lines[activeIndex];
    if (!line) {
      return;
    }

    lineElements.get(line.id)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function resolveSelectedIndex(): number | null {
    if (!scrollRegion || !hasTimedLyrics || lines.length === 0) {
      return null;
    }

    const guideLineY = scrollRegion.scrollTop + scrollRegion.clientHeight / 2;
    let nearestIndex: number | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    lines.forEach((line, index) => {
      if (line.timestamp === null) {
        return;
      }

      const element = lineElements.get(line.id);
      if (!element) {
        return;
      }

      const lineCenter = element.offsetTop + element.offsetHeight / 2;
      const distance = Math.abs(lineCenter - guideLineY);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    return nearestIndex;
  }

  function handleScroll(): void {
    if (!hasTimedLyrics) {
      return;
    }

    isBrowseMode = true;
    selectedIndex = resolveSelectedIndex();
    scheduleBrowseReset();
  }

  function handleSeekSelection(): void {
    if (!selectedLine || selectedLine.timestamp === null) {
      return;
    }

    onSeekToTimestamp(Math.floor(selectedLine.timestamp));
    resetBrowseMode();
  }

  function registerLine(node: HTMLElement, id: string) {
    lineElements.set(id, node);
    return {
      destroy() {
        lineElements.delete(id);
      },
    };
  }

  $: if (track?.id !== lastTrackId) {
    lastTrackId = track?.id ?? null;
    resetBrowseMode();
    lastFollowSignature = '';
  }

  afterUpdate(() => {
    if (!track || !hasTimedLyrics || isBrowseMode) {
      return;
    }

    if (activeIndex < 0) {
      return;
    }

    if (playbackState.state !== 'playing') {
      return;
    }

    const nextSignature = `${track.id}:${activeIndex}:${playbackState.state}`;
    if (nextSignature === lastFollowSignature) {
      return;
    }

    lastFollowSignature = nextSignature;
    scrollActiveLineIntoView();
  });

  onDestroy(() => {
    clearBrowseTimer();
  });

  function formatTimestamp(seconds: number): string {
    const wholeSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(wholeSeconds / 60);
    const remainder = (wholeSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${remainder}`;
  }
</script>

{#if !track}
  <div class="lyrics-state lyrics-empty">
    <p class="lyrics-empty-title">暂无歌词</p>
    <p class="lyrics-empty-copy">当前歌曲还没有可显示的歌词内容。</p>
  </div>
{:else if lines.length === 0}
  <div class="lyrics-state lyrics-empty">
    <p class="lyrics-empty-title">暂无歌词</p>
    <p class="lyrics-empty-copy">当前歌曲还没有可显示的歌词内容。</p>
  </div>
{:else if !hasTimedLyrics}
  <div class="lyrics-scroll plain-lyrics" data-testid="lyrics-scroll-region">
    {#each lines as line (line.id)}
      <p class="lyrics-line plain">{line.text}</p>
    {/each}
  </div>
{:else}
  <div class="lyrics-shell">
    <div
      bind:this={scrollRegion}
      class="lyrics-scroll timed-lyrics"
      data-testid="lyrics-scroll-region"
      on:scroll={handleScroll}
    >
      {#each lines as line, index (line.id)}
        <div
          use:registerLine={line.id}
          class:active={index === activeIndex}
          class:selected={index === selectedIndex}
          class="lyrics-row"
          data-lyrics-line
          aria-current={index === activeIndex ? 'true' : undefined}
        >
          {line.text}
        </div>
      {/each}

      {#if isBrowseMode}
        <div class="lyrics-guide-line" data-testid="lyrics-guide-line" aria-hidden="true"></div>
      {/if}
    </div>

    {#if isBrowseMode && selectedLine && selectedLine.timestamp !== null}
      <button
        type="button"
        class="lyrics-seek-pill"
        aria-label={`跳转到 ${formatTimestamp(selectedLine.timestamp)}`}
        on:click={handleSeekSelection}
      >
        ▶︎ {formatTimestamp(selectedLine.timestamp)}
      </button>
    {/if}
  </div>
{/if}

<style>
  .lyrics-shell {
    position: relative;
    min-height: 0;
    height: 100%;
  }

  .lyrics-scroll {
    position: relative;
    height: 100%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 8px 56px 8px 0;
    scroll-behavior: smooth;
  }

  .lyrics-row,
  .lyrics-line {
    color: rgba(226, 232, 240, 0.6);
    font-size: 1rem;
    line-height: 1.8;
    transition: color 0.16s ease, transform 0.16s ease;
  }

  .lyrics-row.active {
    color: rgba(255, 255, 255, 0.98);
    font-weight: 700;
  }

  .lyrics-row.selected {
    outline: 1px solid color-mix(in srgb, var(--accent) 38%, transparent);
    outline-offset: 4px;
    border-radius: 10px;
  }

  .lyrics-line.plain {
    color: rgba(226, 232, 240, 0.82);
  }

  .lyrics-guide-line {
    position: sticky;
    top: 50%;
    transform: translateY(-50%);
    height: 1px;
    width: 100%;
    background: color-mix(in srgb, var(--accent) 48%, rgba(255, 255, 255, 0.18));
    pointer-events: none;
    z-index: 2;
  }

  .lyrics-seek-pill {
    position: absolute;
    top: 50%;
    right: 0;
    transform: translateY(-50%);
    border: 1px solid color-mix(in srgb, var(--accent) 48%, rgba(255, 255, 255, 0.18));
    background: rgba(15, 23, 42, 0.82);
    color: rgba(255, 255, 255, 0.96);
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .lyrics-state {
    display: flex;
    height: 100%;
    flex-direction: column;
    justify-content: center;
    gap: 8px;
  }

  .lyrics-empty-title {
    font-size: 1rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.95);
  }

  .lyrics-empty-copy {
    color: rgba(148, 163, 184, 0.88);
  }
</style>
