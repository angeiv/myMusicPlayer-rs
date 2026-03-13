<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { getCurrentWindow } from "@tauri-apps/api/window";

  import Sidebar from "./lib/layout/Sidebar.svelte";
  import TopBar from "./lib/layout/TopBar.svelte";
  import BottomPlayerBar from "./lib/player/BottomPlayerBar.svelte";
  import HomeView from "./lib/views/HomeView.svelte";
  import SongsView from "./lib/views/SongsView.svelte";
  import AlbumsView from "./lib/views/AlbumsView.svelte";
  import AlbumDetailView from "./lib/views/AlbumDetailView.svelte";
  import ArtistsView from "./lib/views/ArtistsView.svelte";
  import ArtistDetailView from "./lib/views/ArtistDetailView.svelte";
  import SearchResultsView from "./lib/views/SearchResultsView.svelte";
  import SettingsView from "./lib/views/SettingsView.svelte";
  import PlaylistDetailView from "./lib/views/PlaylistDetailView.svelte";
  import { hashPath, navigate, normalizeHashPath } from "./lib/stores/router";
  import type { AppSection, LibraryView, Playlist, SearchResults, Track, Album, Artist, AppConfig, ThemeOption } from "./lib/types";
  import { isTauri } from "./lib/utils/env";
  import {
    addMockPlaylist,
    getMockLibraryOverview,
    getMockPlaylists,
    searchMockLibrary,
  } from "./lib/mocks/library";

  type RouteMatch =
    | { name: "home" }
    | { name: "songs" }
    | { name: "albums" }
    | { name: "albumDetail"; id: string }
    | { name: "artists" }
    | { name: "artistDetail"; id: string }
    | { name: "search"; query: string }
    | { name: "settings" }
    | { name: "playlistDetail"; id: string };

  let route: RouteMatch = { name: "home" };
  let activeSection: AppSection = "home";
  let activeLibraryView: LibraryView = "songs";
  let activePlaylistId: string | null = null;
  let searchInput = "";
  let currentPath = "/";

  let tracks: Track[] = [];
  let albums: Album[] = [];
  let artists: Artist[] = [];
  let playlists: Playlist[] = [];

  let isLibraryLoading = false;
  let isSearching = false;
  let searchResults: SearchResults | null = null;

  function normalizeTheme(raw: unknown): ThemeOption {
    if (raw === 'light' || raw === 'dark' || raw === 'system') {
      return raw;
    }
    return 'system';
  }

  function applyTheme(theme: ThemeOption) {
    const root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }

  async function loadAndApplyConfig() {
    if (!isTauri) {
      return;
    }

    try {
      const config = await invoke<AppConfig>('get_config');
      applyTheme(normalizeTheme(config?.theme));

      const deviceId = typeof config?.output_device_id === 'string' ? config.output_device_id : null;
      if (deviceId) {
        try {
          await invoke('set_output_device', { deviceId });
        } catch (error) {
          console.warn('Failed to restore output device:', error);
        }
      }

      if (typeof config?.default_volume === 'number') {
        try {
          await invoke('set_volume', { volume: config.default_volume });
        } catch (error) {
          console.warn('Failed to restore default volume:', error);
        }
      }

      if (config?.auto_scan && Array.isArray(config?.library_paths) && config.library_paths.length > 0) {
        isLibraryLoading = true;
        for (const path of config.library_paths) {
          try {
            await invoke('scan_directory', { path });
          } catch (error) {
            console.warn('Auto-scan failed for path:', path, error);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load config:', error);
    } finally {
      isLibraryLoading = false;
    }
  }

  $: counts = {
    songs: tracks.length,
    albums: albums.length,
    artists: artists.length,
  };

  $: currentPath = normalizeHashPath($hashPath);
  $: route = matchRoute(currentPath);
  $:
    activeSection =
      route.name === "home"
        ? "home"
        : route.name === "settings"
        ? "settings"
        : "library";
  $:
    activeLibraryView =
      route.name === "songs"
        ? "songs"
        : route.name === "albums"
        ? "albums"
        : route.name === "artists"
        ? "artists"
        : route.name === "albumDetail"
        ? "albumDetail"
        : route.name === "artistDetail"
        ? "artistDetail"
        : route.name === "playlistDetail"
        ? "playlistDetail"
        : "songs";
  $: activePlaylistId = route.name === "playlistDetail" ? route.id : null;
  $: {
    if (route.name === "search") {
      if (searchInput !== route.query) {
        searchInput = route.query;
      }
    } else if (searchInput !== "") {
      searchInput = "";
    }
  }

  function matchRoute(path: string): RouteMatch {
    if (path === "/" || path === "") {
      return { name: "home" };
    }

    if (path === "/songs") {
      return { name: "songs" };
    }

    if (path === "/albums") {
      return { name: "albums" };
    }

    if (path === "/artists") {
      return { name: "artists" };
    }

    if (path === "/settings") {
      return { name: "settings" };
    }

    const albumMatch = path.match(/^\/albums\/([^/]+)$/);
    if (albumMatch && albumMatch[1]) {
      return { name: "albumDetail", id: decodeURIComponent(albumMatch[1]) };
    }

    const artistMatch = path.match(/^\/artists\/([^/]+)$/);
    if (artistMatch && artistMatch[1]) {
      return { name: "artistDetail", id: decodeURIComponent(artistMatch[1]) };
    }

    const playlistMatch = path.match(/^\/playlists\/([^/]+)$/);
    if (playlistMatch && playlistMatch[1]) {
      return { name: "playlistDetail", id: decodeURIComponent(playlistMatch[1]) };
    }

    const searchMatch = path.match(/^\/search(?:\/(.*))?$/);
    if (searchMatch) {
      return {
        name: "search",
        query: searchMatch[1] ? decodeURIComponent(searchMatch[1]) : "",
      };
    }

    return { name: "home" };
  }

  function syncSearchToRoute(term: string) {
    const trimmed = term.trim();
    const targetPath = trimmed ? `/search/${encodeURIComponent(trimmed)}` : "/";

    if (normalizeHashPath(targetPath) === currentPath) {
      return;
    }

    navigate(targetPath, { replace: true });
  }

  function handleSearchTermChange() {
    syncSearchToRoute(searchInput);
  }

  function handleSidebarNavigate(event: CustomEvent<{ section: AppSection; libraryView?: LibraryView }>) {
    const { section, libraryView } = event.detail;

    if (section === "home") {
      navigate("/");
      return;
    }

    if (section === "settings") {
      navigate("/settings");
      return;
    }

    const view = libraryView ?? "songs";
    switch (view) {
      case "albums":
        navigate("/albums");
        break;
      case "artists":
        navigate("/artists");
        break;
      case "playlistDetail":
        if (activePlaylistId) {
          navigate(`/playlists/${encodeURIComponent(activePlaylistId)}`);
        } else {
          navigate("/songs");
        }
        break;
      case "albumDetail":
      case "artistDetail":
        navigate("/songs");
        break;
      default:
        navigate("/songs");
    }
  }

  function handleSelectPlaylist(event: CustomEvent<{ id: string }>) {
    const id = event.detail.id;
    if (!id) {
      return;
    }
    navigate(`/playlists/${encodeURIComponent(id)}`);
  }

  function handleOpenAlbum(event: CustomEvent<{ id: string }>) {
    const id = event.detail.id;
    if (!id) {
      return;
    }
    navigate(`/albums/${encodeURIComponent(id)}`);
  }

  function handleOpenArtist(event: CustomEvent<{ id: string }>) {
    const id = event.detail.id;
    if (!id) {
      return;
    }
    navigate(`/artists/${encodeURIComponent(id)}`);
  }

  onMount(async () => {
    if (isTauri) {
      await invoke("greet", { name: "from svelte" });
      await getCurrentWindow().show();
    }

    await loadAndApplyConfig();

    await Promise.all([loadLibrary(), loadPlaylists()]);
  });

  function normalizeSearchResults(raw: unknown): SearchResults {
    if (Array.isArray(raw) && raw.length === 3) {
      const [t, a, r] = raw as [Track[], Album[], Artist[]];
      return { tracks: t ?? [], albums: a ?? [], artists: r ?? [] };
    }

    if (raw && typeof raw === 'object') {
      const data = raw as Partial<SearchResults>;
      return {
        tracks: data.tracks ?? [],
        albums: data.albums ?? [],
        artists: data.artists ?? [],
      };
    }

    return { tracks: [], albums: [], artists: [] };
  }

  async function loadLibrary() {
    isLibraryLoading = true;
    try {
      if (!isTauri) {
        const overview = getMockLibraryOverview();
        tracks = overview.tracks;
        albums = overview.albums;
        artists = overview.artists;
        return;
      }

      const [t, a, r] = await Promise.all([
        invoke<Track[]>("get_tracks"),
        invoke<Album[]>("get_albums"),
        invoke<Artist[]>("get_artists"),
      ]);
      tracks = t ?? [];
      albums = a ?? [];
      artists = r ?? [];
    } catch (error) {
      console.error('Failed to load library:', error);
      tracks = [];
      albums = [];
      artists = [];
    } finally {
      isLibraryLoading = false;
    }
  }

  async function loadPlaylists() {
    try {
      if (!isTauri) {
        playlists = getMockPlaylists();
        return;
      }
      playlists = (await invoke<Playlist[]>("get_playlists")) ?? [];
    } catch (error) {
      console.error('Failed to load playlists:', error);
      playlists = [];
    }
  }

  async function runSearch(term: string) {
    const trimmed = term.trim();
    if (!trimmed) {
      searchResults = null;
      isSearching = false;
      return;
    }

    isSearching = true;
    try {
      if (!isTauri) {
        searchResults = searchMockLibrary(trimmed);
        return;
      }

      const raw = await invoke<unknown>("search", { query: trimmed });
      searchResults = normalizeSearchResults(raw);
    } catch (error) {
      console.error('Search failed:', error);
      searchResults = { tracks: [], albums: [], artists: [] };
    } finally {
      isSearching = false;
    }
  }

  $: if (route.name === 'search') {
    runSearch(searchInput);
  } else if (searchResults) {
    searchResults = null;
    isSearching = false;
  }

  async function handleCreatePlaylist() {
    if (!isTauri) {
      addMockPlaylist('New playlist');
      playlists = getMockPlaylists();
      return;
    }

    try {
      const name = window.prompt('Playlist name', 'New playlist');
      const trimmed = name?.trim();
      if (!trimmed) return;
      await invoke('create_playlist', { name: trimmed });
      await loadPlaylists();
    } catch (error) {
      console.error('Failed to create playlist:', error);
      alert('Failed to create playlist.');
    }
  }
</script>

<div class="app-container">
  <TopBar bind:searchTerm={searchInput} on:searchTermChange={handleSearchTermChange} />

  <Sidebar
    {activeSection}
    {activeLibraryView}
    {activePlaylistId}
    {playlists}
    {counts}
    on:navigate={handleSidebarNavigate}
    on:selectPlaylist={handleSelectPlaylist}
    on:createPlaylist={handleCreatePlaylist}
  />

  <main class="main-content">
    {#if route.name === "home"}
      <HomeView {tracks} {albums} {artists} {playlists} />
    {:else if route.name === "songs"}
      <SongsView {tracks} {isLibraryLoading} searchTerm={searchInput} />
    {:else if route.name === "albums"}
      <AlbumsView {albums} {isLibraryLoading} on:openAlbum={handleOpenAlbum} />
    {:else if route.name === "albumDetail"}
      <AlbumDetailView albumId={route.id} />
    {:else if route.name === "artists"}
      <ArtistsView {artists} {isLibraryLoading} on:openArtist={handleOpenArtist} />
    {:else if route.name === "artistDetail"}
      <ArtistDetailView artistId={route.id} on:openAlbum={handleOpenAlbum} />
    {:else if route.name === "search"}
      <SearchResultsView
        searchTerm={searchInput}
        {searchResults}
        {isSearching}
        on:openAlbum={handleOpenAlbum}
        on:openArtist={handleOpenArtist}
      />
    {:else if route.name === "settings"}
      <SettingsView on:refreshLibrary={loadLibrary} on:refreshPlaylists={loadPlaylists} />
    {:else if route.name === "playlistDetail"}
      <PlaylistDetailView playlistId={route.id} />
    {/if}
  </main>

  <BottomPlayerBar />
</div>

<style>
  .app-container {
    display: grid;
    grid-template-columns: 250px 1fr;
    grid-template-rows: 60px 1fr auto;
    grid-template-areas:
      "sidebar topbar"
      "sidebar main"
      "player player";
    height: 100vh;
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
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 20px;
  }

  :global(.player-bar) {
    grid-area: player;
  }
</style>
