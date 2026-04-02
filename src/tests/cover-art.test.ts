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
  it('keeps the same default accessible name when the image falls back to the placeholder', async () => {
    const { container } = render(CoverArt, {
      artworkPath: MOCK_ARTWORK_DATA_URI,
      title: 'Midnight Echoes',
    });

    const image = container.querySelector('img');
    const accessibleImage = screen.getByRole('img');
    const defaultAlt = image?.getAttribute('alt');

    expect(accessibleImage.tagName).toBe('IMG');
    expect(defaultAlt).toBeTruthy();

    if (!image || !defaultAlt) {
      throw new Error('Expected the cover image to render with a default accessible name before fallback.');
    }

    await fireEvent.error(image);

    const placeholder = screen.getByTestId('cover-art-placeholder');

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('img')).toBe(placeholder);
    expect(placeholder.getAttribute('aria-label')).toBe(defaultAlt);
  });

  it('preserves a custom alt label after the image falls back to the placeholder', async () => {
    const alt = 'Album art for Midnight Echoes';
    const { container } = render(CoverArt, {
      artworkPath: MOCK_ARTWORK_DATA_URI,
      title: 'Midnight Echoes',
      alt,
    });

    const image = container.querySelector('img');
    expect(image?.getAttribute('alt')).toBe(alt);
    expect(screen.getByRole('img', { name: alt })).toBeTruthy();

    if (!image) {
      throw new Error('Expected the cover image to render before simulating an error.');
    }

    await fireEvent.error(image);

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('img', { name: alt })).toBeTruthy();
    expect(screen.getByTestId('cover-art-placeholder')).toBeTruthy();
  });

  it('supports decorative cover art without exposing fallback artwork to assistive tech', async () => {
    const { container } = render(CoverArt, {
      artworkPath: MOCK_ARTWORK_DATA_URI,
      title: 'Midnight Echoes',
      alt: '',
    });

    const image = container.querySelector('img');
    expect(image?.getAttribute('alt')).toBe('');
    expect(screen.queryByRole('img')).toBeNull();

    if (!image) {
      throw new Error('Expected the cover image to render before simulating an error.');
    }

    await fireEvent.error(image);

    const placeholder = screen.getByTestId('cover-art-placeholder');

    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(placeholder.getAttribute('aria-hidden')).toBe('true');
  });
});
