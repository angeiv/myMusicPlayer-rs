<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  // Two-way bound from parent via `<TopBar bind:searchTerm />`
  export let searchTerm = '';

  function onSearchInput(event: Event) {
    const target = event.target as HTMLInputElement;
    searchTerm = target.value;
    dispatch('searchTermChange');
  }

  function clearSearch() {
    // Updating bound prop updates parent directly; no custom event needed
    searchTerm = '';
    dispatch('searchTermChange');
  }
</script>

<header class="top-bar">
  <div class="left">
    <div class="brand">
      <span class="logo">🎧</span>
      <div class="titles">
        <span class="app-name">myMusicPlayer-rs</span>
        <span class="app-subtitle">Rust desktop music player</span>
      </div>
    </div>

    <div class="search no-drag">
      <span class="search-icon">🔍</span>
      <input
        type="text"
        placeholder="Search songs, albums, artists..."
        value={searchTerm}
        on:input={onSearchInput}
      />
      {#if searchTerm}
        <button class="clear" on:click={clearSearch} aria-label="Clear search">✕</button>
      {/if}
    </div>
  </div>
</header>

<style>
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1.5rem;
    height: 64px;
    background: linear-gradient(90deg, #1a1f2e, #252b3d);
    color: #f1f5f9;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    -webkit-app-region: drag;
  }

  .left {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: default;
  }

  .no-drag {
    -webkit-app-region: no-drag;
  }

  .logo {
    font-size: 1.75rem;
  }

  .titles {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }

  .app-name {
    font-size: 1rem;
    font-weight: 600;
  }

  .app-subtitle {
    font-size: 0.75rem;
    color: rgba(241, 245, 249, 0.7);
  }

  .search {
    position: relative;
    display: flex;
    align-items: center;
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.65);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(148, 163, 184, 0.3);
  }

  .search input {
    width: 240px;
    padding: 0.35rem 0.75rem 0.35rem 1.75rem;
    border: none;
    background: transparent;
    color: #f1f5f9;
    font-size: 0.95rem;
  }

  .search input:focus {
    outline: none;
  }

  .search-icon {
    position: absolute;
    left: 0.75rem;
    font-size: 0.9rem;
    opacity: 0.7;
  }

  .clear {
    border: none;
    background: transparent;
    color: rgba(241, 245, 249, 0.7);
    cursor: pointer;
    font-size: 1rem;
    padding: 0 0.25rem;
    line-height: 1;
  }

  .clear:hover {
    color: #f8fafc;
  }

  

  @media (max-width: 980px) {
    .app-subtitle {
      display: none;
    }

    .search input {
      width: 180px;
    }
  }
</style>
