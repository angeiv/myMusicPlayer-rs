import { createPlaybackStore } from '../stores/playback';

export const sharedPlayback = createPlaybackStore();

let sharedPlaybackStarted = false;
let sharedPlaybackStartPromise: Promise<void> | null = null;
let destroyRequested = false;

// App/root owns the shared playback lifecycle; leaf components should use the store
// without calling sharedPlayback.start()/destroy() directly.
export async function ensureSharedPlaybackStarted(): Promise<void> {
  if (sharedPlaybackStarted) {
    return;
  }

  if (!sharedPlaybackStartPromise) {
    sharedPlaybackStartPromise = (async () => {
      try {
        await sharedPlayback.start();

        if (destroyRequested) {
          sharedPlayback.destroy();
          destroyRequested = false;
          sharedPlaybackStarted = false;
          throw new Error('Shared playback startup cancelled');
        }

        sharedPlaybackStarted = true;
      } catch (error) {
        sharedPlaybackStarted = false;
        throw error;
      } finally {
        if (!sharedPlaybackStarted) {
          destroyRequested = false;
        }
        sharedPlaybackStartPromise = null;
      }
    })();
  }

  await sharedPlaybackStartPromise;
}

export function destroySharedPlayback(): void {
  if (sharedPlaybackStartPromise && !sharedPlaybackStarted) {
    destroyRequested = true;
    return;
  }

  if (!sharedPlaybackStarted) {
    return;
  }

  sharedPlayback.destroy();
  destroyRequested = false;
  sharedPlaybackStarted = false;
  sharedPlaybackStartPromise = null;
}
