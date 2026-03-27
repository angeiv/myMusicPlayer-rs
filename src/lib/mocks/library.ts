import type { Album, Artist, Playlist, SearchResults, Track } from '../types';

const ARTIST_A_ID = '11111111-1111-1111-1111-111111111111';
const ARTIST_B_ID = '11111111-1111-1111-1111-222222222222';
const ARTIST_C_ID = '11111111-1111-1111-1111-333333333333';

const ALBUM_A_ID = '22222222-2222-2222-2222-111111111111';
const ALBUM_B_ID = '22222222-2222-2222-2222-222222222222';
const ALBUM_C_ID = '22222222-2222-2222-2222-333333333333';

const PLAYLIST_A_ID = '33333333-3333-3333-3333-111111111111';
const PLAYLIST_B_ID = '33333333-3333-3333-3333-222222222222';

const mockArtists: Artist[] = [
  {
    id: ARTIST_A_ID,
    name: 'Aurora Finch',
    bio: 'Neo-classical electronica composer blending analog synths with chamber strings.',
    artwork: null,
    album_count: 2,
    track_count: 12,
    date_added: '2024-02-01T09:20:00Z',
  },
  {
    id: ARTIST_B_ID,
    name: 'Neon Rivers',
    bio: 'Downtempo producer crafting slow-burning, cinematic grooves.',
    artwork: null,
    album_count: 1,
    track_count: 6,
    date_added: '2024-01-18T15:45:00Z',
  },
  {
    id: ARTIST_C_ID,
    name: 'Lena Park',
    bio: null,
    artwork: null,
    album_count: 1,
    track_count: 4,
    date_added: '2024-03-04T11:05:00Z',
  },
];

const mockAlbums: Album[] = [
  {
    id: ALBUM_A_ID,
    title: 'Midnight Echoes',
    artist_id: ARTIST_A_ID,
    artist_name: 'Aurora Finch',
    year: 2022,
    genre: 'Electronica',
    artwork: null,
    track_count: 6,
    duration: 1725,
    date_added: '2024-02-10T10:00:00Z',
  },
  {
    id: ALBUM_B_ID,
    title: 'Sunset Sketches',
    artist_id: ARTIST_A_ID,
    artist_name: 'Aurora Finch',
    year: 2021,
    genre: 'Modern Classical',
    artwork: null,
    track_count: 6,
    duration: 1654,
    date_added: '2024-02-10T10:30:00Z',
  },
  {
    id: ALBUM_C_ID,
    title: 'Tidal Currents',
    artist_id: ARTIST_B_ID,
    artist_name: 'Neon Rivers',
    year: 2020,
    genre: 'Downtempo',
    artwork: null,
    track_count: 6,
    duration: 1878,
    date_added: '2024-01-20T09:15:00Z',
  },
];

