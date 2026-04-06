<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { AppSection, LibraryView, Playlist } from '../types';
  import { commonCopy, formatTrackCount, shellCopy } from '../copy/zh-cn';

  export let activeSection: AppSection = 'library';
  export let activeLibraryView: LibraryView = 'songs';
  export let playlists: Playlist[] = [];
  export let activePlaylistId: string | null = null;
  export let counts: { songs: number; albums: number; artists: number } = {
    songs: 0,
    albums: 0,
    artists: 0,
  };

  const dispatch = createEventDispatcher<{
    navigate: { section: AppSection; libraryView?: LibraryView };
    selectPlaylist: { id: string };
    createPlaylist: void;
  }>();

  function navigate(section: AppSection, libraryView?: LibraryView) {
    const detail: { section: AppSection; libraryView?: LibraryView } = { section };
    if (libraryView) {
      detail.libraryView = libraryView;
    }
    dispatch('navigate', detail);
  }

  function handlePlaylistClick(id: string) {
    dispatch('selectPlaylist', { id });
  }

  function handleCreatePlaylist() {
    dispatch('createPlaylist');
  }

  function isLibraryViewActive(view: LibraryView) {
    return activeSection === 'library' && activeLibraryView === view;
  }
</script>

<nav class="sidebar" data-sidebar-surface="shell" aria-label="应用导航">
  <div class="brand">
    <div class="brand-mark" aria-hidden="true">MM</div>
    <div class="brand-copy">
      <h1>{commonCopy.brandName}</h1>
      {#if shellCopy.brandSubtitle}
        <p>{shellCopy.brandSubtitle}</p>
      {/if}
    </div>
  </div>

  <section class="nav-section" data-sidebar-section="main">
    <h2>{shellCopy.sections.main}</h2>
    <button
      type="button"
      class="nav-button"
      class:active={activeSection === 'home'}
      aria-current={activeSection === 'home' ? 'page' : undefined}
      on:click={() => navigate('home')}
    >
      <span class="nav-label">{shellCopy.nav.home}</span>
    </button>
    <button
      type="button"
      class="nav-button"
      class:active={activeSection === 'library'}
      aria-current={activeSection === 'library' ? 'page' : undefined}
      on:click={() => navigate('library', activeLibraryView)}
    >
      <span class="nav-label">{shellCopy.nav.library}</span>
    </button>
    <button
      type="button"
      class="nav-button"
      class:active={activeSection === 'settings'}
      aria-current={activeSection === 'settings' ? 'page' : undefined}
      on:click={() => navigate('settings')}
    >
      <span class="nav-label">{shellCopy.nav.settings}</span>
    </button>
  </section>

  <section class="nav-section" data-sidebar-section="library">
    <h2>{shellCopy.sections.library}</h2>
    <button
      type="button"
      class="nav-button"
      class:active={isLibraryViewActive('songs')}
      aria-current={isLibraryViewActive('songs') ? 'page' : undefined}
      on:click={() => navigate('library', 'songs')}
    >
      <span class="nav-label">{shellCopy.nav.songs}</span>
      <span class="meta">{counts.songs}</span>
    </button>
    <button
      type="button"
      class="nav-button"
      class:active={isLibraryViewActive('albums')}
      aria-current={isLibraryViewActive('albums') ? 'page' : undefined}
      on:click={() => navigate('library', 'albums')}
    >
      <span class="nav-label">{shellCopy.nav.albums}</span>
      <span class="meta">{counts.albums}</span>
    </button>
    <button
      type="button"
      class="nav-button"
      class:active={isLibraryViewActive('artists')}
      aria-current={isLibraryViewActive('artists') ? 'page' : undefined}
      on:click={() => navigate('library', 'artists')}
    >
      <span class="nav-label">{shellCopy.nav.artists}</span>
      <span class="meta">{counts.artists}</span>
    </button>
  </section>

  <section class="nav-section playlists" data-sidebar-section="playlists">
    <div class="section-header">
      <h2>{shellCopy.sections.playlists}</h2>
      <button type="button" class="create" on:click={handleCreatePlaylist} aria-label="创建播放列表">＋</button>
    </div>

    {#if playlists.length === 0}
      <p class="empty">{shellCopy.emptyPlaylists}</p>
    {:else}
      <ul>
        {#each playlists as playlist}
          <li>
            <button
              type="button"
              class="playlist-row"
              class:active={activeLibraryView === 'playlistDetail' && playlist.id === activePlaylistId}
              aria-current={
                activeLibraryView === 'playlistDetail' && playlist.id === activePlaylistId ? 'page' : undefined
              }
              on:click={() => handlePlaylistClick(playlist.id)}
            >
              <div class="playlist-meta">
                <span class="name">{playlist.name}</span>
                <span class="count">{formatTrackCount(playlist.track_ids.length)}</span>
              </div>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</nav>

<style>
  .sidebar {
    width: 260px;
    padding: 24px 18px 20px;
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--surface-shell) 96%, var(--surface-canvas)),
        color-mix(in srgb, var(--surface-shell) 82%, var(--surface-canvas))
      );
    color: var(--text-primary);
    display: flex;
    flex-direction: column;
    gap: 22px;
    border-right: 1px solid var(--border-subtle);
    box-shadow: inset -1px 0 0 color-mix(in srgb, var(--text-on-accent) 4%, transparent);
  }

  .brand {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 0 6px 18px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .brand-mark {
    width: 42px;
    height: 42px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--text-on-accent);
    background:
      linear-gradient(160deg, color-mix(in srgb, var(--accent) 88%, #ffffff 12%), var(--accent)),
      var(--accent);
    box-shadow: var(--glow-accent);
  }

  .brand-copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .brand h1 {
    margin: 0;
    font-size: 1rem;
    color: var(--text-primary);
  }

  .brand p {
    margin: 0;
    font-size: 0.76rem;
    color: var(--text-secondary);
  }

  .nav-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .nav-section h2 {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-tertiary);
    margin: 0 0 4px 10px;
  }

  .nav-button,
  .playlist-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 14px;
    border: 1px solid transparent;
    border-radius: 14px;
    background: transparent;
    color: inherit;
    font-size: 0.95rem;
    cursor: pointer;
    text-align: left;
    transition:
      background 0.2s ease,
      color 0.2s ease,
      border-color 0.2s ease,
      box-shadow 0.2s ease,
      transform 0.16s ease;
  }

  .nav-label,
  .playlist-meta {
    min-width: 0;
  }

  .nav-label {
    color: var(--text-primary);
  }

  .meta {
    margin-left: auto;
    min-width: 1.75rem;
    text-align: right;
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  .nav-button:hover,
  .playlist-row:hover {
    background: var(--surface-panel-subtle);
    border-color: color-mix(in srgb, var(--border-default) 82%, transparent);
    box-shadow: var(--shadow-soft);
    transform: translateY(-1px);
  }

  .nav-button.active,
  .playlist-row.active {
    background: var(--state-selected);
    border-color: color-mix(in srgb, var(--accent) 34%, var(--border-default));
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, var(--text-on-accent) 8%, transparent),
      var(--shadow-soft);
  }

  .playlists {
    flex: 1;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-right: 4px;
  }

  .section-header h2 {
    margin: 0;
  }

  .create {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border-default));
    border-radius: 999px;
    background: var(--surface-panel-subtle);
    color: var(--accent);
    font-size: 1.2rem;
    line-height: 1;
    cursor: pointer;
    transition:
      background 0.2s ease,
      color 0.2s ease,
      border-color 0.2s ease,
      box-shadow 0.2s ease,
      transform 0.16s ease;
  }

  .create:hover,
  .create:focus-visible {
    background: var(--state-selected);
    border-color: color-mix(in srgb, var(--accent) 34%, var(--border-default));
    box-shadow: var(--glow-accent);
    outline: none;
    transform: translateY(-1px);
  }

  .empty {
    margin: 10px 6px 0;
    padding: 12px 14px;
    border-radius: 14px;
    background: var(--surface-panel-subtle);
    border: 1px solid var(--border-subtle);
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  ul {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .playlist-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .name {
    font-size: 0.95rem;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .count {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }
</style>
