import { isTauri } from '../utils/env';
import * as mock from './mock/playlist';
import * as tauri from './tauri/playlist';

const impl = isTauri ? tauri : mock;

export const createPlaylist = impl.createPlaylist;
export const getPlaylists = impl.getPlaylists;
export const getPlaylist = impl.getPlaylist;
export const getPlaylistTracks = impl.getPlaylistTracks;
export const addToPlaylist = impl.addToPlaylist;
export const removeFromPlaylist = impl.removeFromPlaylist;
export const updatePlaylistMetadata = impl.updatePlaylistMetadata;

