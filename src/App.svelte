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
  import type { AppSection, LibraryView } from "./lib/types";

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
    await invoke("greet", { name: "from svelte" });
    await getCurrentWindow().show();
  });
</script>

<div class="app-container">
  <TopBar bind:searchTerm={searchInput} on:searchTermChange={handleSearchTermChange} />

  <Sidebar
    {activeSection}
    {activeLibraryView}
    {activePlaylistId}
    on:navigate={handleSidebarNavigate}
    on:selectPlaylist={handleSelectPlaylist}
  />

  <main class="main-content">
    {#if route.name === "home"}
      <HomeView />
    {:else if route.name === "songs"}
      <SongsView searchTerm={searchInput} />
    {:else if route.name === "albums"}
      <AlbumsView on:openAlbum={handleOpenAlbum} />
    {:else if route.name === "albumDetail"}
      <AlbumDetailView albumId={route.id} />
    {:else if route.name === "artists"}
      <ArtistsView on:openArtist={handleOpenArtist} />
    {:else if route.name === "artistDetail"}
      <ArtistDetailView artistId={route.id} on:openAlbum={handleOpenAlbum} />
    {:else if route.name === "search"}
      <SearchResultsView searchTerm={searchInput} on:openAlbum={handleOpenAlbum} on:openArtist={handleOpenArtist} />
    {:else if route.name === "settings"}
      <SettingsView />
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
    background-color: #000;
    color: #fff;
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
    padding: 20px;
  }

  :global(.player-bar) {
    grid-area: player;
  }
</style>
