export type TrackAvailability = 'available' | 'missing';

export interface Track {
  id: string;
  title: string;
  duration: number;
  track_number?: number | null;
  disc_number?: number | null;
  path: string;
  library_root?: string | null;
  size: number;
  file_mtime_ms?: number | null;
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
  availability: TrackAvailability;
  missing_since?: string | null;
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

export type ScanMode = 'full' | 'incremental';

export type ScanErrorKind = 'invalid_path' | 'walk' | 'read_metadata' | 'persist';

export interface ScanErrorSample {
  path: string;
  message: string;
  kind: ScanErrorKind;
}

export interface LibraryScanRequest {
  paths: string[];
  mode?: ScanMode | null;
}

export interface ScanStatus {
  phase: ScanPhase;
  mode?: ScanMode | null;
  started_at_ms?: number | null;
  ended_at_ms?: number | null;
  current_path?: string | null;
  processed_files: number;
  inserted_tracks: number;
  changed_tracks: number;
  unchanged_files: number;
  restored_tracks: number;
  missing_tracks: number;
  error_count: number;
  sample_errors: ScanErrorSample[];
}

export function createScanStatus(overrides: Partial<ScanStatus> = {}): ScanStatus {
  const sample_errors = overrides.sample_errors?.map((sample) => ({ ...sample })) ?? [];

  return {
    phase: 'idle',
    mode: null,
    started_at_ms: null,
    ended_at_ms: null,
    current_path: null,
    processed_files: 0,
    inserted_tracks: 0,
    changed_tracks: 0,
    unchanged_files: 0,
    restored_tracks: 0,
    missing_tracks: 0,
    error_count: 0,
    ...overrides,
    sample_errors,
  };
}

export interface LibraryWatcherScanRequest {
  requested_at_ms: number;
  roots: string[];
}

export interface LibraryWatcherTriggerMetadata {
  triggered_at_ms: number;
  event_count: number;
  observed_paths: string[];
  dirty_roots: string[];
}

export interface LibraryWatcherStatus {
  watched_roots: string[];
  dirty_roots: string[];
  queued_follow_up: boolean;
  active_scan_phase?: ScanPhase | null;
  last_requested_scan?: LibraryWatcherScanRequest | null;
  last_trigger?: LibraryWatcherTriggerMetadata | null;
  last_error?: string | null;
}

function cloneLibraryWatcherScanRequest(
  request?: LibraryWatcherScanRequest | null,
): LibraryWatcherScanRequest | null {
  if (!request) {
    return null;
  }

  return {
    ...request,
    roots: [...request.roots],
  };
}

function cloneLibraryWatcherTriggerMetadata(
  trigger?: LibraryWatcherTriggerMetadata | null,
): LibraryWatcherTriggerMetadata | null {
  if (!trigger) {
    return null;
  }

  return {
    ...trigger,
    observed_paths: [...trigger.observed_paths],
    dirty_roots: [...trigger.dirty_roots],
  };
}

export function createLibraryWatcherStatus(
  overrides: Partial<LibraryWatcherStatus> = {},
): LibraryWatcherStatus {
  const watched_roots = [...(overrides.watched_roots ?? [])];
  const dirty_roots = [...(overrides.dirty_roots ?? [])];
  const last_requested_scan = cloneLibraryWatcherScanRequest(overrides.last_requested_scan);
  const last_trigger = cloneLibraryWatcherTriggerMetadata(overrides.last_trigger);

  const status: LibraryWatcherStatus = {
    watched_roots: [],
    dirty_roots: [],
    queued_follow_up: false,
    active_scan_phase: null,
    last_requested_scan: null,
    last_trigger: null,
    last_error: null,
    ...overrides,
  };

  status.watched_roots = watched_roots;
  status.dirty_roots = dirty_roots;
  status.last_requested_scan = last_requested_scan;
  status.last_trigger = last_trigger;

  return status;
}
