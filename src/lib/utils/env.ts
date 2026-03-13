import { isTauri as isTauriApi } from '@tauri-apps/api/core';

export const isTauri = (() => {
  if (typeof window === 'undefined') {
    return false;
  }

  if (isTauriApi()) {
    return true;
  }

  return ('__TAURI_IPC__' in window) || ('__TAURI__' in window);
})();

export function whenTauri<T>(tauriFallback: () => T, webFallback: () => T): T {
  return isTauri ? tauriFallback() : webFallback();
}
