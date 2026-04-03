// @vitest-environment jsdom

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const artworkMock = vi.hoisted(() => ({
  isTauri: false,
  convertFileSrc: vi.fn((artworkPath: string) => `asset://converted${artworkPath}`),
}));

vi.mock('../lib/utils/env', () => ({
  get isTauri() {
    return artworkMock.isTauri;
  },
}));

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: artworkMock.convertFileSrc,
}));

import CoverArt from '../lib/components/CoverArt.svelte';

const MOCK_ARTWORK_DATA_URI =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgMTIwIj48cmVjdCB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjI0IiBmaWxsPSIjMWUyOTNiIi8+PGNpcmNsZSBjeD0iNjAiIGN5PSI2MCIgcj0iMzIiIGZpbGw9IiM2MGE1ZmEiLz48Y2lyY2xlIGN4PSI2MCIgY3k9IjYwIiByPSIxMCIgZmlsbD0iIzBmMTcyYSIvPjwvc3ZnPg==';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const coverArtPath = path.join(root, 'lib/components/CoverArt.svelte');

async function readCoverArtSource(): Promise<string> {
  return readFile(coverArtPath, 'utf8');
}

beforeEach(() => {
  artworkMock.isTauri = false;
  artworkMock.convertFileSrc.mockClear();
  document.documentElement.dataset['theme'] = 'dark';
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
});

describe('CoverArt bottom-bar geometry contract', () => {
  it('declares a dedicated bottom-bar geometry variant in source', async () => {
    const source = await readCoverArtSource();

    expect(source).toMatch(/export let variant:\s*'default'\s*\|\s*'bottom-bar'\s*=\s*'default';/);
    expect(source).toContain('data-cover-art-variant={variant}');
    expect(source).toContain('data-cover-art-shape={resolvedShape}');
    expect(source).toContain('data-cover-art-placeholder-style={resolvedPlaceholderStyle}');
    expect(source).toMatch(/\.cover-art--bottom-bar\s*\{[\s\S]*inline-size:\s*72px;/);
    expect(source).toMatch(/\.cover-art--bottom-bar\s*\{[\s\S]*block-size:\s*72px;/);
    expect(source).toMatch(/\.cover-art--bottom-bar\s*\{[\s\S]*aspect-ratio:\s*1(?:\s*\/\s*1)?;/);
    expect(source).toMatch(/\.cover-art--bottom-bar\s+\.cover-art__image\s*\{[\s\S]*object-fit:\s*cover;/);
    expect(source).toMatch(/\.cover-art--bottom-bar\s+\.cover-art__disc\s*\{[\s\S]*width:\s*54%;/);
  });

  for (const theme of ['dark', 'light'] as const) {
    it(`renders artwork and placeholder through the same bottom-bar square slot in ${theme}`, () => {
      document.documentElement.dataset['theme'] = theme;

      const artworkRender = render(CoverArt as any, {
        artworkPath: MOCK_ARTWORK_DATA_URI,
        title: 'Midnight Echoes',
        alt: '',
        variant: 'bottom-bar',
      });

      const artworkRoot = artworkRender.container.querySelector('[data-cover-art-variant="bottom-bar"]');
      const artworkImage = artworkRender.container.querySelector('img');

      expect(artworkRoot?.getAttribute('data-cover-art-shape')).toBe('rounded-square');
      expect(artworkImage?.getAttribute('alt')).toBe('');
      expect(within(artworkRoot as HTMLElement).queryByTestId('cover-art-placeholder')).toBeNull();

      cleanup();

      const placeholderRender = render(CoverArt as any, {
        artworkPath: null,
        title: 'Midnight Echoes',
        alt: '',
        variant: 'bottom-bar',
      });

      const placeholderRoot = placeholderRender.container.querySelector(
        '[data-cover-art-variant="bottom-bar"]'
      );
      const placeholder = within(placeholderRoot as HTMLElement).getByTestId('cover-art-placeholder');

      expect(placeholderRoot?.getAttribute('data-cover-art-shape')).toBe('rounded-square');
      expect(placeholder.getAttribute('data-cover-art-placeholder-style')).toBe('disc-hint');
      expect(placeholder.getAttribute('aria-hidden')).toBe('true');
    });
  }
});
