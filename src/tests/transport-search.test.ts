import { describe, expect, it } from 'vitest';

import { normalizeSearchResults } from '../lib/transport/search';

describe('normalizeSearchResults', () => {
  it('accepts tuple-form payloads from the backend transport', () => {
    const tracks = [{ id: 't1' }];
    const albums = [{ id: 'a1' }];
    const artists = [{ id: 'r1' }];

    expect(normalizeSearchResults([tracks, albums, artists])).toEqual({
      tracks,
      albums,
      artists,
    });
  });

  it('accepts object-form payloads and fills missing collections', () => {
    expect(normalizeSearchResults({ tracks: [{ id: 't1' }], artists: undefined })).toEqual({
      tracks: [{ id: 't1' }],
      albums: [],
      artists: [],
    });
  });

  it('falls back to empty collections for unsupported payloads', () => {
    expect(normalizeSearchResults(null)).toEqual({ tracks: [], albums: [], artists: [] });
  });
});
