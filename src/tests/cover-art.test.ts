// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import CoverArt from '../lib/components/CoverArt.svelte';
import { resolveArtworkSrc } from '../lib/utils/artwork';

const MOCK_ARTWORK_DATA_URI =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgMTIwIj48cmVjdCB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjI0IiBmaWxsPSIjMWUyOTNiIi8+PGNpcmNsZSBjeD0iNjAiIGN5PSI2MCIgcj0iMzIiIGZpbGw9IiM2MGE1ZmEiLz48Y2lyY2xlIGN4PSI2MCIgY3k9IjYwIiByPSIxMCIgZmlsbD0iIzBmMTcyYSIvPjwvc3ZnPg==';

beforeEach(() => {
  artworkMock.isTauri = false;
  artworkMock.convertFileSrc.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('resolveArtworkSrc', () => {
  it('returns the original path outside tauri', () => {
    expect(resolveArtworkSrc('/covers/midnight-echoes.jpg')).toBe('/covers/midnight-echoes.jpg');
    expect(resolveArtworkSrc(null)).toBeNull();
    expect(artworkMock.convertFileSrc).not.toHaveBeenCalled();
  });

  it('converts filesystem artwork paths in tauri', () => {
    artworkMock.isTauri = true;

    expect(resolveArtworkSrc('/covers/midnight-echoes.jpg')).toBe(
      'asset://converted/covers/midnight-echoes.jpg'
    );
    expect(artworkMock.convertFileSrc).toHaveBeenCalledWith('/covers/midnight-echoes.jpg');
  });
});

describe('CoverArt', () => {
  it('renders the disc fallback instead of an img when artworkPath is missing', () => {
    const { container } = render(CoverArt, {
      artworkPath: null,
      title: 'Midnight Echoes',
    });

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTestId('cover-art-placeholder')).toBeTruthy();
  });

  it('falls back to the disc placeholder after an image load error', async () => {
    const { container } = render(CoverArt, {
      artworkPath: MOCK_ARTWORK_DATA_URI,
      title: 'Midnight Echoes',
    });

    const image = container.querySelector('img');
    expect(image).toBeTruthy();

    if (!image) {
      throw new Error('Expected the cover image to render before simulating an error.');
    }

    await fireEvent.error(image);

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTestId('cover-art-placeholder')).toBeTruthy();
  });
});
