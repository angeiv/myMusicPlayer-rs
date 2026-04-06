// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';

import Sidebar from '../lib/layout/Sidebar.svelte';
import TopBar from '../lib/layout/TopBar.svelte';

afterEach(() => {
  cleanup();
});

describe('shell Chinese copy contract', () => {
  it('renders sidebar navigation in Chinese', () => {
    render(Sidebar, {
      props: {
        activeSection: 'home',
        activeLibraryView: 'songs',
        playlists: [],
        activePlaylistId: null,
        counts: {
          songs: 12,
          albums: 5,
          artists: 3,
        },
      },
    });

    expect(screen.getByRole('button', { name: '首页' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '音乐库' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '设置' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '歌曲 12' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '专辑 5' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '艺术家 3' })).toBeTruthy();
    expect(screen.getByText('播放列表')).toBeTruthy();
    expect(screen.getByText('还没有播放列表')).toBeTruthy();
  });

  it('renders top-bar search and maintenance affordances in Chinese', () => {
    render(TopBar, {
      props: {
        searchTerm: '',
        maintenance: null,
        showMaintenanceCue: false,
      },
    });

    expect(screen.queryByText('搜索、浏览并保持播放继续')).toBeNull();
    expect(screen.getByPlaceholderText('搜索歌曲、专辑、艺术家...')).toBeTruthy();
  });
});
