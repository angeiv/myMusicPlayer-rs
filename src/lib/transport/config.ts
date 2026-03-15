import type { ThemeOption } from '../types';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

export function normalizeTheme(value: unknown): ThemeOption {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function normalizeConfigForRestore(value: unknown): {
  theme: ThemeOption;
  outputDeviceId: string | null;
  defaultVolume: number | null;
  autoScan: boolean;
  libraryPaths: string[];
} {
  const record = isRecord(value) ? value : {};
  const theme = normalizeTheme(record['theme']);
  const outputDeviceId =
    typeof record['output_device_id'] === 'string' ? record['output_device_id'] : null;
  const defaultVolume = asFiniteNumber(record['default_volume']);
  const autoScan = asBoolean(record['auto_scan']) ?? false;
  const libraryPaths = asStringArray(record['library_paths']);

  return {
    theme,
    outputDeviceId,
    defaultVolume,
    autoScan,
    libraryPaths,
  };
}

export function normalizeConfigSession(value: unknown): {
  lastTrackId: string | null;
  lastPositionSeconds: number;
} {
  const record = isRecord(value) ? value : {};
  const lastTrackId = typeof record['last_track_id'] === 'string' ? record['last_track_id'] : null;
  const positionValue = record['last_position_seconds'];
  const parsed = typeof positionValue === 'string' ? Number(positionValue) : positionValue;
  const lastPositionSeconds = typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0;

  return {
    lastTrackId,
    lastPositionSeconds,
  };
}

export function normalizeConfigForSettings(
  value: unknown,
  fallbacks: { autoScan: boolean; defaultVolume: number; selectedDeviceId: string }
): {
  theme: ThemeOption;
  autoScan: boolean;
  defaultVolume: number;
  selectedDeviceId: string;
} {
  const record = isRecord(value) ? value : {};
  const theme = normalizeTheme(record['theme']);
  const autoScan = asBoolean(record['auto_scan']) ?? false;
  const defaultVolume = asFiniteNumber(record['default_volume']) ?? fallbacks.defaultVolume;
  const selectedDeviceId =
    typeof record['output_device_id'] === 'string' && record['output_device_id']
      ? record['output_device_id']
      : fallbacks.selectedDeviceId;

  return {
    theme,
    autoScan,
    defaultVolume,
    selectedDeviceId,
  };
}
