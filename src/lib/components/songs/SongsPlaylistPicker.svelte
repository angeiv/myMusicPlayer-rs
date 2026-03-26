<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  import type { Playlist } from '../../types';

  export let playlists: Playlist[] = [];
  export let anchor: DOMRect | null = null;

  const dispatch = createEventDispatcher<{
    selectPlaylist: { playlistId: string };
    close: void;
  }>();

  $: top = anchor === null ? 0 : anchor.bottom + 8;
  $: left = anchor === null ? 0 : anchor.left;
</script>

{#if anchor !== null}
  <div
    class="playlist-picker"
    role="dialog"
    aria-label="选择歌单"
    aria-modal="false"
    style={`top:${top}px;left:${left}px;`}
  >
    <div class="header">
      <div>
        <p class="label">Add to playlist</p>
        <h3>选择歌单</h3>
      </div>
      <button type="button" class="close" aria-label="关闭歌单选择器" on:click={() => dispatch('close')}>
        ×
      </button>
    </div>

    {#if playlists.length === 0}
      <p class="empty">暂无可用歌单</p>
    {:else}
      <div class="playlist-list" role="list">
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
    border: 1px solid rgba(96, 165, 250, 0.22);
    background: rgba(15, 23, 42, 0.98);
    box-shadow: 0 24px 48px rgba(2, 6, 23, 0.4);
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
    color: rgba(191, 219, 254, 0.72);
  }

  h3 {
    margin: 0;
    font-size: 1rem;
    color: #eff6ff;
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
    color: rgba(226, 232, 240, 0.85);
    background: rgba(148, 163, 184, 0.12);
    cursor: pointer;
  }

  .close:hover,
  .close:focus-visible {
    background: rgba(148, 163, 184, 0.22);
    outline: none;
  }

  .playlist-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .playlist-option {
    border: none;
    border-radius: 14px;
    padding: 12px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font: inherit;
    color: #e2e8f0;
    background: rgba(30, 41, 59, 0.72);
    cursor: pointer;
    transition:
      background 0.16s ease,
      transform 0.16s ease;
  }

  .playlist-option:hover,
  .playlist-option:focus-visible {
    background: rgba(59, 130, 246, 0.24);
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
    color: rgba(191, 219, 254, 0.72);
  }

  .empty {
    margin: 0;
    padding: 20px 12px;
    border-radius: 14px;
    background: rgba(30, 41, 59, 0.6);
    color: rgba(148, 163, 184, 0.8);
    text-align: center;
  }
</style>
