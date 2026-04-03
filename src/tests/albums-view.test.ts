// @vitest-environment jsdom

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Album } from '../lib/types';

const artworkMock = vi.hoisted(() => ({
  isTauri: false,
  convertFileSrc: vi.fn((path: string) => `asset://converted${path}`),
}));

vi.mock('../lib/utils/env', () => ({
  get isTauri() {
    return artworkMock.isTauri;
  },
}));

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: artworkMock.convertFileSrc,
}));

import AlbumsView from '../lib/views/AlbumsView.svelte';

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const albumsViewPath = path.resolve(testsRoot, '../lib/views/AlbumsView.svelte');

async function readAlbumsViewSource(): Promise<string> {
  return readFile(albumsViewPath, 'utf8');
}

function createAlbum(overrides: Pick<Album, 'id' | 'title'> & Partial<Album>): Album {
  const { id, title, ...rest } = overrides;

  return {
    id,
    title,
    artist_name: 'Example Artist',
    artwork_path: null,
    track_count: 10,
    duration: 2_400,
    date_added: '2026-03-01T00:00:00.000Z',
    ...rest,
  };
}

function getAlbumCard(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: title });
  const card = heading.closest('button');

  if (!(card instanceof HTMLElement)) {
    throw new Error(`Could not find album card for ${title}`);
  }

  return card;
}

beforeEach(() => {
  artworkMock.isTauri = false;
  artworkMock.convertFileSrc.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('AlbumsView cover art rendering', () => {
  it('migrates AlbumsView onto the shared page, panel, and empty-state primitives', async () => {
    const source = await readAlbumsViewSource();

    expect(source).toContain('PageHeader');
    expect(source).toContain('SurfacePanel');
    expect(source).toContain('EmptyState');
  });

  it('renders album artwork decoratively when artwork_path is available', () => {
    render(AlbumsView, {
      albums: [
        createAlbum({
          id: 'album-1',
          title: 'Midnight Echoes',
          artwork_path: '/covers/midnight-echoes.jpg',
        }),
      ],
    });

    const card = getAlbumCard('Midnight Echoes');
    const artwork = card.querySelector('img');

    expect(artwork?.tagName).toBe('IMG');
    expect(artwork?.getAttribute('src')).toBe('/covers/midnight-echoes.jpg');
    expect(artwork?.getAttribute('alt')).toBe('');
    expect(within(card).queryByRole('img')).toBeNull();
  });

  it('renders the disc fallback decoratively when artwork_path is missing', () => {
    render(AlbumsView, {
      albums: [
        createAlbum({
          id: 'album-2',
          title: 'Silent Orbit',
        }),
      ],
    });

    const card = getAlbumCard('Silent Orbit');
    const fallback = within(card).getByTestId('cover-art-placeholder');

    expect(fallback.tagName).toBe('DIV');
    expect(card.querySelector('img')).toBeNull();
    expect(within(card).queryByRole('img')).toBeNull();
    expect(fallback.getAttribute('aria-hidden')).toBe('true');
    expect(fallback.querySelector('.cover-art__disc')).toBeTruthy();
  });
});
