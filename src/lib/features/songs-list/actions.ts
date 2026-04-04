import type { Track } from '../../types';
import {
  getMissingTrackPlayMessage,
  getPlayableTracks,
  isTrackPlayable,
} from '../../utils/track-availability';
import type { SongsListSelectionState } from './selection';

export type SongsListActionDeps = {
  setQueue: (tracks: Track[]) => Promise<void>;
  addToQueue: (tracks: Track[]) => Promise<void>;
  playTrack: (track: Track) => Promise<void>;
  addTracksToPlaylist: (
    playlistId: string,
    trackIds: string[],
  ) => Promise<SongsListPlaylistActionResult>;
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
const PLAY_SELECTED_SUCCESS_MESSAGE = '已开始播放选中歌曲';
const PLAY_SELECTED_ERROR_MESSAGE = '播放选中项失败';
const PLAY_VISIBLE_SUCCESS_MESSAGE = '已开始播放当前歌曲';
const PLAY_VISIBLE_ERROR_MESSAGE = '播放歌曲失败';

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

  if (selectedTracks.length === 0) {
    return {
      status: 'error',
      message: NO_SELECTION_MESSAGE,
    };
  }

  const playableSelectedTracks = getPlayableTracks(selectedTracks);
  const startTrack =
    playableSelectedTracks.find((track) => track.id === selection.activeTrackId)
    ?? playableSelectedTracks[0];

  if (!startTrack) {
    return {
      status: 'error',
      message: getMissingTrackPlayMessage('selection'),
    };
  }

  try {
    await deps.setQueue(playableSelectedTracks);
    await deps.playTrack(startTrack);

    return {
      status: 'success',
      message: PLAY_SELECTED_SUCCESS_MESSAGE,
    };
  } catch {
    return {
      status: 'error',
      message: PLAY_SELECTED_ERROR_MESSAGE,
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

  if (selectedTracks.length === 0) {
    return {
      status: 'error',
      added: 0,
      total: 0,
      failedTrackIds: [],
    };
  }

  return deps.addTracksToPlaylist(
    playlistId,
    selectedTracks.map((track) => track.id),
  );
}

export async function playVisibleTrack({
  visibleTracks,
  track,
  deps,
}: SongsListPlayVisibleTrackInput): Promise<SongsListActionResult> {
  const visibleTrack = visibleTracks.find((item) => item.id === track.id);

  if (!visibleTrack) {
    return {
      status: 'error',
      message: PLAY_VISIBLE_ERROR_MESSAGE,
    };
  }

  if (!isTrackPlayable(visibleTrack)) {
    return {
      status: 'error',
      message: getMissingTrackPlayMessage('track'),
    };
  }

  const playableVisibleTracks = getPlayableTracks(visibleTracks);

  try {
    await deps.setQueue(playableVisibleTracks);
    await deps.playTrack(visibleTrack);

    return {
      status: 'success',
      message: PLAY_VISIBLE_SUCCESS_MESSAGE,
    };
  } catch {
    return {
      status: 'error',
      message: PLAY_VISIBLE_ERROR_MESSAGE,
    };
  }
}
