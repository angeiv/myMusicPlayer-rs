import { describe, expect, it, vi } from 'vitest';

import {
  addSelectedTracksToPlaylist,
  addSelectedTracksToQueue,
  getSelectedVisibleTracks,
  playSelectedTracks,
  playVisibleTrack,
} from '../lib/features/songs-list/actions';
import type { SongsListActionDeps } from '../lib/features/songs-list/actions';
import type { Track } from '../lib/types';

function createTrack(overrides: Pick<Track, 'id' | 'title'> & Partial<Track>): Track {
  const { id, title, ...rest } = overrides;

  return {
    id,
    title,
    duration: 180,
    path: `/music/${id}.mp3`,
    size: 1,
    format: 'mp3',
    bitrate: 320,
    sample_rate: 44100,
    channels: 2,
    play_count: 0,
    date_added: '2026-03-01T00:00:00.000Z',
    ...rest,
  };
}

function createDeps(overrides: Partial<SongsListActionDeps> = {}): SongsListActionDeps {
  return {
    setQueue: vi.fn<SongsListActionDeps['setQueue']>().mockResolvedValue(undefined),
    addToQueue: vi.fn<SongsListActionDeps['addToQueue']>().mockResolvedValue(undefined),
    playTrack: vi.fn<SongsListActionDeps['playTrack']>().mockResolvedValue(undefined),
    addTracksToPlaylist: vi
      .fn<SongsListActionDeps['addTracksToPlaylist']>()
      .mockResolvedValue({
        status: 'success',
        added: 0,
        total: 0,
        failedTrackIds: [],
      }),
    ...overrides,
  };
}

function getFirstInvocationCallOrder(mock: { mock: { invocationCallOrder: number[] } }): number {
  const firstInvocation = mock.mock.invocationCallOrder[0];

  if (firstInvocation === undefined) {
    throw new Error('Expected mock to have been called at least once');
  }

  return firstInvocation;
}

const visibleTracks: [Track, Track, Track, Track] = [
  createTrack({ id: 'track-1', title: 'First' }),
  createTrack({ id: 'track-2', title: 'Second' }),
  createTrack({ id: 'track-3', title: 'Third' }),
  createTrack({ id: 'track-4', title: 'Fourth' }),
];

const [firstVisibleTrack, secondVisibleTrack, thirdVisibleTrack, fourthVisibleTrack] = visibleTracks;

