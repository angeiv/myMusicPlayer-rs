<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { AppSection, LibraryView, Playlist } from '../types';

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

<nav class="sidebar">
  <div class="brand">
    <div class="logo">🎶</div>
    <div>
      <h1>My Music</h1>
      <p>Listen differently.</p>
    </div>
  </div>

  <section class="nav-section">
    <h2>Main</h2>
    <button
      class:active={activeSection === 'home'}
      on:click={() => navigate('home')}
    >
      <span>🏠</span>
      <span>Home</span>
    </button>
    <button
      class:active={activeSection === 'library'}
      on:click={() => navigate('library', activeLibraryView)}
    >
      <span>🎼</span>
      <span>Library</span>
    </button>
    <button
      class:active={activeSection === 'settings'}
      on:click={() => navigate('settings')}
    >
      <span>⚙️</span>
      <span>Settings</span>
    </button>
  </section>

  <section class="nav-section">
    <h2>Library</h2>
    <button
      class:active={isLibraryViewActive('songs')}
      on:click={() => navigate('library', 'songs')}
    >
      <span>🎵</span>
      <span>Songs</span>
      <span class="meta">{counts.songs}</span>
    </button>
    <button
      class:active={isLibraryViewActive('albums')}
      on:click={() => navigate('library', 'albums')}
    >
      <span>💿</span>
      <span>Albums</span>
      <span class="meta">{counts.albums}</span>
    </button>
    <button
      class:active={isLibraryViewActive('artists')}
      on:click={() => navigate('library', 'artists')}
    >
      <span>👤</span>
      <span>Artists</span>
      <span class="meta">{counts.artists}</span>
    </button>
  </section>

  <section class="nav-section playlists">
    <div class="section-header">
      <h2>Playlists</h2>
      <button class="create" on:click={handleCreatePlaylist}>＋</button>
    </div>

    {#if playlists.length === 0}
      <p class="empty">No playlists yet. Create one to get started.</p>
    {:else}
      <ul>
        {#each playlists as playlist}
          <li>
            <button
              class:active={activeLibraryView === 'playlistDetail' && playlist.id === activePlaylistId}
              on:click={() => handlePlaylistClick(playlist.id)}
            >
              <span class="emoji">🎧</span>
              <div class="playlist-meta">
                <span class="name">{playlist.name}</span>
                <span class="count">{playlist.track_ids.length} tracks</span>
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
    padding: 24px 20px;
    background: #101522;
    color: #cbd5f5;
    display: flex;
    flex-direction: column;
    gap: 24px;
    border-right: 1px solid rgba(148, 163, 184, 0.12);
  }

  .brand {
    display: flex;
    gap: 12px;
    align-items: center;
    padding-bottom: 18px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  }

  .logo {
    font-size: 2rem;
  }

  .brand h1 {
    margin: 0;
    font-size: 1.1rem;
    color: #f8fafc;
  }

  .brand p {
    margin: 0;
    font-size: 0.75rem;
    color: rgba(226, 232, 240, 0.6);
  }

  .nav-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .nav-section h2 {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(148, 163, 184, 0.7);
    margin: 0 0 4px 12px;
  }

  .nav-section button {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border: none;
    border-radius: 12px;
    background: transparent;
    color: inherit;
    font-size: 0.95rem;
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease;
  }

  .nav-section button span:first-child {
    width: 22px;
    text-align: center;
  }

  .nav-section button .meta {
    margin-left: auto;
    font-size: 0.75rem;
    color: rgba(148, 163, 184, 0.7);
  }

  .nav-section button:hover {
    background: rgba(59, 130, 246, 0.12);
    color: #f8fafc;
  }

  .nav-section button.active {
    background: rgba(59, 130, 246, 0.18);
    color: #ffffff;
  }

  .playlists {
    flex: 1;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .section-header h2 {
    margin: 0;
  }

  .create {
    border: none;
    background: rgba(59, 130, 246, 0.18);
    color: #93c5fd;
    border-radius: 8px;
    width: 28px;
    height: 28px;
    font-size: 1.1rem;
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease;
  }

  .create:hover {
    background: rgba(59, 130, 246, 0.3);
    color: #bfdbfe;
  }

  .empty {
    margin: 12px 0 0 0;
    font-size: 0.85rem;
    color: rgba(148, 163, 184, 0.7);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
  }

  li button {
    width: 100%;
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 10px 12px;
    border-radius: 12px;
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    transition: background 0.2s ease;
    text-align: left;
  }

  li button:hover {
    background: rgba(59, 130, 246, 0.12);
  }

  li button.active {
    background: rgba(59, 130, 246, 0.2);
  }

  .emoji {
    font-size: 1.2rem;
  }

  .playlist-meta {
    display: flex;
    flex-direction: column;
  }

  .name {
    font-size: 0.95rem;
    color: #f8fafc;
  }

  .count {
    font-size: 0.75rem;
    color: rgba(148, 163, 184, 0.7);
  }
</style>
