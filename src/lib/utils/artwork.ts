import { convertFileSrc } from '@tauri-apps/api/core';

import { isTauri } from './env';

export function resolveArtworkSrc(path: string | null | undefined): string | null {
  const trimmedPath = path?.trim();

  if (!trimmedPath) {
    return null;
  }

  return isTauri ? convertFileSrc(trimmedPath) : trimmedPath;
}
