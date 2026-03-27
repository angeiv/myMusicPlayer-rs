import type { OutputDeviceInfo, PlaybackStateInfo, Track } from '../../types';
import { resolveBackendPlayMode, type BackendPlayMode, type RepeatMode } from '../../transport/playback';
import { getMockTracks } from '../../mocks/library';

let queue: Track[] = [];
let currentTrack: Track | null = null;
let playbackState: PlaybackStateInfo = { state: 'stopped' };
let volume = 0.7;
let playMode: BackendPlayMode = 'sequential';
let selectedDeviceId: string | null = null;

const outputDevices: OutputDeviceInfo[] = [{ id: 'default', name: 'System default', is_default: true }];

function ensureQueueSeeded(): void {
  if (queue.length > 0) return;
  queue = getMockTracks().slice(0, 12);
}

export async function getOutputDevices(): Promise<OutputDeviceInfo[]> {
  return outputDevices;
}

export async function getOutputDevice(): Promise<string | null> {
  return selectedDeviceId;
}

export async function setOutputDevice(deviceId: string): Promise<void> {
  selectedDeviceId = deviceId === 'default' ? null : deviceId;
}

export async function getVolume(): Promise<number> {
  return volume;
}

export async function setVolume(next: number): Promise<void> {
  volume = Math.min(Math.max(next, 0), 1);
}

export async function getPlayMode(): Promise<BackendPlayMode> {
  return playMode;
}

export async function setPlayMode(mode: BackendPlayMode): Promise<void> {
  playMode = mode;
}

export async function setPlayModeFromUi(shuffleEnabled: boolean, repeatMode: RepeatMode): Promise<void> {
  await setPlayMode(resolveBackendPlayMode(shuffleEnabled, repeatMode));
}

export async function getQueue(): Promise<Track[]> {
  ensureQueueSeeded();
  return queue;
}

export async function setQueue(tracks: Track[]): Promise<void> {
  queue = tracks.slice();
}

export async function addToQueue(tracks: Track[]): Promise<void> {
  queue = [...queue, ...tracks.map((track) => ({ ...track }))];
}

export async function playTrack(track: Track): Promise<void> {
  currentTrack = track;
  playbackState = { state: 'playing', position: 0, duration: track.duration };
}

export async function pausePlayback(): Promise<void> {
  if (playbackState.state === 'playing') {
    playbackState = { state: 'paused', position: playbackState.position, duration: playbackState.duration };
  }
}

export async function resumePlayback(): Promise<void> {
  if (playbackState.state === 'paused') {
    playbackState = { state: 'playing', position: playbackState.position, duration: playbackState.duration };
  }
}

export async function seekTo(position: number): Promise<void> {
  if (playbackState.state === 'playing' || playbackState.state === 'paused') {
    playbackState = {
      ...playbackState,
      position: Math.max(0, Math.min(position, playbackState.duration)),
    };
  }
}

export async function getPlaybackState(): Promise<PlaybackStateInfo> {
  return playbackState;
}

export async function getCurrentTrack(): Promise<Track | null> {
  return currentTrack;
}

export async function pickAndPlayFile(): Promise<void> {
  ensureQueueSeeded();
  const first = queue[0];
  if (first) {
    await playTrack(first);
  }
}

export async function playNextTrack(): Promise<void> {
  ensureQueueSeeded();
  if (!currentTrack) {
    const first = queue[0];
    if (first) await playTrack(first);
    return;
  }

  const index = queue.findIndex((track) => track.id === currentTrack?.id);
  const next = queue[(index + 1) % queue.length];
  if (next) await playTrack(next);
}

export async function playPreviousTrack(): Promise<void> {
  ensureQueueSeeded();
  if (!currentTrack) {
    const first = queue[0];
    if (first) await playTrack(first);
    return;
  }

  const index = queue.findIndex((track) => track.id === currentTrack?.id);
  const previousIndex = (index - 1 + queue.length) % queue.length;
  const previous = queue[previousIndex];
  if (previous) await playTrack(previous);
}

export async function togglePlayPause(): Promise<boolean> {
  if (playbackState.state === 'playing') {
    await pausePlayback();
    return false;
  }

  if (playbackState.state === 'paused') {
    await resumePlayback();
    return true;
  }

  await pickAndPlayFile();
  return true;
}

