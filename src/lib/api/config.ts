import { isTauri } from '../utils/env';
import * as mock from './mock/config';
import * as tauri from './tauri/config';

const impl = isTauri ? tauri : mock;

export const bootstrapDesktopShell = impl.bootstrapDesktopShell;
export const getConfig = impl.getConfig;
export const getAppVersion = impl.getAppVersion;
export const saveConfig = impl.saveConfig;
export const setLastSession = impl.setLastSession;
export const getLibraryPaths = impl.getLibraryPaths;
export const pickAndAddLibraryFolder = impl.pickAndAddLibraryFolder;
export const removeLibraryPath = impl.removeLibraryPath;
export const greet = impl.greet;

