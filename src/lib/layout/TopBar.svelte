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

<header class="top-bar" data-surface="shell">
  <div class="left">
    <div class="brand" aria-label="My Music">
      <span class="brand-mark" aria-hidden="true">MM</span>
      <div class="titles">
        <span class="app-name">My Music</span>
        <span class="app-subtitle">Search, browse, and keep playback moving</span>
      </div>
    </div>

    <label class="search no-drag" data-variant="toolbar-search">
      <span class="search-icon" aria-hidden="true">⌕</span>
      <input
        type="text"
        placeholder="Search songs, albums, artists..."
        value={searchTerm}
        on:input={onSearchInput}
      />
      {#if searchTerm}
        <button class="clear" type="button" on:click={clearSearch} aria-label="Clear search">✕</button>
      {/if}
    </label>
  </div>
</header>

<style>
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1.5rem;
    height: 64px;
    background: color-mix(in srgb, var(--surface-shell) 94%, var(--surface-canvas));
    color: var(--text-primary);
    border-bottom: 1px solid var(--border-subtle);
    box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--text-on-accent) 4%, transparent);
    -webkit-app-region: drag;
  }

  .left {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    min-width: 0;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: default;
    min-width: 0;
  }

  .brand-mark {
    width: 32px;
    height: 32px;
    border-radius: 11px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: color-mix(in srgb, var(--accent) 88%, #ffffff 12%);
    color: var(--text-on-accent);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    box-shadow: var(--glow-accent);
  }

  .no-drag {
    -webkit-app-region: no-drag;
  }

  .titles {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
    min-width: 0;
  }

  .app-name {
    font-size: 0.96rem;
    font-weight: 600;
  }

  .app-subtitle {
    font-size: 0.75rem;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .search {
    position: relative;
    display: flex;
    align-items: center;
    min-width: 0;
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    background: var(--surface-panel-subtle);
    border: 1px solid var(--border-default);
    box-shadow: var(--shadow-soft);
  }

  .search:focus-within {
    border-color: color-mix(in srgb, var(--accent) 36%, var(--border-default));
    box-shadow: var(--focus-ring);
  }

  .search input {
    width: 260px;
    padding: 0.35rem 0.75rem 0.35rem 1.75rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.95rem;
  }

  .search input::placeholder {
    color: var(--text-tertiary);
  }

  .search input:focus {
    outline: none;
  }

  .search-icon {
    position: absolute;
    left: 0.75rem;
    font-size: 0.95rem;
    color: var(--text-tertiary);
  }

  .clear {
    border: none;
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    font-size: 1rem;
    padding: 0 0.25rem;
    line-height: 1;
    border-radius: 999px;
  }

  .clear:hover,
  .clear:focus-visible {
    color: var(--text-primary);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    outline: none;
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
