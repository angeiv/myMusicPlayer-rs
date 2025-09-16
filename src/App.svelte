<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrent } from '@tauri-apps/api/window';
  import Player from "./lib/components/Player.svelte";
  import Library from "./lib/components/Library.svelte";

  // App state
  let currentView = 'player'; // 'player', 'library', 'playlists'

  onMount(() => {
    // Set initial window title
    getCurrent().setTitle('Music Player - Rust Edition');
  });
</script>

<main class="app">
  <nav class="sidebar">
    <div class="app-title">
      <h1>🎵 Music Player</h1>
    </div>

    <div class="nav-menu">
      <button
        class="nav-item"
        class:active={currentView === 'player'}
        on:click={() => currentView = 'player'}
      >
        🎵 Player
      </button>

      <button
        class="nav-item"
        class:active={currentView === 'library'}
        on:click={() => currentView = 'library'}
      >
        📚 Library
      </button>

      <button
        class="nav-item"
        class:active={currentView === 'playlists'}
        on:click={() => currentView = 'playlists'}
      >
        📝 Playlists
      </button>
    </div>
  </nav>

  <main class="content">
    {#if currentView === 'player'}
      <Player />
    {:else if currentView === 'library'}
      <Library />
    {:else if currentView === 'playlists'}
      <div class="coming-soon">
        <h2>Playlists</h2>
        <p>Playlist management coming soon...</p>
      </div>
    {/if}
  </main>
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell,
      'Open Sans', 'Helvetica Neue', sans-serif;
    background: #f8f9fa;
  }

  .app {
    display: flex;
    height: 100vh;
    overflow: hidden;
  }

  .sidebar {
    width: 250px;
    background: #343a40;
    color: white;
    padding: 20px;
    box-shadow: 2px 0 4px rgba(0, 0, 0, 0.1);
  }

  .app-title {
    margin-bottom: 30px;
    text-align: center;
  }

  .app-title h1 {
    margin: 0;
    font-size: 1.5em;
    color: #fff;
  }

  .nav-menu {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .nav-item {
    padding: 12px 16px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: #adb5bd;
    cursor: pointer;
    font-size: 14px;
    text-align: left;
    transition: all 0.2s;
  }

  .nav-item:hover {
    background: #495057;
    color: white;
  }

  .nav-item.active {
    background: #007bff;
    color: white;
  }

  .content {
    flex: 1;
    overflow-y: auto;
    background: #f8f9fa;
  }

  .coming-soon {
    padding: 40px;
    text-align: center;
    color: #666;
  }

  .coming-soon h2 {
    margin: 0 0 20px 0;
    color: #333;
  }
</style>
