export type SongsListSelectionState = {
  selectedIds: string[];
  activeTrackId: string | null;
  anchorTrackId: string | null;
};

export function createSelectionState(): SongsListSelectionState {
  return { selectedIds: [], activeTrackId: null, anchorTrackId: null };
}

export function selectSingle(
  _state: SongsListSelectionState,
  trackId: string,
): SongsListSelectionState {
  return {
    selectedIds: [trackId],
    activeTrackId: trackId,
    anchorTrackId: trackId,
  };
}

export function toggleSelection(
  state: SongsListSelectionState,
  trackId: string,
): SongsListSelectionState {
  const isSelected = state.selectedIds.includes(trackId);

  return {
    selectedIds: isSelected
      ? state.selectedIds.filter((id) => id !== trackId)
      : [...state.selectedIds, trackId],
    activeTrackId: trackId,
    anchorTrackId: trackId,
  };
}

export function selectRange(
  state: SongsListSelectionState,
  visibleIds: string[],
  trackId: string,
): SongsListSelectionState {
  const anchorTrackId = state.anchorTrackId;

  if (anchorTrackId === null) {
    return selectSingle(state, trackId);
  }

  const anchorIndex = visibleIds.indexOf(anchorTrackId);
  const trackIndex = visibleIds.indexOf(trackId);

  if (anchorIndex === -1 || trackIndex === -1) {
    return selectSingle(state, trackId);
  }

  const start = Math.min(anchorIndex, trackIndex);
  const end = Math.max(anchorIndex, trackIndex);

  return {
    selectedIds: visibleIds.slice(start, end + 1),
    activeTrackId: trackId,
    anchorTrackId: trackId,
  };
}

export function selectFromContextMenu(
  state: SongsListSelectionState,
  trackId: string,
): SongsListSelectionState {
  return {
    selectedIds: state.selectedIds.includes(trackId) ? [...state.selectedIds] : [trackId],
    activeTrackId: trackId,
    anchorTrackId: trackId,
  };
}

export function clearSelection(): SongsListSelectionState {
  return createSelectionState();
}

export function reconcileSelection(
  state: SongsListSelectionState,
  existingIds: string[],
  visibleIds: string[],
): SongsListSelectionState {
  const existingIdSet = new Set(existingIds);
  const visibleIdSet = new Set(visibleIds);

  return {
    selectedIds: state.selectedIds.filter((id) => existingIdSet.has(id)),
    activeTrackId:
      state.activeTrackId !== null && existingIdSet.has(state.activeTrackId) && visibleIdSet.has(state.activeTrackId)
        ? state.activeTrackId
        : null,
    anchorTrackId:
      state.anchorTrackId !== null && existingIdSet.has(state.anchorTrackId) && visibleIdSet.has(state.anchorTrackId)
        ? state.anchorTrackId
        : null,
  };
}

export function getVisibleSelectedIds(
  state: SongsListSelectionState,
  visibleIds: string[],
): string[] {
  const selectedIdSet = new Set(state.selectedIds);

  return visibleIds.filter((id) => selectedIdSet.has(id));
}

export function isSelectionStateEqual(
  left: SongsListSelectionState,
  right: SongsListSelectionState,
): boolean {
  return (
    left.activeTrackId === right.activeTrackId
    && left.anchorTrackId === right.anchorTrackId
    && left.selectedIds.length === right.selectedIds.length
    && left.selectedIds.every((id, index) => id === right.selectedIds[index])
  );
}
