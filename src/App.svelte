<script lang="ts">
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { invoke } from '@tauri-apps/api/core';

  import TopBar from './lib/layout/TopBar.svelte';
  import Sidebar from './lib/layout/Sidebar.svelte';
  import BottomPlayerBar from './lib/player/BottomPlayerBar.svelte';

  import HomeView from './lib/views/HomeView.svelte';
  import SongsView from './lib/views/SongsView.svelte';
  import AlbumsView from './lib/views/AlbumsView.svelte';
  import ArtistsView from './lib/views/ArtistsView.svelte';
  import AlbumDetailView from './lib/views/AlbumDetailView.svelte';
  import ArtistDetailView from './lib/views/ArtistDetailView.svelte';
  import PlaylistDetailView from './lib/views/PlaylistDetailView.svelte';
  import SettingsView from './lib/views/SettingsView.svelte';
  import SearchResultsView from './lib/views/SearchResultsView.svelte';

  import type {
    Album,
    AppSection,
    Artist,
    LibraryView,
    Playlist,
    SearchResults,
    Track,
  } from './lib/types';

  let section: AppSection = 'library';
  let libraryView: LibraryView = 'songs';
  let searchTerm = '';
  let searchResults: SearchResults | null = null;
  let isSearching = false;
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  let tracks: Track[] = [];
  let albums: Album[] = [];
  let artists: Artist[] = [];
  let playlists: Playlist[] = [];

  let isLibraryLoading = true;

  let activeAlbumId: string | null = null;
  let activeArtistId: string | null = null;
  let activePlaylistId: string | null = null;

  onMount(async () => {
    await getCurrentWindow().setTitle('myMusicPlayer-rs');
    await Promise.all([loadLibrary(), loadPlaylists()]);
  });

  async function loadLibrary() {
    isLibraryLoading = true;
    try {
      const [loadedTracks, loadedAlbums, loadedArtists] = await Promise.all([
        invoke<Track[]>('get_tracks'),
        invoke<Album[]>('get_albums'),
        invoke<Artist[]>('get_artists'),
      ]);

      tracks = loadedTracks;
      albums = loadedAlbums;
      artists = loadedArtists;
    } catch (error) {
      console.error('Failed to load library data:', error);
    } finally {
      isLibraryLoading = false;
    }
  }

  async function loadPlaylists() {
    try {
      const loadedPlaylists = await invoke<Playlist[]>('get_playlists');
      playlists = loadedPlaylists;
    } catch (error) {
      console.error('Failed to load playlists:', error);
    }
  }

  function handleNavigation(event: CustomEvent<{ section: AppSection; libraryView?: LibraryView }>) {
    const detail = event.detail;

    section = detail.section;

    if (detail.libraryView) {
      libraryView = detail.libraryView;
    }

    if (detail.section !== 'library') {
      libraryView = 'songs';
      activeAlbumId = null;
      activeArtistId = null;
      activePlaylistId = null;
    }

    if (detail.libraryView && detail.libraryView !== 'playlistDetail') {
      activePlaylistId = null;
    }

    if (detail.libraryView && detail.libraryView !== 'albumDetail') {
      activeAlbumId = null;
    }

    if (detail.libraryView && detail.libraryView !== 'artistDetail') {
      activeArtistId = null;
    }
  }

  function handlePlaylistSelect(event: CustomEvent<{ id: string }>) {
    section = 'library';
    libraryView = 'playlistDetail';
    activePlaylistId = event.detail.id;
    activeAlbumId = null;
    activeArtistId = null;
    clearSearch();
  }

  async function handleCreatePlaylist() {
    const name = window.prompt('Playlist name');
    if (!name) return;

    try {
      await invoke<string>('create_playlist', { name });
      await loadPlaylists();
    } catch (error) {
      console.error('Failed to create playlist:', error);
      window.alert('Unable to create playlist. Please try again.');
    }
  }

  function handleSearch(event: CustomEvent<string>) {
    const term = event.detail;
    searchTerm = term;

    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    if (!term.trim()) {
      searchResults = null;
      isSearching = false;
      return;
    }

    isSearching = true;
    searchTimeout = setTimeout(() => performSearch(term), 250);
  }

  async function performSearch(query: string) {
    try {
      const [trackResults, albumResults, artistResults] = await invoke<[
        Track[],
        Album[],
        Artist[]
      ]>('search', { query });
      searchResults = {
        tracks: trackResults,
        albums: albumResults,
        artists: artistResults,
      };
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      isSearching = false;
    }
  }

  function clearSearch() {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
      searchTimeout = null;
    }
    searchTerm = '';
    searchResults = null;
    isSearching = false;
  }

  function openAlbum(event: CustomEvent<{ id: string }>) {
    if (!event.detail.id) return;
    activeAlbumId = event.detail.id;
    activeArtistId = null;
    activePlaylistId = null;
    section = 'library';
    libraryView = 'albumDetail';
    clearSearch();
  }

  function openArtist(event: CustomEvent<{ id: string }>) {
    if (!event.detail.id) return;
    activeArtistId = event.detail.id;
    activeAlbumId = null;
    activePlaylistId = null;
    section = 'library';
    libraryView = 'artistDetail';
    clearSearch();
  }
