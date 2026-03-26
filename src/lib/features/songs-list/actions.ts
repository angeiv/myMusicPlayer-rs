import type { Track } from '../../types';
import type { SongsListSelectionState } from './selection';

export type SongsListActionDeps = {
  setQueue: (tracks: Track[]) => Promise<void>;
  addToQueue: (tracks: Track[]) => Promise<void>;
  playTrack: (track: Track) => Promise<void>;
  addToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
};

export type SongsListActionResult = {
  status: 'success' | 'error';
  message: string;
};

export type SongsListPlaylistActionResult = {
  status: 'success' | 'partial' | 'error';
  added: number;
  total: number;
  failedTrackIds: string[];
};

type SongsListActionInput = {
  visibleTracks: Track[];
  selection: SongsListSelectionState;
  deps: SongsListActionDeps;
};

type SongsListPlaylistActionInput = SongsListActionInput & {
  playlistId: string;
};

type SongsListPlayVisibleTrackInput = {
  visibleTracks: Track[];
  track: Track;
  deps: SongsListActionDeps;
};

const NO_SELECTION_MESSAGE = '请先选择歌曲';

export function getSelectedVisibleTracks(visibleTracks: Track[], selectedIds: string[]): Track[] {
  const selectedIdSet = new Set(selectedIds);

  return visibleTracks.filter((track) => selectedIdSet.has(track.id));
}

export async function playSelectedTracks({
  visibleTracks,
  selection,
  deps,
}: SongsListActionInput): Promise<SongsListActionResult> {
  const selectedTracks = getSelectedVisibleTracks(visibleTracks, selection.selectedIds);
  const startTrack =
    selectedTracks.find((track) => track.id === selection.activeTrackId) ?? selectedTracks[0];

  if (!startTrack) {
    return {
      status: 'error',
      message: NO_SELECTION_MESSAGE,
    };
  }

  try {
    await deps.setQueue(selectedTracks);
    await deps.playTrack(startTrack);

    return {
      status: 'success',
      message: '已开始播放选中歌曲',
    };
  } catch {
    return {
      status: 'error',
      message: '播放选中项失败',
    };
  }
}

export async function addSelectedTracksToQueue({
  visibleTracks,
  selection,
  deps,
}: SongsListActionInput): Promise<SongsListActionResult> {
  const selectedTracks = getSelectedVisibleTracks(visibleTracks, selection.selectedIds);

  if (selectedTracks.length === 0) {
    return {
      status: 'error',
      message: NO_SELECTION_MESSAGE,
    };
  }

  try {
    await deps.addToQueue(selectedTracks);

    return {
      status: 'success',
      message: `已加入队列：${selectedTracks.length} 首`,
    };
  } catch {
    return {
      status: 'error',
      message: '加入队列失败',
    };
  }
}

export async function addSelectedTracksToPlaylist({
  playlistId,
  visibleTracks,
  selection,
  deps,
}: SongsListPlaylistActionInput): Promise<SongsListPlaylistActionResult> {
  const selectedTracks = getSelectedVisibleTracks(visibleTracks, selection.selectedIds);
  const failedTrackIds: string[] = [];
  let added = 0;

  if (selectedTracks.length === 0) {
    return {
      status: 'error',
      added,
      total: 0,
      failedTrackIds,
    };
  }

  for (const track of selectedTracks) {
    try {
      await deps.addToPlaylist(playlistId, track.id);
      added += 1;
    } catch {
      failedTrackIds.push(track.id);
    }
  }

  if (added === selectedTracks.length) {
    return {
      status: 'success',
      added,
      total: selectedTracks.length,
      failedTrackIds,
    };
  }

  if (added === 0) {
    return {
      status: 'error',
      added,
      total: selectedTracks.length,
      failedTrackIds,
    };
  }

  return {
    status: 'partial',
    added,
    total: selectedTracks.length,
    failedTrackIds,
  };
}

export async function playVisibleTrack({
  visibleTracks,
  track,
  deps,
}: SongsListPlayVisibleTrackInput): Promise<SongsListActionResult> {
  if (!visibleTracks.some((item) => item.id === track.id)) {
    return {
      status: 'error',
      message: '播放歌曲失败',
    };
  }

  try {
    await deps.setQueue(visibleTracks);
    await deps.playTrack(track);

    return {
      status: 'success',
      message: '已开始播放当前歌曲',
    };
  } catch {
    return {
      status: 'error',
      message: '播放歌曲失败',
    };
  }
}
