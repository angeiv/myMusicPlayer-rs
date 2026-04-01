import { createPlaybackStore } from '../stores/playback';

export const sharedPlayback = createPlaybackStore();

let sharedPlaybackStarted = false;
let sharedPlaybackStartPromise: Promise<void> | null = null;
let sharedPlaybackDesired = false;

// App/root owns the shared playback lifecycle; leaf components should use the store
// without calling sharedPlayback.start()/destroy() directly.
export async function ensureSharedPlaybackStarted(): Promise<void> {
  sharedPlaybackDesired = true;

  if (sharedPlaybackStarted) {
    return;
  }

  if (!sharedPlaybackStartPromise) {
    sharedPlaybackStartPromise = (async () => {
      try {
        await sharedPlayback.start();

        if (!sharedPlaybackDesired) {
          sharedPlayback.destroy();
          sharedPlaybackStarted = false;
          return;
        }

        sharedPlaybackStarted = true;
      } catch (error) {
        sharedPlaybackStarted = false;
        throw error;
      } finally {
        sharedPlaybackStartPromise = null;
      }
    })();
  }

  await sharedPlaybackStartPromise;
}

export function destroySharedPlayback(): void {
  sharedPlaybackDesired = false;

  if (sharedPlaybackStartPromise && !sharedPlaybackStarted) {
    return;
  }

  if (!sharedPlaybackStarted) {
    return;
  }

  sharedPlayback.destroy();
  sharedPlaybackStarted = false;
  sharedPlaybackStartPromise = null;
}
