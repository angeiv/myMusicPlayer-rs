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
  it('rejects canceled startup and allows a clean restart', async () => {
    const { module, start, destroy, startDeferreds, isIntervalRunning } =
      await importSharedPlaybackModule();

    const firstStart = module.ensureSharedPlaybackStarted();
    const secondStart = module.ensureSharedPlaybackStarted();
    expect(start).toHaveBeenCalledTimes(1);

    module.destroySharedPlayback();
    expect(destroy).not.toHaveBeenCalled();

    expect(startDeferreds).toHaveLength(1);
    const firstDeferred = startDeferreds[0]!;
    const firstRejection = expect(firstStart).rejects.toThrow('Shared playback startup cancelled');
    const secondRejection = expect(secondStart).rejects.toThrow(
      'Shared playback startup cancelled'
    );
    firstDeferred.resolve();
    await Promise.all([firstRejection, secondRejection]);

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(isIntervalRunning()).toBe(false);

    const restart = module.ensureSharedPlaybackStarted();
    expect(start).toHaveBeenCalledTimes(2);

    expect(startDeferreds).toHaveLength(2);
    const restartDeferred = startDeferreds[1]!;
    restartDeferred.resolve();
    await expect(restart).resolves.toBeUndefined();

    expect(isIntervalRunning()).toBe(true);

    module.destroySharedPlayback();
    expect(destroy).toHaveBeenCalledTimes(2);
    expect(isIntervalRunning()).toBe(false);
  });
});
