<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let x = 0;
  export let y = 0;
  export let canAddToPlaylist = true;
  export let addToPlaylistHint = '';

  const dispatch = createEventDispatcher<{
    playSelected: void;
    addToQueue: void;
    addToPlaylist: void;
  }>();
</script>

<div class="context-menu" role="menu" aria-label="歌曲操作菜单" style={`top:${y}px;left:${x}px;`}>
  <button type="button" role="menuitem" on:click={() => dispatch('playSelected')}>播放选中</button>
  <button type="button" role="menuitem" on:click={() => dispatch('addToQueue')}>加入队列</button>
  <button
    type="button"
    role="menuitem"
    disabled={!canAddToPlaylist}
    title={canAddToPlaylist ? undefined : addToPlaylistHint}
    on:click={() => dispatch('addToPlaylist')}
  >
    加入歌单
  </button>
</div>

<style>
  .context-menu {
    position: fixed;
    z-index: 60;
    min-width: 180px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-radius: 14px;
    border: 1px solid rgba(96, 165, 250, 0.2);
    background: rgba(15, 23, 42, 0.96);
    box-shadow: 0 22px 40px rgba(2, 6, 23, 0.38);
  }

  button {
    border: none;
    border-radius: 10px;
    padding: 10px 12px;
    font: inherit;
    text-align: left;
    color: #e2e8f0;
    background: transparent;
    cursor: pointer;
    transition: background 0.16s ease;
  }

  button:hover:not(:disabled),
  button:focus-visible:not(:disabled) {
    background: rgba(59, 130, 246, 0.2);
    outline: none;
  }

  button:disabled {
    cursor: not-allowed;
    color: rgba(148, 163, 184, 0.6);
  }
</style>
