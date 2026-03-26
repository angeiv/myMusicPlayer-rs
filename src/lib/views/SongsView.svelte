<script lang="ts">
  import { flushSync, onDestroy, onMount } from 'svelte';

  import { addToPlaylist } from '../api/playlist';
  import {
    addToQueue,
    getCurrentTrack,
    getPlaybackState,
    playTrack,
    setQueue,
  } from '../api/playback';
  import SongsBulkActionBar from '../components/songs/SongsBulkActionBar.svelte';
  import SongsContextMenu from '../components/songs/SongsContextMenu.svelte';
  import SongsPlaylistPicker from '../components/songs/SongsPlaylistPicker.svelte';
  import SongsTable from '../components/songs/SongsTable.svelte';
  import {
    addSelectedTracksToPlaylist,
    addSelectedTracksToQueue,
    playSelectedTracks,
    playVisibleTrack,
  } from '../features/songs-list/actions';
  import {
    clearSelection as clearSongsSelection,
    createSelectionState,
    getVisibleSelectedIds,
    isSelectionStateEqual,
    reconcileSelection,
    selectFromContextMenu,
    selectRange,
    selectSingle,
    toggleSelection,
  } from '../features/songs-list/selection';
  import {
    getVisibleTracks,
    type SongsSortDirection,
    type SongsSortKey,
  } from '../features/songs-list/sort-filter';
  import type { Playlist, Track } from '../types';

  export let tracks: Track[] = [];
  export let playlists: Playlist[] = [];
  export let refreshPlaylists: () => Promise<void> = async () => {};
  export let isLibraryLoading = false;
  export let searchTerm = '';

  let sortKey: SongsSortKey = 'title';
  let sortDirection: SongsSortDirection = 'asc';
  let visibleTracks: Track[] = [];
  let selection = createSelectionState();
  let playingTrackId: string | null = null;
  let contextMenuOpen = false;
  let contextMenuPosition = { x: 0, y: 0 };
  let contextMenuAnchor: DOMRect | null = null;
  let playlistPickerOpen = false;
  let playlistPickerAnchor: DOMRect | null = null;
  let feedback = '';
  let playbackPollTimer: number | null = null;
  let pendingDoubleClickSelection: {
    trackId: string;
    selection: ReturnType<typeof createSelectionState>;
  } | null = null;
  let pendingDoubleClickClearTimer: number | null = null;

  const DOUBLE_CLICK_RESTORE_WINDOW_MS = 500;

  const actionDeps = {
    setQueue,
    playTrack,
    addToQueue,
    addToPlaylist,
  };

  $: visibleTracks = getVisibleTracks(tracks, searchTerm, {
    key: sortKey,
    direction: sortDirection,
  });

  $: visibleTrackIds = visibleTracks.map((track) => track.id);
  $: visibleSelectedIds = getVisibleSelectedIds(selection, visibleTrackIds);
  $: visibleSelectionCount = visibleSelectedIds.length;
  $: canAddToPlaylist = playlists.length > 0;
  $: addToPlaylistHint = canAddToPlaylist ? '' : '请先创建歌单';

  $: {
    const nextSelection = reconcileSelection(
      selection,
      tracks.map((track) => track.id),
      visibleTracks.map((track) => track.id),
    );

    if (!isSelectionStateEqual(selection, nextSelection)) {
      selection = nextSelection;
    }
  }

  function toggleSort(key: SongsSortKey): void {
    if (sortKey === key) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      return;
    }

    sortKey = key;
    sortDirection = 'asc';
  }

  function clearFeedback(): void {
    feedback = '';
  }

  function cloneSelectionState(selectionState: ReturnType<typeof createSelectionState>): ReturnType<typeof createSelectionState> {
    return {
      selectedIds: [...selectionState.selectedIds],
      activeTrackId: selectionState.activeTrackId,
      anchorTrackId: selectionState.anchorTrackId,
    };
  }

  function clearPendingDoubleClickSelection(): void {
    if (pendingDoubleClickClearTimer !== null) {
      window.clearTimeout(pendingDoubleClickClearTimer);
      pendingDoubleClickClearTimer = null;
    }

    pendingDoubleClickSelection = null;
  }

  function rememberPendingDoubleClickSelection(trackId: string): void {
    clearPendingDoubleClickSelection();
    pendingDoubleClickSelection = {
      trackId,
      selection: cloneSelectionState(selection),
    };
    pendingDoubleClickClearTimer = window.setTimeout(() => {
      pendingDoubleClickSelection = null;
      pendingDoubleClickClearTimer = null;
    }, DOUBLE_CLICK_RESTORE_WINDOW_MS);
  }

  function closeContextMenu(): void {
    contextMenuOpen = false;
  }

  function closePlaylistPicker(): void {
    playlistPickerOpen = false;
    playlistPickerAnchor = null;
  }

  function closeTransientOverlays(): void {
    closeContextMenu();
    closePlaylistPicker();
  }

  function openPlaylistPicker(anchor: DOMRect): void {
    playlistPickerAnchor = anchor;
    playlistPickerOpen = true;
  }

  function getFallbackAnchor(x: number, y: number): DOMRect {
    return new DOMRect(x, y, 0, 0);
  }

  function mapPlaylistFeedback(result: {
    status: 'success' | 'partial' | 'error';
    added: number;
    total: number;
  }): string {
    if (result.status === 'success') {
      return `已加入歌单：${result.added} 首`;
    }

    if (result.status === 'partial') {
      return `部分成功：已加入 ${result.added}/${result.total} 首`;
    }

    return '加入歌单失败';
  }

  async function refreshPlayingTrackId(): Promise<void> {
    try {
      const [playbackState, currentTrack] = await Promise.all([
        getPlaybackState(),
        getCurrentTrack(),
      ]);

      if (playbackState.state === 'playing' && currentTrack) {
        flushSync(() => {
          playingTrackId = currentTrack.id;
        });
        return;
      }
    } catch {
      // Fall through to clear highlight.
    }

    flushSync(() => {
      playingTrackId = null;
    });
  }

  async function syncPlayingTrackIdFromAction(result: { status: 'success' | 'error' }): Promise<void> {
    if (result.status === 'success') {
      await refreshPlayingTrackId();
    }
  }

  function handleRowClick(
    event: CustomEvent<{
      track: Track;
      metaKey: boolean;
      ctrlKey: boolean;
      shiftKey: boolean;
    }>,
  ): void {
    const { track, metaKey, ctrlKey, shiftKey } = event.detail;
    const isPlainClick = !metaKey && !ctrlKey && !shiftKey;
    const shouldRememberSelectionForDoubleClick =
      isPlainClick
      && selection.selectedIds.length > 1
      && selection.selectedIds.includes(track.id);

    if (shouldRememberSelectionForDoubleClick) {
      rememberPendingDoubleClickSelection(track.id);
    } else if (!(isPlainClick && pendingDoubleClickSelection?.trackId === track.id)) {
      clearPendingDoubleClickSelection();
    }

    if (shiftKey) {
      selection = selectRange(selection, visibleTrackIds, track.id);
    } else if (metaKey || ctrlKey) {
      selection = toggleSelection(selection, track.id);
    } else {
      selection = selectSingle(selection, track.id);
    }

    clearFeedback();
    closeTransientOverlays();
  }

  async function handleRowDoubleClick(event: CustomEvent<{ track: Track }>): Promise<void> {
    const { track } = event.detail;
    const selectionBeforeDoubleClick =
      pendingDoubleClickSelection?.trackId === track.id
        ? pendingDoubleClickSelection.selection
        : selection;
    const isAlreadySelected = selectionBeforeDoubleClick.selectedIds.includes(track.id);

    clearPendingDoubleClickSelection();
    selection = isAlreadySelected
      ? selectFromContextMenu(selectionBeforeDoubleClick, track.id)
      : selectSingle(selectionBeforeDoubleClick, track.id);

    const result = await playVisibleTrack({
      visibleTracks,
      track,
      deps: actionDeps,
    });

    feedback = result.message;
    closeTransientOverlays();
    await syncPlayingTrackIdFromAction(result);
  }

  function handleRowFocus(event: CustomEvent<{ track: Track }>): void {
    const { track } = event.detail;

    if (selection.activeTrackId === track.id) {
      return;
    }

    selection = {
      ...selection,
      activeTrackId: track.id,
    };
  }

  async function handleRowKeydown(event: CustomEvent<{ track: Track; key: string }>): Promise<void> {
    const { track, key } = event.detail;

    if (key !== 'Enter' && key !== ' ' && key !== 'Space') {
      return;
    }

    selection = {
      ...selection,
      activeTrackId: track.id,
    };

    const result = await playVisibleTrack({
      visibleTracks,
      track,
      deps: actionDeps,
    });

    feedback = result.message;
    closeTransientOverlays();
    await syncPlayingTrackIdFromAction(result);
  }

  function handleRowContextMenu(
    event: CustomEvent<{
      track: Track;
      x: number;
      y: number;
      focusTarget?: HTMLElement | null;
    }>,
  ): void {
    const { track, x, y, focusTarget } = event.detail;

    clearPendingDoubleClickSelection();
    selection = selectFromContextMenu(selection, track.id);
    contextMenuPosition = { x, y };
    contextMenuAnchor = focusTarget?.getBoundingClientRect() ?? getFallbackAnchor(x, y);
    contextMenuOpen = true;
    closePlaylistPicker();
    clearFeedback();
    focusTarget?.focus();
  }

  async function handlePlaySelected(): Promise<void> {
    const result = await playSelectedTracks({
      visibleTracks,
      selection,
      deps: actionDeps,
    });

    feedback = result.message;
    closeTransientOverlays();
    await syncPlayingTrackIdFromAction(result);
  }

  async function handleAddSelectedToQueue(): Promise<void> {
    const result = await addSelectedTracksToQueue({
      visibleTracks,
      selection,
      deps: actionDeps,
    });

    feedback = result.message;
    closeTransientOverlays();
  }

  function handleBulkAddToPlaylist(event: CustomEvent<{ anchor: DOMRect }>): void {
    if (!canAddToPlaylist) {
      return;
    }

    closeContextMenu();
    openPlaylistPicker(event.detail.anchor);
  }

  function handleContextMenuAddToPlaylist(): void {
    if (!canAddToPlaylist) {
      return;
    }

    closeContextMenu();
    openPlaylistPicker(
      contextMenuAnchor ?? getFallbackAnchor(contextMenuPosition.x, contextMenuPosition.y),
    );
  }

  async function handlePlaylistSelect(event: CustomEvent<{ playlistId: string }>): Promise<void> {
    const { playlistId } = event.detail;

    const result = await addSelectedTracksToPlaylist({
      playlistId,
      visibleTracks,
      selection,
      deps: actionDeps,
    });

    feedback = mapPlaylistFeedback(result);
    closePlaylistPicker();

    if (result.added > 0) {
      await refreshPlaylists();
    }
  }

  function handleClearSelection(): void {
    clearPendingDoubleClickSelection();
    selection = clearSongsSelection();
    clearFeedback();
    closeTransientOverlays();
  }

  function handleWindowClick(event: MouseEvent): void {
    const target = event.target;

    if (!(target instanceof Element)) {
      closeTransientOverlays();
      return;
    }

    if (
      target.closest('.context-menu-shell') ||
      target.closest('.playlist-picker') ||
      target.closest('.bulk-action-bar')
    ) {
      return;
    }

    closeTransientOverlays();
  }

  function handleWindowKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
      return;
    }

    if (playlistPickerOpen) {
      closePlaylistPicker();
      return;
    }

    if (contextMenuOpen) {
      closeContextMenu();
    }
  }

  if (typeof window !== 'undefined') {
    void refreshPlayingTrackId();
  }

  onMount(() => {
    playbackPollTimer = window.setInterval(() => {
      void refreshPlayingTrackId();
    }, 1_000);

    window.addEventListener('click', handleWindowClick);
    window.addEventListener('keydown', handleWindowKeydown);
  });

  onDestroy(() => {
    clearPendingDoubleClickSelection();

    if (playbackPollTimer !== null) {
      window.clearInterval(playbackPollTimer);
      playbackPollTimer = null;
    }

    window.removeEventListener('click', handleWindowClick);
    window.removeEventListener('keydown', handleWindowKeydown);
  });
