import type { ThemeOption } from '../../types';

export function applyThemeToDocument(theme: ThemeOption): void {
  if (typeof document === 'undefined') return;

  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

