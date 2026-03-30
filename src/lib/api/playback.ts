import { isTauri } from '../utils/env';
import * as mock from './mock/playback';
import * as tauri from './tauri/playback';

const impl = isTauri ? tauri : mock;

export const getOutputDevices = impl.getOutputDevices;
export const getOutputDevice = impl.getOutputDevice;
export const setOutputDevice = impl.setOutputDevice;
export const getVolume = impl.getVolume;
export const setVolume = impl.setVolume;
export const getPlayMode = impl.getPlayMode;
export const setPlayMode = impl.setPlayMode;
export const setPlayModeFromUi = impl.setPlayModeFromUi;
export const getQueue = impl.getQueue;
export const setQueue = impl.setQueue;
export const addToQueue = impl.addToQueue;
export const playTrack = impl.playTrack;
export const pausePlayback = impl.pausePlayback;
export const resumePlayback = impl.resumePlayback;
export const seekTo = impl.seekTo;
export const getPlaybackState = impl.getPlaybackState;
export const getCurrentTrack = impl.getCurrentTrack;
export const pickAndPlayFile = impl.pickAndPlayFile;
export const playNextTrack = impl.playNextTrack;
export const playPreviousTrack = impl.playPreviousTrack;
export const togglePlayPause = impl.togglePlayPause;
export const clearQueue = impl.clearQueue;
export const removeFromQueue = impl.removeFromQueue;

