export const isTauri =
  typeof window !== 'undefined' &&
  (('__TAURI_IPC__' in window) || ('__TAURI__' in window));

export function whenTauri<T>(tauriFallback: () => T, webFallback: () => T): T {
  return isTauri ? tauriFallback() : webFallback();
}
