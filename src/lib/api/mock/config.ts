import type { AppConfig } from '../../types';

const STORAGE_KEY = 'mymusicplayer-config';

const defaultConfig: AppConfig = {
  library_paths: [],
  default_volume: 0.7,
  auto_scan: true,
  theme: 'system',
  output_device_id: null,
  play_mode: 'sequential',
  last_track_id: null,
  last_position_seconds: 0,
};

function loadConfigFromStorage(): AppConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AppConfig;
  } catch {
    return null;
  }
}

function saveConfigToStorage(config: AppConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore persistence errors in mock mode.
  }
}

export async function bootstrapDesktopShell(): Promise<void> {
  await greet('from svelte');
}

export async function getConfig(): Promise<AppConfig> {
  return loadConfigFromStorage() ?? defaultConfig;
}

export async function getAppVersion(): Promise<string> {
  return 'web';
}

export async function saveConfig(config: AppConfig): Promise<void> {
  saveConfigToStorage(config);
}

export async function setLastSession(lastTrackId: string | null, lastPositionSeconds: number): Promise<void> {
  const config = await getConfig();
  const next: AppConfig = {
    ...config,
    last_track_id: lastTrackId,
    last_position_seconds: lastTrackId ? lastPositionSeconds : 0,
  };
  saveConfigToStorage(next);
}

export async function getLibraryPaths(): Promise<string[]> {
  const config = await getConfig();
  return config.library_paths ?? [];
}

export async function pickAndAddLibraryFolder(): Promise<void> {
  return;
}

export async function removeLibraryPath(path: string): Promise<void> {
  const config = await getConfig();
  const next: AppConfig = {
    ...config,
    library_paths: (config.library_paths ?? []).filter((item) => item !== path),
  };
  saveConfigToStorage(next);
}

export async function greet(name: string): Promise<string> {
  return `Hello, ${name}!`;
}

