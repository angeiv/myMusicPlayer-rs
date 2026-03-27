// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const playlistApiMock = vi.hoisted(() => ({
  getPlaylist: vi.fn(),
  getPlaylistTracks: vi.fn(),
  removeFromPlaylist: vi.fn(),
  updatePlaylistMetadata: vi.fn(),
}));

const playbackApiMock = vi.hoisted(() => ({
  playTrack: vi.fn(),
  setQueue: vi.fn(),
}));

vi.mock('../lib/api/playlist', () => ({
  getPlaylist: playlistApiMock.getPlaylist,
  getPlaylistTracks: playlistApiMock.getPlaylistTracks,
  removeFromPlaylist: playlistApiMock.removeFromPlaylist,
  updatePlaylistMetadata: playlistApiMock.updatePlaylistMetadata,
}));

vi.mock('../lib/api/playback', () => ({
  playTrack: playbackApiMock.playTrack,
  setQueue: playbackApiMock.setQueue,
}));

import PlaylistDetailView from '../lib/views/PlaylistDetailView.svelte';
import type { Playlist, Track } from '../lib/types';

const basePlaylist: Playlist = {
  id: 'playlist-1',
  name: 'After Hours',
  description: 'Late-night rotation',
  track_ids: ['track-1'],
  created_at: '2026-03-01T00:00:00.000Z',
  updated_at: '2026-03-01T00:00:00.000Z',
};

const tracks: Track[] = [
  {
    id: 'track-1',
    title: 'Signal Bloom',
    duration: 180,
    path: '/music/signal-bloom.flac',
    size: 123,
    format: 'flac',
    bitrate: 320,
    sample_rate: 48_000,
    channels: 2,
    play_count: 0,
    date_added: '2026-03-01T00:00:00.000Z',
    artist_name: 'Night Engines',
    album_title: 'Late Transit',
  },
];

describe('PlaylistDetailView', () => {
  beforeEach(() => {
    playlistApiMock.getPlaylist.mockReset();
    playlistApiMock.getPlaylistTracks.mockReset();
    playlistApiMock.removeFromPlaylist.mockReset().mockResolvedValue(null);
    playlistApiMock.updatePlaylistMetadata.mockReset().mockResolvedValue(undefined);
    playbackApiMock.playTrack.mockReset().mockResolvedValue(undefined);
    playbackApiMock.setQueue.mockReset().mockResolvedValue(undefined);

    playlistApiMock.getPlaylist
      .mockResolvedValueOnce(basePlaylist)
      .mockResolvedValueOnce({
        ...basePlaylist,
        name: 'Renamed Playlist',
        updated_at: '2026-03-02T00:00:00.000Z',
      });
    playlistApiMock.getPlaylistTracks.mockResolvedValue(tracks);

    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('prompt', vi.fn(() => 'Renamed Playlist'));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('dispatches refreshPlaylists after a successful rename', async () => {
    const refreshHandler = vi.fn();
    render(PlaylistDetailView, {
      props: { playlistId: 'playlist-1' },
      events: { refreshPlaylists: refreshHandler },
    });

    await screen.findByRole('heading', { name: 'After Hours' });
    await fireEvent.click(screen.getByRole('button', { name: /rename/i }));

    await waitFor(() => {
      expect(playlistApiMock.updatePlaylistMetadata).toHaveBeenCalledWith(
        'playlist-1',
        'Renamed Playlist',
        'Late-night rotation',
      );
      expect(refreshHandler).toHaveBeenCalledTimes(1);
    });
  });
});
