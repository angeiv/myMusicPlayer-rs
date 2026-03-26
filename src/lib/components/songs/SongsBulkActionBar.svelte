<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let selectedCount = 0;
  export let canAddToPlaylist = true;
  export let addToPlaylistHint = '';

  const dispatch = createEventDispatcher<{
    playSelected: void;
    addToQueue: void;
    addToPlaylist: { anchor: DOMRect };
    clearSelection: void;
  }>();

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

<div class="bulk-action-bar" role="toolbar" aria-label="歌曲批量操作">
  <div class="summary">
    <span class="count">已选 {selectedCount} 首</span>
    <span class="hint">批量操作当前可见选择</span>
  </div>

  <div class="actions">
    <button type="button" on:click={() => dispatch('playSelected')}>播放选中</button>
    <button type="button" on:click={() => dispatch('addToQueue')}>加入队列</button>
    <button
      type="button"
      disabled={!canAddToPlaylist}
      title={canAddToPlaylist ? undefined : addToPlaylistHint}
      on:click={handleAddToPlaylist}
    >
      加入歌单
    </button>
    <button type="button" class="ghost" on:click={() => dispatch('clearSelection')}>清除选择</button>
  </div>
</div>

<style>
  .bulk-action-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 18px;
    border: 1px solid rgba(96, 165, 250, 0.25);
    border-radius: 16px;
    background: rgba(15, 23, 42, 0.78);
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
  }

  .summary {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .count {
    font-size: 0.95rem;
    font-weight: 700;
    color: #eff6ff;
  }

  .hint {
    font-size: 0.8rem;
    color: rgba(191, 219, 254, 0.72);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 10px;
  }

  button {
    border: none;
    border-radius: 999px;
    padding: 10px 16px;
    font: inherit;
    font-weight: 600;
    color: #e0f2fe;
    background: rgba(59, 130, 246, 0.22);
    cursor: pointer;
    transition:
      transform 0.16s ease,
      background 0.16s ease,
      opacity 0.16s ease;
  }

  button:hover:not(:disabled),
  button:focus-visible:not(:disabled) {
    background: rgba(59, 130, 246, 0.34);
    transform: translateY(-1px);
    outline: none;
  }

  .ghost {
    background: rgba(148, 163, 184, 0.14);
    color: rgba(226, 232, 240, 0.9);
  }

  .ghost:hover:not(:disabled),
  .ghost:focus-visible:not(:disabled) {
    background: rgba(148, 163, 184, 0.24);
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

    .actions {
      justify-content: flex-start;
    }
  }
</style>
