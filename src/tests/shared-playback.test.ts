import { afterEach, describe, expect, it, vi } from 'vitest';

type Deferred = {
  resolve: () => void;
};

async function importSharedPlaybackModule() {
  vi.resetModules();

  let intervalRunning = false;
  const startDeferreds: Deferred[] = [];
  const start = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        startDeferreds.push({
          resolve: () => {
            intervalRunning = true;
            resolve();
          },
        });
      })
  );
  const destroy = vi.fn(() => {
    intervalRunning = false;
  });

  vi.doMock('../lib/stores/playback', () => ({
    createPlaybackStore: () => ({
      start,
      destroy,
    }),
  }));

  const module = await import('../lib/player/sharedPlayback');

  return {
    module,
    start,
    destroy,
    startDeferreds,
    isIntervalRunning: () => intervalRunning,
  };
}

afterEach(() => {
  vi.doUnmock('../lib/stores/playback');
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('shared playback lifecycle', () => {
  it('destroys pending startup immediately after start resolves when destroy was requested', async () => {
    const { module, start, destroy, startDeferreds, isIntervalRunning } =
      await importSharedPlaybackModule();

    const firstStart = module.ensureSharedPlaybackStarted();
    expect(start).toHaveBeenCalledTimes(1);

    module.destroySharedPlayback();
    expect(destroy).not.toHaveBeenCalled();

    expect(startDeferreds).toHaveLength(1);
    const firstDeferred = startDeferreds[0]!;
    firstDeferred.resolve();
    await firstStart;

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(isIntervalRunning()).toBe(false);

    const restart = module.ensureSharedPlaybackStarted();
    expect(start).toHaveBeenCalledTimes(2);

    expect(startDeferreds).toHaveLength(2);
    const restartDeferred = startDeferreds[1]!;
    restartDeferred.resolve();
    await restart;

    expect(isIntervalRunning()).toBe(true);

    module.destroySharedPlayback();
    expect(destroy).toHaveBeenCalledTimes(2);
    expect(isIntervalRunning()).toBe(false);
  });
});
