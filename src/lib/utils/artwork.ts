import { convertFileSrc } from '@tauri-apps/api/core';

import { isTauri } from './env';

export function resolveArtworkSrc(path: string | null | undefined): string | null {
  const trimmedPath = path?.trim();

  if (!trimmedPath) {
    return null;
  }

  // `convertFileSrc()` depends on the asset protocol + CSP allowance configured in
  // `src-tauri/Tauri.toml` for file-backed cover art to load inside the webview.
  return isTauri ? convertFileSrc(trimmedPath) : trimmedPath;
}
