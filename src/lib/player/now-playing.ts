import { writable } from 'svelte/store';

export type NowPlayingTab = 'lyrics' | 'queue';

export type NowPlayingState = {
  isOpen: boolean;
  activeTab: NowPlayingTab;
};

export type NowPlayingStore = {
  state: ReturnType<typeof writable<NowPlayingState>>;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setActiveTab: (tab: NowPlayingTab) => void;
};

const initialState = (): NowPlayingState => ({
  isOpen: false,
  activeTab: 'lyrics',
});

export function createNowPlayingStore(): NowPlayingStore {
  const state = writable<NowPlayingState>(initialState());

  function open(): void {
    state.set({ isOpen: true, activeTab: 'lyrics' });
  }

  function close(): void {
    state.update((current) => ({ ...current, isOpen: false }));
  }

  function toggle(): void {
    state.update((current) =>
      current.isOpen ? { ...current, isOpen: false } : { isOpen: true, activeTab: 'lyrics' }
    );
  }

  function setActiveTab(tab: NowPlayingTab): void {
    state.update((current) => ({ ...current, activeTab: tab }));
  }

  return {
    state,
    open,
    close,
    toggle,
    setActiveTab,
  };
}

export const nowPlayingUi = createNowPlayingStore();
