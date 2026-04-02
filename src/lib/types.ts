export interface Track {
  id: string;
  title: string;
  duration: number;
  track_number?: number | null;
  disc_number?: number | null;
  path: string;
  size: number;
  format: string;
  bitrate: number;
  sample_rate: number;
  channels: number;
  artist_id?: string | null;
  artist_name?: string | null;
  album_artist_id?: string | null;
  album_artist_name?: string | null;
  album_id?: string | null;
  album_title?: string | null;
  year?: number | null;
  genre?: string | null;
  artwork?: number[] | null;
  artwork_path?: string | null;
  lyrics?: string | null;
  play_count: number;
  last_played?: string | null;
  date_added: string;
}

export interface Album {
  id: string;
  title: string;
  artist_id?: string | null;
  artist_name?: string | null;
  year?: number | null;
  genre?: string | null;
  artwork?: number[] | null;
  artwork_path?: string | null;
  track_count: number;
  duration: number;
  date_added: string;
}

export interface Artist {
  id: string;
  name: string;
  bio?: string | null;
  artwork?: number[] | null;
  album_count: number;
  track_count: number;
  date_added: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string | null;
  track_ids: string[];
  artwork?: number[] | null;
  created_at: string;
  updated_at: string;
}

export type PlaybackStateInfo =
  | { state: 'stopped' }
  | { state: 'playing'; position: number; duration: number }
  | { state: 'paused'; position: number; duration: number }
  | { state: 'error'; message: string };

export interface SearchResults {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
}

export type LibraryView =
  | 'songs'
  | 'albums'
  | 'artists'
  | 'albumDetail'
  | 'artistDetail'
  | 'playlistDetail';

export type AppSection = 'home' | 'library' | 'settings';

export type ThemeOption = 'system' | 'light' | 'dark';

export interface AppConfig {
  library_paths: string[];
  default_volume: number;
  auto_scan: boolean;
  theme: ThemeOption;
  output_device_id?: string | null;
  play_mode?: string | null;

  last_track_id?: string | null;
  last_position_seconds?: number | null;
}

export interface OutputDeviceInfo {
  id: string;
  name: string;
  is_default: boolean;
}

export type ScanPhase = 'idle' | 'running' | 'cancelling' | 'completed' | 'cancelled' | 'failed';

export type ScanErrorKind = 'invalid_path' | 'walk' | 'read_metadata' | 'persist';

export interface ScanErrorSample {
  path: string;
  message: string;
  kind: ScanErrorKind;
}

export interface ScanStatus {
  phase: ScanPhase;
  started_at_ms?: number | null;
  ended_at_ms?: number | null;
  current_path?: string | null;
  processed_files: number;
  inserted_tracks: number;
  error_count: number;
  sample_errors: ScanErrorSample[];
}
