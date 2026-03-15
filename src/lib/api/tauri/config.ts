import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

import type { AppConfig } from '../../types';

export async function bootstrapDesktopShell(): Promise<void> {
  await greet('from svelte');
  await getCurrentWindow().show();
}

export async function getConfig(): Promise<AppConfig> {
  return invoke<AppConfig>('get_config');
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await invoke('save_config', { config });
}

export async function setLastSession(lastTrackId: string | null, lastPositionSeconds: number): Promise<void> {
  await invoke('set_last_session', { lastTrackId, lastPositionSeconds });
}

export async function getLibraryPaths(): Promise<string[]> {
  const payload = await invoke<string[] | undefined>('get_library_paths');
  return payload ?? [];
}

export async function pickAndAddLibraryFolder(): Promise<void> {
  await invoke('pick_and_add_library_folder');
}

export async function removeLibraryPath(path: string): Promise<void> {
  await invoke('remove_library_path', { path });
}

export async function greet(name: string): Promise<string> {
  return invoke<string>('greet', { name });
}

export async function getAppVersion(): Promise<string> {
  return getVersion();
}

