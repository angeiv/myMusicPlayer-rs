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
  it('destroys playback if startup settles after destroy is requested with no remount', async () => {
    const { module, start, destroy, startDeferreds, isIntervalRunning } =
      await importSharedPlaybackModule();

    const firstStart = module.ensureSharedPlaybackStarted();
    const secondStart = module.ensureSharedPlaybackStarted();
    expect(start).toHaveBeenCalledTimes(1);

    module.destroySharedPlayback();
    expect(destroy).not.toHaveBeenCalled();

    expect(startDeferreds).toHaveLength(1);
    startDeferreds[0]!.resolve();
    await expect(firstStart).resolves.toBeUndefined();
    await expect(secondStart).resolves.toBeUndefined();

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(isIntervalRunning()).toBe(false);

    const restart = module.ensureSharedPlaybackStarted();
    expect(start).toHaveBeenCalledTimes(2);

    startDeferreds[1]!.resolve();
    await expect(restart).resolves.toBeUndefined();
    expect(isIntervalRunning()).toBe(true);

    module.destroySharedPlayback();
    expect(destroy).toHaveBeenCalledTimes(2);
    expect(isIntervalRunning()).toBe(false);
  });

  it('keeps playback started when startup is desired again before the first startup settles', async () => {
    const { module, start, destroy, startDeferreds, isIntervalRunning } =
      await importSharedPlaybackModule();

    const firstStart = module.ensureSharedPlaybackStarted();
    expect(start).toHaveBeenCalledTimes(1);

    module.destroySharedPlayback();
    expect(destroy).not.toHaveBeenCalled();

    const remountStart = module.ensureSharedPlaybackStarted();
    expect(start).toHaveBeenCalledTimes(1);

    expect(startDeferreds).toHaveLength(1);
    startDeferreds[0]!.resolve();
    await expect(firstStart).resolves.toBeUndefined();
    await expect(remountStart).resolves.toBeUndefined();

    expect(destroy).not.toHaveBeenCalled();
    expect(isIntervalRunning()).toBe(true);

    module.destroySharedPlayback();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(isIntervalRunning()).toBe(false);
  });
});
