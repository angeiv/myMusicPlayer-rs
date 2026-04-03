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
    library_root: rest.library_root ?? null,
    file_mtime_ms: rest.file_mtime_ms ?? null,
    availability: rest.availability ?? 'available',
    missing_since: rest.missing_since ?? null,
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

  it('playSelectedTracks filters missing rows out of the queue and falls back to the first playable selected row', async () => {
    const setQueue = vi.fn<SongsListActionDeps['setQueue']>().mockResolvedValue(undefined);
    const playTrack = vi.fn<SongsListActionDeps['playTrack']>().mockResolvedValue(undefined);
    const missingLeadTrack = createTrack({
      id: 'missing-lead',
      title: 'Missing Lead',
      availability: 'missing',
      missing_since: null,
    });
    const playableTrack = createTrack({ id: 'playable-mid', title: 'Playable Mid' });
    const trailingMissingTrack = createTrack({
      id: 'missing-tail',
      title: 'Missing Tail',
      availability: 'missing',
      missing_since: '2026-04-03T00:00:00.000Z',
    });

    const result = await playSelectedTracks({
      visibleTracks: [missingLeadTrack, playableTrack, trailingMissingTrack],
      selection: {
        selectedIds: ['missing-tail', 'playable-mid', 'missing-lead'],
        activeTrackId: 'missing-lead',
        anchorTrackId: 'missing-lead',
      },
      deps: createDeps({
        setQueue,
        playTrack,
      }),
    });

    expect(setQueue).toHaveBeenCalledWith([playableTrack]);
    expect(playTrack).toHaveBeenCalledWith(playableTrack);
    expect(result).toEqual({
      status: 'success',
      message: '已开始播放选中歌曲',
    });
  });

  it('playSelectedTracks returns a missing-file explanation and never calls playback when every selected visible row is missing', async () => {
    const setQueue = vi.fn<SongsListActionDeps['setQueue']>().mockResolvedValue(undefined);
    const playTrack = vi.fn<SongsListActionDeps['playTrack']>().mockResolvedValue(undefined);
    const missingTracks = [
      createTrack({ id: 'missing-1', title: 'Missing One', availability: 'missing' }),
      createTrack({ id: 'missing-2', title: 'Missing Two', availability: 'missing', missing_since: null }),
    ];

    const result = await playSelectedTracks({
      visibleTracks: missingTracks,
      selection: {
        selectedIds: ['missing-1', 'missing-2'],
        activeTrackId: 'missing-1',
        anchorTrackId: 'missing-1',
      },
      deps: createDeps({
        setQueue,
        playTrack,
      }),
    });

    expect(setQueue).not.toHaveBeenCalled();
    expect(playTrack).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'error',
      message: '所选歌曲文件缺失，无法播放',
    });
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

  it('playVisibleTrack filters missing rows out of the seeded queue before starting playback', async () => {
    const setQueue = vi.fn<SongsListActionDeps['setQueue']>().mockResolvedValue(undefined);
    const playTrack = vi.fn<SongsListActionDeps['playTrack']>().mockResolvedValue(undefined);
    const missingLeadTrack = createTrack({
      id: 'missing-lead',
      title: 'Missing Lead',
      availability: 'missing',
      missing_since: '2026-04-03T00:00:00.000Z',
    });
    const playableTrack = createTrack({ id: 'playable-mid', title: 'Playable Mid' });
    const missingTailTrack = createTrack({
      id: 'missing-tail',
      title: 'Missing Tail',
      availability: 'missing',
      missing_since: null,
    });

    const result = await playVisibleTrack({
      visibleTracks: [missingLeadTrack, playableTrack, missingTailTrack],
      track: playableTrack,
      deps: createDeps({
        setQueue,
        playTrack,
      }),
    });

    expect(setQueue).toHaveBeenCalledWith([playableTrack]);
    expect(playTrack).toHaveBeenCalledWith(playableTrack);
    expect(result).toEqual({
      status: 'success',
      message: '已开始播放当前歌曲',
    });
  });

  it('playVisibleTrack returns a missing-file explanation and never calls playback for a missing row', async () => {
    const setQueue = vi.fn<SongsListActionDeps['setQueue']>().mockResolvedValue(undefined);
    const playTrack = vi.fn<SongsListActionDeps['playTrack']>().mockResolvedValue(undefined);
    const missingTrack = createTrack({
      id: 'missing-row',
      title: 'Missing Row',
      availability: 'missing',
      missing_since: null,
    });

    const result = await playVisibleTrack({
      visibleTracks: [firstVisibleTrack, missingTrack, secondVisibleTrack],
      track: missingTrack,
      deps: createDeps({
        setQueue,
        playTrack,
      }),
    });

    expect(setQueue).not.toHaveBeenCalled();
    expect(playTrack).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'error',
      message: '当前歌曲文件缺失，无法播放',
    });
  });

  it('playVisibleTrack returns an error without calling playback when the requested row is not visible', async () => {
    const setQueue = vi.fn<SongsListActionDeps['setQueue']>().mockResolvedValue(undefined);
    const playTrack = vi.fn<SongsListActionDeps['playTrack']>().mockResolvedValue(undefined);
    const hiddenTrack = createTrack({ id: 'hidden-track', title: 'Hidden Track' });

    const result = await playVisibleTrack({
      visibleTracks,
      track: hiddenTrack,
      deps: createDeps({
        setQueue,
        playTrack,
      }),
    });

    expect(setQueue).not.toHaveBeenCalled();
    expect(playTrack).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'error',
      message: '播放歌曲失败',
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
