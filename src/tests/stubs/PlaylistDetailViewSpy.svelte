<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let playlistId: string | null = null;

  const dispatch = createEventDispatcher<{
    refreshPlaylists: void;
  }>();
</script>

<button
  data-testid="playlist-detail-view-spy"
  on:click={() => dispatch('refreshPlaylists')}
>
  playlist-detail:{playlistId}
</button>
