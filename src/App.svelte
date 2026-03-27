<script lang="ts">
  import { onMount } from 'svelte';

  import Sidebar from './lib/layout/Sidebar.svelte';
  import TopBar from './lib/layout/TopBar.svelte';
  import BottomPlayerBar from './lib/player/BottomPlayerBar.svelte';
  import HomeView from './lib/views/HomeView.svelte';
  import SongsView from './lib/views/SongsView.svelte';
  import AlbumsView from './lib/views/AlbumsView.svelte';
  import AlbumDetailView from './lib/views/AlbumDetailView.svelte';
  import ArtistsView from './lib/views/ArtistsView.svelte';
  import ArtistDetailView from './lib/views/ArtistDetailView.svelte';
  import SearchResultsView from './lib/views/SearchResultsView.svelte';
  import SettingsView from './lib/views/SettingsView.svelte';
  import PlaylistDetailView from './lib/views/PlaylistDetailView.svelte';
  import {
    deriveAppShellRouteState,
    handleOpenAlbumNavigation,
    handleOpenArtistNavigation,
    handleSelectPlaylistNavigation,
    handleSidebarNavigation,
    syncSearchToRoute,
    type SidebarNavigateDetail,
  } from './lib/features/app-shell/navigation';
  import { createAppShellStore } from './lib/features/app-shell/store';
  import { matchRoute, normalizeRoutePath, type RouteMatch } from './lib/routing/routes';
  import { hashPath } from './lib/stores/router';
  import type { AppSection, LibraryView } from './lib/types';

  const appShell = createAppShellStore();
  const {
    tracks,
    albums,
    artists,
    playlists,
    counts,
    isLibraryLoading,
    isSearching,
    searchResults,
    bootstrap,
    loadLibrary,
    loadPlaylists,
    syncRouteSearch,
    createPlaylistFromPrompt,
  } = appShell;

  let route: RouteMatch = { name: 'home' };
  let activeSection: AppSection = 'home';
  let activeLibraryView: LibraryView = 'songs';
  let activePlaylistId: string | null = null;
  let searchInput = '';
  let currentPath = '/';

  $: currentPath = normalizeRoutePath($hashPath);
  $: route = matchRoute(currentPath);
  $: routeState = deriveAppShellRouteState(route);
  $: activeSection = routeState.activeSection;
  $: activeLibraryView = routeState.activeLibraryView;
  $: activePlaylistId = routeState.activePlaylistId;
  $: {
    if (searchInput !== routeState.searchTerm) {
      searchInput = routeState.searchTerm;
    }
  }
  $: void syncRouteSearch(route);

  function handleSearchTermChange() {
    syncSearchToRoute(searchInput, currentPath);
  }

  function handleSidebarNavigate(event: CustomEvent<SidebarNavigateDetail>) {
    handleSidebarNavigation(event.detail, activePlaylistId);
  }

  function handleSelectPlaylist(event: CustomEvent<{ id: string }>) {
    handleSelectPlaylistNavigation(event.detail.id);
  }

  function handleOpenAlbum(event: CustomEvent<{ id: string }>) {
    handleOpenAlbumNavigation(event.detail.id);
  }

  function handleOpenArtist(event: CustomEvent<{ id: string }>) {
    handleOpenArtistNavigation(event.detail.id);
  }

  onMount(() => {
    void bootstrap();
  });
</script>

<div class="app-container">
  <TopBar bind:searchTerm={searchInput} on:searchTermChange={handleSearchTermChange} />

  <Sidebar
    {activeSection}
    {activeLibraryView}
    {activePlaylistId}
    playlists={$playlists}
    counts={$counts}
    on:navigate={handleSidebarNavigate}
    on:selectPlaylist={handleSelectPlaylist}
    on:createPlaylist={createPlaylistFromPrompt}
  />

  <main class="main-content">
    {#if route.name === "home"}
      <HomeView tracks={$tracks} albums={$albums} artists={$artists} playlists={$playlists} />
    {:else if route.name === "songs"}
      <SongsView
        tracks={$tracks}
        playlists={$playlists}
        refreshPlaylists={loadPlaylists}
        isLibraryLoading={$isLibraryLoading}
        searchTerm={searchInput}
      />
    {:else if route.name === "albums"}
      <AlbumsView albums={$albums} isLibraryLoading={$isLibraryLoading} on:openAlbum={handleOpenAlbum} />
    {:else if route.name === "albumDetail"}
      <AlbumDetailView albumId={route.id} />
    {:else if route.name === "artists"}
      <ArtistsView artists={$artists} isLibraryLoading={$isLibraryLoading} on:openArtist={handleOpenArtist} />
    {:else if route.name === "artistDetail"}
      <ArtistDetailView artistId={route.id} on:openAlbum={handleOpenAlbum} />
    {:else if route.name === "search"}
      <SearchResultsView
        searchTerm={searchInput}
        searchResults={$searchResults}
        isSearching={$isSearching}
        on:openAlbum={handleOpenAlbum}
        on:openArtist={handleOpenArtist}
      />
    {:else if route.name === "settings"}
      <SettingsView on:refreshLibrary={loadLibrary} on:refreshPlaylists={loadPlaylists} />
    {:else if route.name === "playlistDetail"}
      <PlaylistDetailView playlistId={route.id} on:refreshPlaylists={loadPlaylists} />
    {/if}
  </main>

  <BottomPlayerBar />
</div>

<style>
  .app-container {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    grid-template-rows: 64px minmax(0, 1fr) auto;
    grid-template-areas:
      "sidebar topbar"
      "sidebar main"
      "player player";
    height: 100dvh;
    background-color: var(--app-bg);
    color: var(--app-fg);
  }

  :global(header.top-bar) {
    grid-area: topbar;
  }

  :global(nav.sidebar) {
    grid-area: sidebar;
  }

  .main-content {
    grid-area: main;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    padding: 20px;
  }

  :global(.player-bar) {
    grid-area: player;
  }
</style>
