<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  import { playlistPickerCopy } from '../../copy/zh-cn';
  import type { Playlist } from '../../types';

  export let playlists: Playlist[] = [];
  export let anchor: DOMRect | null = null;

  const viewportPadding = 12;
  const anchorGap = 8;
  const maxPickerWidth = 320;
  const maxPickerHeight = 420;
  const minPickerHeight = 180;
  const estimatedChromeHeight = 88;

  const dispatch = createEventDispatcher<{
    selectPlaylist: { playlistId: string };
    close: void;
  }>();

  function clamp(value: number, min: number, max: number): number {
    if (max <= min) {
      return min;
    }

    return Math.min(Math.max(value, min), max);
  }

  function getViewportSize(): { width: number; height: number } {
    if (typeof window === 'undefined') {
      return {
        width: maxPickerWidth + viewportPadding * 2,
        height: maxPickerHeight + viewportPadding * 2,
      };
    }

    return {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }

  let top = 0;
  let left = 0;
  let listMaxHeight = 0;
  let pickerMaxHeight = maxPickerHeight;

  $: viewport = getViewportSize();
  $: pickerWidth = Math.min(maxPickerWidth, Math.max(0, viewport.width - viewportPadding * 2));
  $: viewportMaxHeight = Math.max(0, Math.min(maxPickerHeight, viewport.height - viewportPadding * 2));
  $: minimumUsableHeight = Math.min(minPickerHeight, viewportMaxHeight);
  $: if (anchor === null) {
    top = 0;
    left = 0;
    pickerMaxHeight = viewportMaxHeight;
    listMaxHeight = Math.max(0, pickerMaxHeight - estimatedChromeHeight);
  } else {
    const availableBelow = viewport.height - anchor.bottom - anchorGap - viewportPadding;
    const availableAbove = anchor.top - anchorGap - viewportPadding;
    const placeBelow = availableBelow >= minimumUsableHeight || availableBelow >= availableAbove;
    const preferredSpace = placeBelow ? availableBelow : availableAbove;

    pickerMaxHeight = Math.min(viewportMaxHeight, Math.max(minimumUsableHeight, preferredSpace));

    const maxTop = Math.max(viewportPadding, viewport.height - pickerMaxHeight - viewportPadding);
    const preferredTop = placeBelow
      ? anchor.bottom + anchorGap
      : anchor.top - anchorGap - pickerMaxHeight;

    top = clamp(preferredTop, viewportPadding, maxTop);

    const maxLeft = Math.max(viewportPadding, viewport.width - pickerWidth - viewportPadding);
    left = clamp(anchor.left, viewportPadding, maxLeft);
    listMaxHeight = Math.max(0, pickerMaxHeight - estimatedChromeHeight);
  }
</script>

{#if anchor !== null}
  <div
    class="playlist-picker"
    role="dialog"
    aria-label={playlistPickerCopy.choosePlaylist}
    aria-modal="false"
    style={`top:${top}px;left:${left}px;max-height:${pickerMaxHeight}px;`}
  >
    <div class="header">
      <div>
        <p class="label">{playlistPickerCopy.addToPlaylist}</p>
        <h3>{playlistPickerCopy.choosePlaylist}</h3>
      </div>
      <button type="button" class="close" aria-label={playlistPickerCopy.close} on:click={() => dispatch('close')}>
        ×
      </button>
    </div>

    {#if playlists.length === 0}
      <p class="empty">{playlistPickerCopy.empty}</p>
    {:else}
      <div class="playlist-list" role="list" style={`max-height:${listMaxHeight}px;`}>
        {#each playlists as playlist}
          <div role="listitem">
            <button
              type="button"
              class="playlist-option"
              on:click={() => dispatch('selectPlaylist', { playlistId: playlist.id })}
            >
              <span class="name">{playlist.name}</span>
              <span class="meta">{playlist.track_ids.length} 首</span>
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .playlist-picker {
    position: fixed;
    z-index: 65;
    width: min(320px, calc(100vw - 24px));
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    border-radius: 18px;
    border: 1px solid var(--border-default);
    background: color-mix(in srgb, var(--surface-elevated) 96%, transparent);
    box-shadow: var(--shadow-elevated);
    overflow: hidden;
  }

  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .label {
    margin: 0 0 4px;
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }

  h3 {
    margin: 0;
    font-size: 1rem;
    color: var(--text-primary);
  }

  .close {
    border: none;
    border-radius: 999px;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    font: inherit;
    font-size: 1.2rem;
    color: var(--text-secondary);
    background: color-mix(in srgb, var(--surface-panel-subtle) 82%, transparent);
    cursor: pointer;
  }

  .close:hover,
  .close:focus-visible {
    background: color-mix(in srgb, var(--accent) 16%, var(--surface-panel-subtle));
    outline: none;
  }

  .playlist-list {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    padding-right: 4px;
  }

  .playlist-option {
    width: 100%;
    border: none;
    border-radius: 14px;
    padding: 12px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font: inherit;
    color: var(--text-primary);
    background: color-mix(in srgb, var(--surface-panel-subtle) 88%, transparent);
    cursor: pointer;
    text-align: left;
    transition:
      background 0.16s ease,
      box-shadow 0.16s ease,
      transform 0.16s ease;
  }

  .playlist-option:hover,
  .playlist-option:focus-visible {
    background: color-mix(in srgb, var(--accent) 14%, var(--surface-panel-subtle));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent);
    transform: translateY(-1px);
    outline: none;
  }

  .name {
    font-weight: 600;
    text-align: left;
  }

  .meta {
    flex-shrink: 0;
    font-size: 0.8rem;
    color: var(--text-tertiary);
  }

  .empty {
    margin: 0;
    padding: 20px 12px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--surface-panel-subtle) 90%, transparent);
    color: var(--text-secondary);
    text-align: center;
  }
</style>
