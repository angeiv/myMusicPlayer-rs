import { isTauri } from '../utils/env';
import * as mock from './mock/library';
import * as tauri from './tauri/library';

const impl = isTauri ? tauri : mock;

export const scanDirectory = impl.scanDirectory;
export const hasLibraryTracks = impl.hasLibraryTracks;
export const startLibraryScan = impl.startLibraryScan;
export const getLibraryScanStatus = impl.getLibraryScanStatus;
export const cancelLibraryScan = impl.cancelLibraryScan;
export const getTracks = impl.getTracks;
export const getTrack = impl.getTrack;
export const getAlbums = impl.getAlbums;
export const getAlbum = impl.getAlbum;
export const getArtists = impl.getArtists;
export const getArtist = impl.getArtist;
export const getTracksByAlbum = impl.getTracksByAlbum;
export const getTracksByArtist = impl.getTracksByArtist;
export const getAlbumsByArtist = impl.getAlbumsByArtist;
export const searchLibrary = impl.searchLibrary;