</script>

<div class="songs-view">
  <div class="header">
    <h2>Songs</h2>
    <p>{tracks.length} tracks in your library</p>
  </div>

  {#if feedback}
    <p class="feedback" role="status" aria-live="polite">{feedback}</p>
  {/if}

  {#if visibleSelectionCount > 0}
    <SongsBulkActionBar
      selectedCount={visibleSelectionCount}
      {canAddToPlaylist}
      {addToPlaylistHint}
      on:playSelected={handlePlaySelected}
      on:addToQueue={handleAddSelectedToQueue}
      on:addToPlaylist={handleBulkAddToPlaylist}
      on:clearSelection={handleClearSelection}
    />
  {/if}

  {#if isLibraryLoading}
    <div class="empty">
      <p>Scanning library…</p>
    </div>
  {:else if visibleTracks.length === 0}
    <div class="empty">
      <p>No songs matched your search.</p>
    </div>
  {:else}
    <SongsTable
      tracks={visibleTracks}
      selectedIds={visibleSelectedIds}
      activeTrackId={selection.activeTrackId}
      {playingTrackId}
      {sortKey}
      {sortDirection}
      on:toggleSort={(event) => toggleSort(event.detail.key)}
      on:rowClick={handleRowClick}
      on:rowDoubleClick={handleRowDoubleClick}
      on:rowFocus={handleRowFocus}
      on:rowKeydown={handleRowKeydown}
      on:rowContextMenu={handleRowContextMenu}
    />
  {/if}

  {#if contextMenuOpen}
    <SongsContextMenu
      x={contextMenuPosition.x}
      y={contextMenuPosition.y}
      {canAddToPlaylist}
      {addToPlaylistHint}
      on:playSelected={handlePlaySelected}
      on:addToQueue={handleAddSelectedToQueue}
      on:addToPlaylist={handleContextMenuAddToPlaylist}
    />
  {/if}

  {#if playlistPickerOpen}
    <SongsPlaylistPicker
      {playlists}
      anchor={playlistPickerAnchor}
      on:selectPlaylist={handlePlaylistSelect}
      on:close={closePlaylistPicker}
    />
  {/if}
</div>

<style>
  .songs-view {
    padding: 32px 48px;
    color: var(--app-fg);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .header h2 {
    margin: 0;
    font-size: 1.8rem;
    color: var(--app-fg);
  }

  .header p {
    margin: 4px 0 0 0;
    color: var(--muted-fg);
  }

  .feedback {
    margin: 0;
    padding: 12px 16px;
    border-radius: 14px;
    border: 1px solid rgba(96, 165, 250, 0.24);
    background: rgba(15, 23, 42, 0.72);
    color: rgba(226, 232, 240, 0.92);
  }

  .empty {
    padding: 80px 0;
    text-align: center;
    color: rgba(148, 163, 184, 0.75);
    background: rgba(15, 23, 42, 0.65);
    border-radius: 16px;
  }

  @media (max-width: 820px) {
    .songs-view {
      padding: 24px;
    }
  }
</style>
