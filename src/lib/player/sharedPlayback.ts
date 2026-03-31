import { createPlaybackStore } from '../stores/playback';

export const sharedPlayback = createPlaybackStore();

let sharedPlaybackStarted = false;
let sharedPlaybackStartPromise: Promise<void> | null = null;

// App/root owns the shared playback lifecycle; leaf components should use the store
// without calling sharedPlayback.start()/destroy() directly.
export async function ensureSharedPlaybackStarted(): Promise<void> {
  if (sharedPlaybackStarted) {
    return;
  }

  if (!sharedPlaybackStartPromise) {
    sharedPlaybackStartPromise = sharedPlayback.start().then(() => {
      sharedPlaybackStarted = true;
    });
  }

  try {
    await sharedPlaybackStartPromise;
  } catch (error) {
    sharedPlaybackStartPromise = null;
    throw error;
  }
}

export function destroySharedPlayback(): void {
  if (!sharedPlaybackStarted) {
    return;
  }

  sharedPlayback.destroy();
  sharedPlaybackStarted = false;
  sharedPlaybackStartPromise = null;
}