const mockTracks: Track[] = [
  {
    id: '44444444-4444-4444-4444-111111111111',
    title: 'Silver Skyline',
    duration: 234,
    track_number: 1,
    disc_number: 1,
    path: '/music/aurora_finch/midnight_echoes/01_silver_skyline.flac',
    size: 34_582_912,
    format: 'flac',
    bitrate: 9216,
    sample_rate: 48_000,
    channels: 2,
    artist_id: ARTIST_A_ID,
    artist_name: 'Aurora Finch',
    album_artist_id: ARTIST_A_ID,
    album_artist_name: 'Aurora Finch',
    album_id: ALBUM_A_ID,
    album_title: 'Midnight Echoes',
    year: 2022,
    genre: 'Electronica',
    artwork: null,
    lyrics: null,
    play_count: 18,
    last_played: '2024-05-12T07:15:00Z',
    date_added: '2024-02-10T10:02:00Z',
  },
  {
    id: '44444444-4444-4444-4444-111111111112',
    title: 'Lantern Bloom',
    duration: 286,
    track_number: 2,
    disc_number: 1,
    path: '/music/aurora_finch/midnight_echoes/02_lantern_bloom.flac',
    size: 38_487_040,
    format: 'flac',
    bitrate: 9216,
    sample_rate: 48_000,
    channels: 2,
    artist_id: ARTIST_A_ID,
    artist_name: 'Aurora Finch',
    album_artist_id: ARTIST_A_ID,
    album_artist_name: 'Aurora Finch',
    album_id: ALBUM_A_ID,
    album_title: 'Midnight Echoes',
    year: 2022,
    genre: 'Electronica',
    artwork: null,
    lyrics: null,
    play_count: 12,
    last_played: '2024-05-10T19:45:00Z',
    date_added: '2024-02-10T10:04:00Z',
  },
  {
    id: '44444444-4444-4444-4444-111111111113',
    title: 'Chasing Constellations',
    duration: 301,
    track_number: 3,
    disc_number: 1,
    path: '/music/aurora_finch/midnight_echoes/03_chasing_constellations.flac',
    size: 41_932_800,
    format: 'flac',
    bitrate: 9216,
    sample_rate: 48_000,
    channels: 2,
    artist_id: ARTIST_A_ID,
    artist_name: 'Aurora Finch',
    album_artist_id: ARTIST_A_ID,
    album_artist_name: 'Aurora Finch',
    album_id: ALBUM_A_ID,
    album_title: 'Midnight Echoes',
    year: 2022,
    genre: 'Electronica',
    artwork: null,
    lyrics: null,
    play_count: 9,
    last_played: '2024-04-30T21:00:00Z',
    date_added: '2024-02-10T10:07:00Z',
  },
  {
    id: '44444444-4444-4444-4444-222222222221',
    title: 'Golden Hour',
    duration: 248,
    track_number: 1,
    disc_number: 1,
    path: '/music/aurora_finch/sunset_sketches/01_golden_hour.flac',
    size: 36_437_504,
    format: 'flac',
    bitrate: 9216,
    sample_rate: 48_000,
    channels: 2,
    artist_id: ARTIST_A_ID,
    artist_name: 'Aurora Finch',
    album_artist_id: ARTIST_A_ID,
    album_artist_name: 'Aurora Finch',
    album_id: ALBUM_B_ID,
    album_title: 'Sunset Sketches',
    year: 2021,
    genre: 'Modern Classical',
    artwork: null,
    lyrics: null,
    play_count: 6,
    last_played: '2024-04-22T17:25:00Z',
    date_added: '2024-02-10T10:32:00Z',
  },
  {
    id: '44444444-4444-4444-4444-222222222222',
    title: 'Mist Over the Harbour',
    duration: 312,
    track_number: 2,
    disc_number: 1,
    path: '/music/aurora_finch/sunset_sketches/02_mist_over_the_harbour.flac',
    size: 42_991_616,
    format: 'flac',
    bitrate: 9216,
    sample_rate: 48_000,
    channels: 2,
    artist_id: ARTIST_A_ID,
    artist_name: 'Aurora Finch',
    album_artist_id: ARTIST_A_ID,
    album_artist_name: 'Aurora Finch',
    album_id: ALBUM_B_ID,
    album_title: 'Sunset Sketches',
    year: 2021,
    genre: 'Modern Classical',
    artwork: null,
    lyrics: null,
    play_count: 4,
    last_played: null,
    date_added: '2024-02-10T10:34:00Z',
  },
  {
    id: '44444444-4444-4444-4444-333333333331',
    title: 'Glass Shoreline',
    duration: 278,
    track_number: 1,
    disc_number: 1,
    path: '/music/neon_rivers/tidal_currents/01_glass_shoreline.flac',
    size: 39_464_960,
    format: 'flac',
    bitrate: 9216,
    sample_rate: 48_000,
    channels: 2,
    artist_id: ARTIST_B_ID,
    artist_name: 'Neon Rivers',
    album_artist_id: ARTIST_B_ID,
    album_artist_name: 'Neon Rivers',
    album_id: ALBUM_C_ID,
    album_title: 'Tidal Currents',
    year: 2020,
    genre: 'Downtempo',
    artwork: null,
    lyrics: null,
    play_count: 21,
    last_played: '2024-05-01T12:10:00Z',
    date_added: '2024-01-20T09:18:00Z',
  },
  {
    id: '44444444-4444-4444-4444-333333333332',
    title: 'Moonlit Ferry',
    duration: 305,
    track_number: 2,
    disc_number: 1,
    path: '/music/neon_rivers/tidal_currents/02_moonlit_ferry.flac',
    size: 43_163_648,
    format: 'flac',
    bitrate: 9216,
    sample_rate: 48_000,
    channels: 2,
    artist_id: ARTIST_B_ID,
    artist_name: 'Neon Rivers',
    album_artist_id: ARTIST_B_ID,
    album_artist_name: 'Neon Rivers',
    album_id: ALBUM_C_ID,
    album_title: 'Tidal Currents',
    year: 2020,
    genre: 'Downtempo',
    artwork: null,
    lyrics: null,
    play_count: 19,
    last_played: '2024-05-03T22:18:00Z',
    date_added: '2024-01-20T09:23:00Z',
  },
  {
    id: '44444444-4444-4444-4444-444444444441',
    title: 'Autumn Letters',
    duration: 242,
    track_number: 1,
    disc_number: 1,
    path: '/music/lena_park/autumn_letters/01_autumn_letters.flac',
    size: 33_767_424,
    format: 'flac',
    bitrate: 9216,
    sample_rate: 44_100,
    channels: 2,
    artist_id: ARTIST_C_ID,
    artist_name: 'Lena Park',
    album_artist_id: ARTIST_C_ID,
    album_artist_name: 'Lena Park',
    album_id: null,
    album_title: null,
    year: 2023,
    genre: 'Indie Folk',
    artwork: null,
    lyrics: null,
    play_count: 7,
    last_played: '2024-04-18T08:30:00Z',
    date_added: '2024-03-05T08:00:00Z',
  },
];