</script>

<div class="app-shell">
  <TopBar {searchTerm} on:search={handleSearch} />

  <div class="content">
    <Sidebar
      activeSection={section}
      activeLibraryView={libraryView}
      playlists={playlists}
      activePlaylistId={activePlaylistId}
      counts={{
        songs: tracks.length,
        albums: albums.length,
        artists: artists.length,
      }}
      on:navigate={handleNavigation}
      on:selectPlaylist={handlePlaylistSelect}
      on:createPlaylist={handleCreatePlaylist}
    />

    <main class="main" data-searching={isSearching}>
      {#if searchTerm.trim().length > 0}
        <SearchResultsView
          {searchTerm}
          {searchResults}
          {isSearching}
          on:openAlbum={openAlbum}
          on:openArtist={openArtist}
        />
      {:else if section === 'home'}
        <HomeView {tracks} {albums} {artists} {playlists} />
      {:else if section === 'settings'}
        <SettingsView on:refreshLibrary={loadLibrary} on:refreshPlaylists={loadPlaylists} />
      {:else}
        {#if libraryView === 'songs'}
          <SongsView {tracks} {isLibraryLoading} {searchTerm} />
        {:else if libraryView === 'albums'}
          <AlbumsView
            {albums}
            {isLibraryLoading}
            on:openAlbum={openAlbum}
          />
        {:else if libraryView === 'artists'}
          <ArtistsView
            {artists}
            {isLibraryLoading}
            on:openArtist={openArtist}
          />
        {:else if libraryView === 'albumDetail'}
          <AlbumDetailView albumId={activeAlbumId} />
        {:else if libraryView === 'artistDetail'}
          <ArtistDetailView artistId={activeArtistId} on:openAlbum={openAlbum} />
        {:else if libraryView === 'playlistDetail'}
          <PlaylistDetailView playlistId={activePlaylistId} />
        {/if}
      {/if}
    </main>
  </div>

  <BottomPlayerBar />
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0b1120;
    color: #e2e8f0;
    overflow: hidden;
  }

  :global([data-theme='light'] body) {
    background: #f1f5f9;
    color: #0f172a;
  }

  :global([data-theme='light'] .main) {
    background: linear-gradient(180deg, rgba(148, 163, 184, 0.12), rgba(226, 232, 240, 0.45));
  }

  .app-shell {
    height: 100vh;
    display: grid;
    grid-template-rows: auto 1fr auto;
    background: #0b1120;
  }

  .content {
    display: grid;
    grid-template-columns: 260px 1fr;
    overflow: hidden;
  }

  .main {
    background: radial-gradient(circle at top, rgba(30, 64, 175, 0.25), transparent 45%),
      #0f172a;
    overflow: hidden auto;
    position: relative;
  }

  .main[data-searching='true'] {
    opacity: 0.7;
  }

  @media (max-width: 960px) {
    .content {
      grid-template-columns: 220px 1fr;
    }
  }

  @media (max-width: 820px) {
    .content {
      grid-template-columns: 1fr;
    }

    .main {
      min-height: 0;
    }
  }
</style>
