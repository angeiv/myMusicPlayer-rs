import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';

import { createNowPlayingStore } from '../lib/player/now-playing';

describe('now playing store', () => {
  it('resets active tab to lyrics whenever overlay is opened', () => {
    const store = createNowPlayingStore();

    store.open();
    store.setActiveTab('queue');
    store.close();
    store.open();

    expect(get(store.state)).toEqual({ isOpen: true, activeTab: 'lyrics' });
  });
});
