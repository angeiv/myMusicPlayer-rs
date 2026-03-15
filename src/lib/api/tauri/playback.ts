import { invoke } from '@tauri-apps/api/core';

import type { OutputDeviceInfo, PlaybackStateInfo, Track } from '../../types';
import { normalizePlaybackState, resolveBackendPlayMode, type BackendPlayMode, type RepeatMode } from '../../transport/playback';

export async function getOutputDevices(): Promise<OutputDeviceInfo[]> {
  const payload = await invoke<OutputDeviceInfo[] | undefined>('get_output_devices');
  return payload ?? [];
}

export async function getOutputDevice(): Promise<string | null> {
  const payload = await invoke<string | null | undefined>('get_output_device');
  return payload ?? null;
}

export async function setOutputDevice(deviceId: string): Promise<void> {
  const normalized = deviceId === 'default' ? null : deviceId;
  await invoke('set_output_device', { deviceId: normalized });
}

export async function getVolume(): Promise<number> {
  const payload = await invoke<number | undefined>('get_volume');
  return typeof payload === 'number' ? payload : 1;
}

export async function setVolume(volume: number): Promise<void> {
  await invoke('set_volume', { volume });
}

export async function getPlayMode(): Promise<BackendPlayMode> {
  const payload = await invoke<string | undefined>('get_play_mode');
  return payload ?? 'sequential';
}

export async function setPlayMode(mode: BackendPlayMode): Promise<void> {
  await invoke('set_play_mode', { mode });
}

export async function setPlayModeFromUi(shuffleEnabled: boolean, repeatMode: RepeatMode): Promise<void> {
  const mode = resolveBackendPlayMode(shuffleEnabled, repeatMode);
  await setPlayMode(mode);
}

export async function getQueue(): Promise<Track[]> {
  const payload = await invoke<Track[] | undefined>('get_queue');
  return payload ?? [];
}

export async function setQueue(tracks: Track[]): Promise<void> {
  await invoke('set_queue', { tracks });
}

export async function playTrack(track: Track): Promise<void> {
  await invoke('play', { track });
}

export async function pausePlayback(): Promise<void> {
  await invoke('pause');
}

export async function resumePlayback(): Promise<void> {
  await invoke('resume');
}

export async function seekTo(position: number): Promise<void> {
  await invoke('seek', { position });
}

export async function getPlaybackState(): Promise<PlaybackStateInfo> {
  const payload = await invoke<unknown>('get_playback_state');
  return normalizePlaybackState(payload);
}

export async function getCurrentTrack(): Promise<Track | null> {
  const payload = await invoke<Track | null | undefined>('get_current_track');
  return payload ?? null;
}

export async function pickAndPlayFile(): Promise<void> {
  await invoke('pick_and_play_file');
}

export async function playNextTrack(): Promise<void> {
  await invoke('next_track');
}

export async function playPreviousTrack(): Promise<void> {
  await invoke('previous_track');
}

export async function togglePlayPause(): Promise<boolean> {
  const payload = await invoke<boolean>('toggle_play_pause');
  return payload;
}