describe('songs-list actions', () => {
  it('getSelectedVisibleTracks keeps the visible tracks order', () => {
    expect(
      getSelectedVisibleTracks(visibleTracks, ['track-3', 'track-1', 'track-4']),
    ).toEqual([firstVisibleTrack, thirdVisibleTrack, fourthVisibleTrack]);
  });

  it('playSelectedTracks replaces the queue in visible order and starts from the active selected track', async () => {
    const setQueue = vi.fn<SongsListActionDeps['setQueue']>().mockResolvedValue(undefined);
    const playTrack = vi.fn<SongsListActionDeps['playTrack']>().mockResolvedValue(undefined);

    const result = await playSelectedTracks({
      visibleTracks,
      selection: {
        selectedIds: ['track-4', 'track-2', 'track-1'],
        activeTrackId: 'track-2',
        anchorTrackId: 'track-2',
      },
      deps: createDeps({
        setQueue,
        playTrack,
      }),
    });

    expect(setQueue).toHaveBeenCalledWith([firstVisibleTrack, secondVisibleTrack, fourthVisibleTrack]);
    expect(playTrack).toHaveBeenCalledWith(secondVisibleTrack);
    expect(getFirstInvocationCallOrder(setQueue)).toBeLessThan(getFirstInvocationCallOrder(playTrack));
    expect(result).toEqual({
      status: 'success',
      message: '已开始播放选中歌曲',
    });
  });

  it('playSelectedTracks falls back to the first selected visible track when activeTrackId is not selected', async () => {
    const setQueue = vi.fn<SongsListActionDeps['setQueue']>().mockResolvedValue(undefined);
    const playTrack = vi.fn<SongsListActionDeps['playTrack']>().mockResolvedValue(undefined);

    await playSelectedTracks({
      visibleTracks,
      selection: {
        selectedIds: ['track-4', 'track-2'],
        activeTrackId: 'track-3',
        anchorTrackId: 'track-3',
      },
      deps: createDeps({
        setQueue,
        playTrack,
      }),
    });

    expect(playTrack).toHaveBeenCalledWith(secondVisibleTrack);
  });

  it('addSelectedTracksToQueue keeps the selected visible track order', async () => {
    const addToQueue = vi.fn<SongsListActionDeps['addToQueue']>().mockResolvedValue(undefined);

    const result = await addSelectedTracksToQueue({
      visibleTracks,
      selection: {
        selectedIds: ['track-3', 'track-1'],
        activeTrackId: 'track-3',
        anchorTrackId: 'track-3',
      },
      deps: createDeps({
        addToQueue,
      }),
    });

    expect(addToQueue).toHaveBeenCalledWith([firstVisibleTrack, thirdVisibleTrack]);
    expect(result).toEqual({
      status: 'success',
      message: '已加入队列：2 首',
    });
  });

  it('playSelectedTracks returns a structured error result when playback orchestration fails', async () => {
    const setQueue = vi.fn<SongsListActionDeps['setQueue']>().mockRejectedValue(new Error('boom'));

    const result = await playSelectedTracks({
      visibleTracks,
      selection: {
        selectedIds: ['track-1', 'track-2'],
        activeTrackId: 'track-2',
        anchorTrackId: 'track-2',
      },
      deps: createDeps({
        setQueue,
      }),
    });

    expect(result).toEqual({
      status: 'error',
      message: '播放选中项失败',
    });
  });

  it('addSelectedTracksToQueue returns a structured error result when queue insertion fails', async () => {
    const addToQueue = vi.fn<SongsListActionDeps['addToQueue']>().mockRejectedValue(new Error('boom'));

    const result = await addSelectedTracksToQueue({
      visibleTracks,
      selection: {
        selectedIds: ['track-1', 'track-2'],
        activeTrackId: 'track-1',
        anchorTrackId: 'track-1',
      },
      deps: createDeps({
        addToQueue,
      }),
    });

    expect(result).toEqual({
      status: 'error',
      message: '加入队列失败',
    });
  });

  it('addSelectedTracksToPlaylist returns error when there are no visible selected tracks', async () => {
    const addTracksToPlaylist = vi
      .fn<SongsListActionDeps['addTracksToPlaylist']>()
      .mockResolvedValue({
        status: 'success',
        added: 0,
        total: 0,
        failedTrackIds: [],
      });

    const result = await addSelectedTracksToPlaylist({
      playlistId: 'playlist-1',
      visibleTracks,
      selection: {
        selectedIds: ['hidden-track'],
        activeTrackId: 'hidden-track',
        anchorTrackId: 'hidden-track',
      },
      deps: createDeps({
        addTracksToPlaylist,
      }),
    });

    expect(addTracksToPlaylist).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'error',
      added: 0,
      total: 0,
      failedTrackIds: [],
    });
  });

  it('addSelectedTracksToPlaylist passes the visible selected track ids in order', async () => {
    const addTracksToPlaylist = vi
      .fn<SongsListActionDeps['addTracksToPlaylist']>()
      .mockResolvedValue({
        status: 'success',
        added: 2,
        total: 2,
        failedTrackIds: [],
      });

    const result = await addSelectedTracksToPlaylist({
      playlistId: 'playlist-1',
      visibleTracks,
      selection: {
        selectedIds: ['track-3', 'track-1'],
        activeTrackId: 'track-3',
        anchorTrackId: 'track-3',
      },
      deps: createDeps({
        addTracksToPlaylist,
      }),
    });

    expect(addTracksToPlaylist).toHaveBeenCalledWith('playlist-1', ['track-1', 'track-3']);
    expect(result).toEqual({
      status: 'success',
      added: 2,
      total: 2,
      failedTrackIds: [],
    });
  });

  it('addSelectedTracksToPlaylist returns partial when the backend reports partial success', async () => {
    const addTracksToPlaylist = vi
      .fn<SongsListActionDeps['addTracksToPlaylist']>()
      .mockResolvedValue({
        status: 'partial',
        added: 2,
        total: 3,
        failedTrackIds: ['track-3'],
      });

    const result = await addSelectedTracksToPlaylist({
      playlistId: 'playlist-1',
      visibleTracks,
      selection: {
        selectedIds: ['track-1', 'track-2', 'track-3'],
        activeTrackId: 'track-2',
        anchorTrackId: 'track-2',
      },
      deps: createDeps({
        addTracksToPlaylist,
      }),
    });

    expect(addTracksToPlaylist).toHaveBeenCalledWith('playlist-1', ['track-1', 'track-2', 'track-3']);
    expect(result).toEqual({
      status: 'partial',
      added: 2,
      total: 3,
      failedTrackIds: ['track-3'],
    });
  });

  it('addSelectedTracksToPlaylist returns error when the backend reports full failure', async () => {
    const addTracksToPlaylist = vi
      .fn<SongsListActionDeps['addTracksToPlaylist']>()
      .mockResolvedValue({
        status: 'error',
        added: 0,
        total: 2,
        failedTrackIds: ['track-1', 'track-3'],
      });

    const result = await addSelectedTracksToPlaylist({
      playlistId: 'playlist-1',
      visibleTracks,
      selection: {
        selectedIds: ['track-1', 'track-3'],
        activeTrackId: 'track-3',
        anchorTrackId: 'track-3',
      },
      deps: createDeps({
        addTracksToPlaylist,
      }),
    });

    expect(addTracksToPlaylist).toHaveBeenCalledWith('playlist-1', ['track-1', 'track-3']);
    expect(result).toEqual({
      status: 'error',
      added: 0,
      total: 2,
      failedTrackIds: ['track-1', 'track-3'],
    });
  });

  it('playVisibleTrack always replaces the queue with full visible tracks and starts from the double-clicked row', async () => {
    const setQueue = vi.fn<SongsListActionDeps['setQueue']>().mockResolvedValue(undefined);
    const playTrack = vi.fn<SongsListActionDeps['playTrack']>().mockResolvedValue(undefined);

    const result = await playVisibleTrack({
      visibleTracks,
      track: thirdVisibleTrack,
      deps: createDeps({
        setQueue,
        playTrack,
      }),
    });

    expect(setQueue).toHaveBeenCalledWith(visibleTracks);
    expect(playTrack).toHaveBeenCalledWith(thirdVisibleTrack);
    expect(result).toEqual({
      status: 'success',
      message: '已开始播放当前歌曲',
    });
  });
});
