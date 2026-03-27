<script lang="ts">
  import type { Playlist, Track } from '../../lib/types';

  export let tracks: Track[] = [];
  export let playlists: Playlist[] = [];
  export let refreshPlaylists: () => Promise<void> = async () => {};
  export let isLibraryLoading = false;
  export let searchTerm = '';

  type SongsViewSpyProps = {
    tracks: Track[];
    playlists: Playlist[];
    refreshPlaylists: () => Promise<void>;
    isLibraryLoading: boolean;
    searchTerm: string;
  };

  type SongsViewSpyWindow = Window & {
    __songsViewSpyProps?: SongsViewSpyProps;
  };

  $: if (typeof window !== 'undefined') {
    const spyWindow = window as SongsViewSpyWindow;

    spyWindow.__songsViewSpyProps = {
      tracks,
      playlists,
      refreshPlaylists,
      isLibraryLoading,
      searchTerm,
    };
  }
</script>

<div data-testid="songs-view-spy">SongsView spy</div>
