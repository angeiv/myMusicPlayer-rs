import type { SearchResults } from '../types';

type TuplePayload = [unknown, unknown, unknown];

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function normalizeSearchResults(payload: unknown): SearchResults {
  if (Array.isArray(payload) && payload.length === 3) {
    const [tracks, albums, artists] = payload as TuplePayload;
    return {
      tracks: asArray(tracks) as SearchResults['tracks'],
      albums: asArray(albums) as SearchResults['albums'],
      artists: asArray(artists) as SearchResults['artists'],
    };
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Partial<SearchResults>;
    return {
      tracks: Array.isArray(record.tracks) ? record.tracks : [],
      albums: Array.isArray(record.albums) ? record.albums : [],
      artists: Array.isArray(record.artists) ? record.artists : [],
    };
  }

  return { tracks: [], albums: [], artists: [] };
}

