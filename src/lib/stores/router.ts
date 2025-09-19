import { readable } from 'svelte/store';

type NavigateOptions = { replace?: boolean };

let setPath: ((value: string) => void) | null = null;
let currentPath = '/';

function decodeAndEncode(segment: string): string {
  if (segment === '') {
    return '';
  }

  try {
    return encodeURIComponent(decodeURIComponent(segment));
  } catch {
    return encodeURIComponent(segment);
  }
}

export function normalizeHashPath(path: string): string {
  if (!path) {
    return '/';
  }

  const prefixed = path.startsWith('/') ? path : `/${path}`;
  const segments = prefixed
    .split('/')
    .map((segment, index) => (index === 0 ? '' : decodeAndEncode(segment)));
  const normalized = segments.join('/').replace(/\/{2,}/g, '/');
  return normalized || '/';
}

function readHashFromLocation(): string {
  if (typeof window === 'undefined') {
    return '/';
  }

  const raw = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;

  return normalizeHashPath(raw);
}

export const hashPath = readable<string>(currentPath, (set) => {
  if (typeof window === 'undefined') {
    set('/');
    return () => {};
  }

  const update = () => {
    const value = readHashFromLocation();
    currentPath = value;
    set(value);
  };

  setPath = (value: string) => {
    currentPath = value;
    set(value);
  };

  update();
  window.addEventListener('hashchange', update);

  return () => {
    setPath = null;
    window.removeEventListener('hashchange', update);
  };
});

export function navigate(path: string, options: NavigateOptions = {}): void {
  if (typeof window === 'undefined') {
    return;
  }

  const normalized = normalizeHashPath(path);
  if (normalized === currentPath) {
    return;
  }

  if (options.replace) {
    const url = new URL(window.location.href);
    url.hash = normalized;
    history.replaceState(null, '', url);
    setPath?.(normalized);
  } else {
    currentPath = normalized;
    window.location.hash = normalized;
  }
}