const basePlaylists: Playlist[] = [
  {
    id: PLAYLIST_A_ID,
    name: 'Morning Focus',
    description: 'Gentle builds and shimmering textures to start the day.',
    track_ids: [
      '44444444-4444-4444-4444-111111111111',
      '44444444-4444-4444-4444-222222222221',
      '44444444-4444-4444-4444-333333333332',
    ],
    artwork: null,
    created_at: '2024-02-12T07:00:00Z',
    updated_at: '2024-02-14T09:45:00Z',
  },
  {
    id: PLAYLIST_B_ID,
    name: 'City After Dark',
    description: 'Late night rhythms with an analog glow.',
    track_ids: [
      '44444444-4444-4444-4444-333333333331',
      '44444444-4444-4444-4444-333333333332',
      '44444444-4444-4444-4444-111111111112',
    ],
    artwork: null,
    created_at: '2024-02-20T21:10:00Z',
    updated_at: '2024-03-01T22:05:00Z',
  },
];

let playlistsState: Playlist[] = [...basePlaylists];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function getMockTracks(): Track[] {
  return clone(mockTracks);
}

export function getMockAlbums(): Album[] {
  return clone(mockAlbums);
}

export function getMockArtists(): Artist[] {
  return clone(mockArtists);
}

export function getMockPlaylists(): Playlist[] {
  return clone(playlistsState);
}

export function addMockPlaylist(name: string): Playlist {
  const now = new Date().toISOString();
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `mock-playlist-${Math.random().toString(36).slice(2, 10)}`;
  const newPlaylist: Playlist = {
    id,
    name,
    description: 'Personal mix created in mock mode.',
    track_ids: [],
    artwork: null,
    created_at: now,
    updated_at: now,
  };

  playlistsState = [newPlaylist, ...playlistsState];
  return clone(newPlaylist);
}

export function resetMockPlaylists(): void {
  playlistsState = [...basePlaylists];
}

export function getMockAlbumById(id: string | null | undefined): Album | null {
  if (!id) return null;
  return clone(mockAlbums.find((album) => album.id === id) ?? null);
}

export function getMockArtistById(id: string | null | undefined): Artist | null {
  if (!id) return null;
  return clone(mockArtists.find((artist) => artist.id === id) ?? null);
}

export function getMockTracksByAlbum(id: string | null | undefined): Track[] {
  if (!id) return [];
  return clone(mockTracks.filter((track) => track.album_id === id));
}

export function getMockTracksByArtist(id: string | null | undefined): Track[] {
  if (!id) return [];
  return clone(mockTracks.filter((track) => track.artist_id === id));
}

export function getMockAlbumsByArtist(id: string | null | undefined): Album[] {
  if (!id) return [];
  return clone(mockAlbums.filter((album) => album.artist_id === id));
}

export function getMockPlaylistById(id: string | null | undefined): Playlist | null {
  if (!id) return null;
  const playlist = playlistsState.find((item) => item.id === id);
  return playlist ? clone(playlist) : null;
}

export function getMockPlaylistTracks(id: string | null | undefined): Track[] {
  if (!id) return [];
  const playlist = playlistsState.find((item) => item.id === id);
  if (!playlist) return [];
  return clone(
    playlist.track_ids
      .map((trackId) => mockTracks.find((track) => track.id === trackId))
      .filter(Boolean) as Track[],
  );
}

export function appendMockTrackToPlaylist(id: string, trackId: string): void {
  const playlist = playlistsState.find((item) => item.id === id);
  if (!playlist) return;
  playlist.track_ids.push(trackId);
  playlist.updated_at = new Date().toISOString();
}

export function removeMockTrackFromPlaylist(id: string, index: number): void {
  const playlist = playlistsState.find((item) => item.id === id);
  if (!playlist) return;
  if (index < 0 || index >= playlist.track_ids.length) return;
  playlist.track_ids.splice(index, 1);
  playlist.updated_at = new Date().toISOString();
}

export function renameMockPlaylist(id: string, name: string): void {
  const playlist = playlistsState.find((item) => item.id === id);
  if (!playlist) return;
  playlist.name = name;
  playlist.updated_at = new Date().toISOString();
}

export function searchMockLibrary(query: string): SearchResults {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return { tracks: [], albums: [], artists: [] };
  }

  const trackMatches = mockTracks.filter((track) => {
    return (
      track.title.toLowerCase().includes(normalized) ||
      (track.artist_name ?? '').toLowerCase().includes(normalized) ||
      (track.album_title ?? '').toLowerCase().includes(normalized)
    );
  });

  const albumMatches = mockAlbums.filter((album) => {
    return (
      album.title.toLowerCase().includes(normalized) ||
      (album.artist_name ?? '').toLowerCase().includes(normalized)
    );
  });

  const artistMatches = mockArtists.filter((artist) =>
    artist.name.toLowerCase().includes(normalized),
  );

  return {
    tracks: clone(trackMatches),
    albums: clone(albumMatches),
    artists: clone(artistMatches),
  };
}

export function getMockLibraryOverview(): {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[];
} {
  return {
    tracks: getMockTracks(),
    albums: getMockAlbums(),
    artists: getMockArtists(),
    playlists: getMockPlaylists(),
  };
}
