import { describe, expect, it, vi } from 'vitest';

import {
  addSelectedTracksToPlaylist,
  addSelectedTracksToQueue,
  getSelectedVisibleTracks,
  playSelectedTracks,
  playVisibleTrack,
} from '../lib/features/songs-list/actions';
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

const visibleTracks: Track[] = [
  createTrack({ id: 'track-1', title: 'First' }),
  createTrack({ id: 'track-2', title: 'Second' }),
  createTrack({ id: 'track-3', title: 'Third' }),
  createTrack({ id: 'track-4', title: 'Fourth' }),
];

describe('songs-list actions', () => {
  it('getSelectedVisibleTracks keeps the visible tracks order', () => {
    expect(
      getSelectedVisibleTracks(visibleTracks, ['track-3', 'track-1', 'track-4']),
    ).toEqual([visibleTracks[0], visibleTracks[2], visibleTracks[3]]);
  });

  it('playSelectedTracks replaces the queue in visible order and starts from the active selected track', async () => {
    const setQueue = vi.fn<[(typeof visibleTracks)], Promise<void>>().mockResolvedValue(undefined);
    const playTrack = vi.fn<[Track], Promise<void>>().mockResolvedValue(undefined);

    const result = await playSelectedTracks({
      visibleTracks,
      selection: {
        selectedIds: ['track-4', 'track-2', 'track-1'],
        activeTrackId: 'track-2',
        anchorTrackId: 'track-2',
      },
      deps: {
        setQueue,
        addToQueue: vi.fn(),
        playTrack,
        addToPlaylist: vi.fn(),
      },
    });

    expect(setQueue).toHaveBeenCalledWith([visibleTracks[0], visibleTracks[1], visibleTracks[3]]);
    expect(playTrack).toHaveBeenCalledWith(visibleTracks[1]);
    expect(setQueue.mock.invocationCallOrder[0]).toBeLessThan(playTrack.mock.invocationCallOrder[0]);
    expect(result).toEqual({
      status: 'success',
      message: '已开始播放选中歌曲',
    });
  });

  it('playSelectedTracks falls back to the first selected visible track when activeTrackId is not selected', async () => {
    const setQueue = vi.fn<[(typeof visibleTracks)], Promise<void>>().mockResolvedValue(undefined);
    const playTrack = vi.fn<[Track], Promise<void>>().mockResolvedValue(undefined);

    await playSelectedTracks({
      visibleTracks,
      selection: {
        selectedIds: ['track-4', 'track-2'],
        activeTrackId: 'track-3',
        anchorTrackId: 'track-3',
      },
      deps: {
        setQueue,
        addToQueue: vi.fn(),
        playTrack,
        addToPlaylist: vi.fn(),
      },
    });

    expect(playTrack).toHaveBeenCalledWith(visibleTracks[1]);
  });

  it('addSelectedTracksToQueue keeps the selected visible track order', async () => {
    const addToQueue = vi.fn<[Track[]], Promise<void>>().mockResolvedValue(undefined);

    const result = await addSelectedTracksToQueue({
      visibleTracks,
      selection: {
        selectedIds: ['track-3', 'track-1'],
        activeTrackId: 'track-3',
        anchorTrackId: 'track-3',
      },
      deps: {
        setQueue: vi.fn(),
        addToQueue,
        playTrack: vi.fn(),
        addToPlaylist: vi.fn(),
      },
    });

    expect(addToQueue).toHaveBeenCalledWith([visibleTracks[0], visibleTracks[2]]);
    expect(result).toEqual({
      status: 'success',
      message: '已加入队列：2 首',
    });
  });

  it('playSelectedTracks returns a structured error result when playback orchestration fails', async () => {
    const setQueue = vi.fn<[(typeof visibleTracks)], Promise<void>>().mockRejectedValue(new Error('boom'));

    const result = await playSelectedTracks({
      visibleTracks,
      selection: {
        selectedIds: ['track-1', 'track-2'],
        activeTrackId: 'track-2',
        anchorTrackId: 'track-2',
      },
      deps: {
        setQueue,
        addToQueue: vi.fn(),
        playTrack: vi.fn(),
        addToPlaylist: vi.fn(),
      },
    });

    expect(result).toEqual({
      status: 'error',
      message: '播放选中项失败',
    });
  });

  it('addSelectedTracksToQueue returns a structured error result when queue insertion fails', async () => {
    const addToQueue = vi.fn<[Track[]], Promise<void>>().mockRejectedValue(new Error('boom'));

    const result = await addSelectedTracksToQueue({
      visibleTracks,
      selection: {
        selectedIds: ['track-1', 'track-2'],
        activeTrackId: 'track-1',
        anchorTrackId: 'track-1',
      },
      deps: {
        setQueue: vi.fn(),
        addToQueue,
        playTrack: vi.fn(),
        addToPlaylist: vi.fn(),
      },
    });

    expect(result).toEqual({
      status: 'error',
      message: '加入队列失败',
    });
  });

  it('addSelectedTracksToPlaylist returns error when there are no visible selected tracks', async () => {
    const addToPlaylist = vi.fn<[string, string], Promise<void>>().mockResolvedValue(undefined);

    const result = await addSelectedTracksToPlaylist({
      playlistId: 'playlist-1',
      visibleTracks,
      selection: {
        selectedIds: ['hidden-track'],
        activeTrackId: 'hidden-track',
        anchorTrackId: 'hidden-track',
      },
      deps: {
        setQueue: vi.fn(),
        addToQueue: vi.fn(),
        playTrack: vi.fn(),
        addToPlaylist,
      },
    });

    expect(addToPlaylist).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'error',
      added: 0,
      total: 0,
      failedTrackIds: [],
    });
  });

  it('addSelectedTracksToPlaylist returns success when every selected track is added', async () => {
    const addToPlaylist = vi.fn<[string, string], Promise<void>>().mockResolvedValue(undefined);

    const result = await addSelectedTracksToPlaylist({
      playlistId: 'playlist-1',
      visibleTracks,
      selection: {
        selectedIds: ['track-3', 'track-1'],
        activeTrackId: 'track-3',
        anchorTrackId: 'track-3',
      },
      deps: {
        setQueue: vi.fn(),
        addToQueue: vi.fn(),
        playTrack: vi.fn(),
        addToPlaylist,
      },
    });

    expect(addToPlaylist).toHaveBeenNthCalledWith(1, 'playlist-1', 'track-1');
    expect(addToPlaylist).toHaveBeenNthCalledWith(2, 'playlist-1', 'track-3');
    expect(result).toEqual({
      status: 'success',
      added: 2,
      total: 2,
      failedTrackIds: [],
    });
  });

  it('addSelectedTracksToPlaylist returns partial when some selected tracks fail', async () => {
    const addToPlaylist = vi
      .fn<[string, string], Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('failed track-3'));

    const result = await addSelectedTracksToPlaylist({
      playlistId: 'playlist-1',
      visibleTracks,
      selection: {
        selectedIds: ['track-1', 'track-2', 'track-3'],
        activeTrackId: 'track-2',
        anchorTrackId: 'track-2',
      },
      deps: {
        setQueue: vi.fn(),
        addToQueue: vi.fn(),
        playTrack: vi.fn(),
        addToPlaylist,
      },
    });

    expect(result).toEqual({
      status: 'partial',
      added: 2,
      total: 3,
      failedTrackIds: ['track-3'],
    });
  });

  it('addSelectedTracksToPlaylist returns error when every selected track fails', async () => {
    const addToPlaylist = vi.fn<[string, string], Promise<void>>().mockRejectedValue(new Error('boom'));

    const result = await addSelectedTracksToPlaylist({
      playlistId: 'playlist-1',
      visibleTracks,
      selection: {
        selectedIds: ['track-1', 'track-3'],
        activeTrackId: 'track-3',
        anchorTrackId: 'track-3',
      },
      deps: {
        setQueue: vi.fn(),
        addToQueue: vi.fn(),
        playTrack: vi.fn(),
        addToPlaylist,
      },
    });

    expect(result).toEqual({
      status: 'error',
      added: 0,
      total: 2,
      failedTrackIds: ['track-1', 'track-3'],
    });
  });

  it('playVisibleTrack always replaces the queue with full visible tracks and starts from the double-clicked row', async () => {
    const setQueue = vi.fn<[Track[]], Promise<void>>().mockResolvedValue(undefined);
    const playTrack = vi.fn<[Track], Promise<void>>().mockResolvedValue(undefined);

    const result = await playVisibleTrack({
      visibleTracks,
      track: visibleTracks[2],
      deps: {
        setQueue,
        addToQueue: vi.fn(),
        playTrack,
        addToPlaylist: vi.fn(),
      },
    });

    expect(setQueue).toHaveBeenCalledWith(visibleTracks);
    expect(playTrack).toHaveBeenCalledWith(visibleTracks[2]);
    expect(result).toEqual({
      status: 'success',
      message: '已开始播放当前歌曲',
    });
  });
});
