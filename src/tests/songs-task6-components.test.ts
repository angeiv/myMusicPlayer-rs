// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/svelte';
import type { Component, ComponentProps } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';

import SongsBulkActionBarComponent from '../lib/components/songs/SongsBulkActionBar.svelte';
import SongsContextMenuComponent from '../lib/components/songs/SongsContextMenu.svelte';
import SongsPlaylistPickerComponent from '../lib/components/songs/SongsPlaylistPicker.svelte';
import type { Playlist } from '../lib/types';

const SongsBulkActionBar = SongsBulkActionBarComponent as unknown as Component<
  ComponentProps<typeof SongsBulkActionBarComponent>
>;
const SongsContextMenu = SongsContextMenuComponent as unknown as Component<
  ComponentProps<typeof SongsContextMenuComponent>
>;
const SongsPlaylistPicker = SongsPlaylistPickerComponent as unknown as Component<
  ComponentProps<typeof SongsPlaylistPickerComponent>
>;

function createPlaylist(index: number): Playlist {
  return {
    id: `playlist-${index}`,
    name: `Playlist ${index}`,
    description: null,
    track_ids: Array.from({ length: index }, (_, itemIndex) => `track-${index}-${itemIndex}`),
    artwork: null,
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-01T00:00:00.000Z',
  };
}

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
    writable: true,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: height,
    writable: true,
  });
}

afterEach(() => {
  cleanup();
  setViewport(1024, 768);
});

describe('Task 6 songs presentation components', () => {
  it('shows a persistent live hint when the bulk add-to-playlist action is disabled', () => {
    render(SongsBulkActionBar, {
      props: {
        selectedCount: 2,
        canAddToPlaylist: false,
        addToPlaylistHint: '请先创建歌单',
      },
    });

    const action = screen.getByRole('button', { name: '加入歌单' });
    expect(action instanceof HTMLButtonElement ? action.disabled : false).toBe(true);

    const hint = screen.getByText('请先创建歌单');
    const liveRegion = hint.closest('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(action.getAttribute('aria-describedby')).toBe(liveRegion?.id ?? null);
  });

  it('shows a persistent live hint when the context-menu add-to-playlist action is disabled', () => {
    render(SongsContextMenu, {
      props: {
        x: 180,
        y: 120,
        canAddToPlaylist: false,
        addToPlaylistHint: '请先创建歌单',
      },
    });

    const action = screen.getByRole('menuitem', { name: '加入歌单' });
    expect(action instanceof HTMLButtonElement ? action.disabled : false).toBe(true);

    const hint = screen.getByText('请先创建歌单');
    const liveRegion = hint.closest('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(action.getAttribute('aria-describedby')).toBe(liveRegion?.id ?? null);
  });

  it('clamps the playlist picker within the viewport near the bottom-right edge and constrains its scrollable height', () => {
    setViewport(360, 420);

    render(SongsPlaylistPicker, {
      props: {
        anchor: DOMRect.fromRect({ x: 330, y: 380, width: 24, height: 24 }),
        playlists: Array.from({ length: 20 }, (_, index) => createPlaylist(index + 1)),
      },
    });

    const picker = screen.getByRole('dialog', { name: '选择歌单' });
    const list = screen.getByRole('list');

    expect(Number.parseFloat(picker.style.left)).toBeLessThan(330);
    expect(Number.parseFloat(picker.style.top)).toBeLessThan(380);
    expect(Number.parseFloat(picker.style.maxHeight)).toBeLessThanOrEqual(396);
    expect(Number.parseFloat(list.style.maxHeight)).toBeGreaterThan(0);
  });
});
