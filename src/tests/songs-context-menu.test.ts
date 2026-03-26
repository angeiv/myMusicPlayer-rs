// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';

import SongsContextMenu from '../lib/components/songs/SongsContextMenu.svelte';

afterEach(() => {
  cleanup();
});

describe('SongsContextMenu', () => {
  it('keeps the disabled add-to-playlist hint outside the menu while exposing it as the menu description', () => {
    render(SongsContextMenu, {
      props: {
        x: 120,
        y: 140,
        canAddToPlaylist: false,
        addToPlaylistHint: '请先创建歌单',
      },
    });

    const menu = screen.getByRole('menu', { name: '歌曲操作菜单' });
    const hintId = menu.getAttribute('aria-describedby');

    expect(hintId).toBeTruthy();

    const hint = document.getElementById(hintId ?? '');
    expect(hint?.textContent?.trim()).toBe('请先创建歌单');
    expect(hint === null ? null : menu.contains(hint)).toBe(false);
    expect(within(menu).queryByText('请先创建歌单')).toBeNull();

    const addToPlaylistAction = within(menu).getByRole('menuitem', { name: '加入歌单' });

    expect(addToPlaylistAction instanceof HTMLButtonElement && addToPlaylistAction.disabled).toBe(true);
    expect(addToPlaylistAction.getAttribute('aria-describedby')).toBe(hintId);
  });
});
