import { describe, expect, it } from 'vitest';

import { createStaleRequestTracker, runGuardedRequest } from '../lib/views/stale-request';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('detail view stale-request guards', () => {
  it('PlaylistDetailView allows explicit same-id refresh after mutation', async () => {
    const module = (await import('../lib/views/PlaylistDetailView.svelte')) as unknown as {
      shouldSkipPlaylistLoad: (id: string, state: {
        lastRequestedId: string | null;
        loading: boolean;
        hasPlaylist: boolean;
        force: boolean;
      }) => boolean;
    };

    expect(
      module.shouldSkipPlaylistLoad('playlist-1', {
        lastRequestedId: 'playlist-1',
        loading: false,
        hasPlaylist: true,
        force: false,
      })
    ).toBe(true);

    expect(
      module.shouldSkipPlaylistLoad('playlist-1', {
        lastRequestedId: 'playlist-1',
        loading: false,
        hasPlaylist: true,
        force: true,
      })
    ).toBe(false);
  });

  it('AlbumDetailView flow ignores stale error from older request', async () => {
    const tracker = createStaleRequestTracker();
    const older = deferred<{ album: string; tracks: string[] }>();
    const newer = deferred<{ album: string; tracks: string[] }>();
    const applied: string[] = [];
    const errors: string[] = [];

    const first = runGuardedRequest({
      id: 'album-1',
      tracker,
      onStart: () => undefined,
      request: () => older.promise,
      onSuccess: (result) => applied.push(result.album),
      onError: () => errors.push('older'),
      onFinally: () => undefined,
    });

    const second = runGuardedRequest({
      id: 'album-2',
      tracker,
      onStart: () => undefined,
      request: () => newer.promise,
      onSuccess: (result) => applied.push(result.album),
      onError: () => errors.push('newer'),
      onFinally: () => undefined,
    });

    older.reject(new Error('stale error'));
    newer.resolve({ album: 'album-2', tracks: ['t2'] });

    await Promise.all([first, second]);

    expect(applied).toEqual(['album-2']);
    expect(errors).toEqual([]);
  });

  it('ArtistDetailView flow ignores stale success from older request', async () => {
    const tracker = createStaleRequestTracker();
    const older = deferred<{ artist: string }>();
    const newer = deferred<{ artist: string }>();
    const applied: string[] = [];

    const first = runGuardedRequest({
      id: 'artist-1',
      tracker,
      onStart: () => undefined,
      request: () => older.promise,
      onSuccess: (result) => applied.push(result.artist),
      onError: () => undefined,
      onFinally: () => undefined,
    });

    const second = runGuardedRequest({
      id: 'artist-2',
      tracker,
      onStart: () => undefined,
      request: () => newer.promise,
      onSuccess: (result) => applied.push(result.artist),
      onError: () => undefined,
      onFinally: () => undefined,
    });

    newer.resolve({ artist: 'artist-2' });
    older.resolve({ artist: 'artist-1' });

    await Promise.all([first, second]);
    expect(applied).toEqual(['artist-2']);
  });

  it('PlaylistDetailView flow clears loading only for the latest request', async () => {
    const tracker = createStaleRequestTracker();
    const older = deferred<{ playlist: string }>();
    const newer = deferred<{ playlist: string }>();
    let loading = false;
    const loadingTransitions: boolean[] = [];

    const mark = (next: boolean) => {
      loading = next;
      loadingTransitions.push(next);
    };

    const first = runGuardedRequest({
      id: 'playlist-1',
      tracker,
      onStart: () => mark(true),
      request: () => older.promise,
      onSuccess: () => undefined,
      onError: () => undefined,
      onFinally: () => mark(false),
    });

    const second = runGuardedRequest({
      id: 'playlist-2',
      tracker,
      onStart: () => mark(true),
      request: () => newer.promise,
      onSuccess: () => undefined,
      onError: () => undefined,
      onFinally: () => mark(false),
    });

    older.resolve({ playlist: 'playlist-1' });
    await Promise.resolve();
    expect(loading).toBe(true);
    newer.resolve({ playlist: 'playlist-2' });

    await Promise.all([first, second]);

    expect(loading).toBe(false);
    expect(loadingTransitions).toEqual([true, true, false]);
  });
});
