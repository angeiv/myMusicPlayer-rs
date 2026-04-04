<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let selectedCount = 0;
  export let canPlaySelected = true;
  export let playSelectedHint = '';
  export let canAddToPlaylist = true;
  export let addToPlaylistHint = '';

  const playSelectedHintId = 'songs-bulk-action-play-selected-hint';
  const addToPlaylistHintId = 'songs-bulk-action-add-to-playlist-hint';

  const dispatch = createEventDispatcher<{
    playSelected: void;
    addToQueue: void;
    addToPlaylist: { anchor: DOMRect };
    clearSelection: void;
  }>();

  $: disabledPlaySelectedHint = !canPlaySelected ? playSelectedHint.trim() : '';
  $: disabledAddToPlaylistHint = !canAddToPlaylist ? addToPlaylistHint.trim() : '';
  $: playSelectedDescription = disabledPlaySelectedHint.length > 0 ? playSelectedHintId : undefined;
  $: addToPlaylistDescription = disabledAddToPlaylistHint.length > 0 ? addToPlaylistHintId : undefined;
  $: toolbarDescription =
    [playSelectedDescription, addToPlaylistDescription].filter(Boolean).join(' ') || undefined;

  function handleAddToPlaylist(event: MouseEvent): void {
    const trigger = event.currentTarget;

    if (!(trigger instanceof HTMLElement)) {
      return;
    }

    dispatch('addToPlaylist', {
      anchor: trigger.getBoundingClientRect(),
    });
  }
</script>

<div
  class="bulk-action-bar"
  role="toolbar"
  aria-label="歌曲批量操作"
  aria-describedby={toolbarDescription}
>
  <div class="summary">
    <span class="count">已选 {selectedCount} 首</span>
    <span class="hint">批量操作当前可见选择</span>
  </div>

  <div class="controls">
    <div class="actions">
      <button
        type="button"
        disabled={!canPlaySelected}
        aria-describedby={playSelectedDescription}
        on:click={() => dispatch('playSelected')}
      >
        播放选中
      </button>
      <button type="button" on:click={() => dispatch('addToQueue')}>加入队列</button>
      <button
        type="button"
        disabled={!canAddToPlaylist}
        aria-describedby={addToPlaylistDescription}
        on:click={handleAddToPlaylist}
      >
        加入歌单
      </button>
      <button type="button" class="ghost" on:click={() => dispatch('clearSelection')}>清除选择</button>
    </div>

    {#if disabledPlaySelectedHint}
      <p id={playSelectedHintId} class="disabled-hint" role="status" aria-live="polite" aria-atomic="true">
        {disabledPlaySelectedHint}
      </p>
    {/if}

    {#if disabledAddToPlaylistHint}
      <p id={addToPlaylistHintId} class="disabled-hint" role="status" aria-live="polite" aria-atomic="true">
        {disabledAddToPlaylistHint}
      </p>
    {/if}
  </div>
</div>

<style>
  .bulk-action-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 18px;
    border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border-default));
    border-radius: 18px;
    background: color-mix(in srgb, var(--state-selected) 72%, var(--surface-panel-subtle));
    box-shadow: var(--shadow-soft);
  }

  .summary {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .count {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .hint {
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .controls {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 10px;
  }

  .disabled-hint {
    margin: 0;
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  button {
    border: none;
    border-radius: 999px;
    padding: 10px 16px;
    font: inherit;
    font-weight: 600;
    color: var(--text-primary);
    background: color-mix(in srgb, var(--surface-panel) 88%, transparent);
    cursor: pointer;
    transition:
      transform 0.16s ease,
      background 0.16s ease,
      box-shadow 0.16s ease,
      opacity 0.16s ease;
  }

  button:hover:not(:disabled),
  button:focus-visible:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 18%, var(--surface-panel));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent);
    transform: translateY(-1px);
    outline: none;
  }

  .ghost {
    background: color-mix(in srgb, var(--surface-panel-subtle) 84%, transparent);
    color: var(--text-secondary);
  }

  .ghost:hover:not(:disabled),
  .ghost:focus-visible:not(:disabled) {
    background: color-mix(in srgb, var(--surface-panel-subtle) 92%, var(--state-selected));
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  @media (max-width: 860px) {
    .bulk-action-bar {
      align-items: flex-start;
      flex-direction: column;
    }

    .controls {
      align-items: flex-start;
      width: 100%;
    }

    .actions {
      justify-content: flex-start;
    }
  }
</style>
