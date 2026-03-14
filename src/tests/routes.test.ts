import { describe, expect, it } from 'vitest';

import {
  getSearchRouteSyncTarget,
  matchRoute,
  normalizeRoutePath,
  routeToPath,
  searchTermToPath,
  type RouteMatch,
} from '../lib/routing/routes';

describe('matchRoute', () => {
  it('parses the desktop app routes into typed route contracts', () => {
    const cases: Array<[string, RouteMatch]> = [
      ['/', { name: 'home' }],
      ['/songs', { name: 'songs' }],
      ['/albums', { name: 'albums' }],
      ['/albums/album%201', { name: 'albumDetail', id: 'album 1' }],
      ['/artists', { name: 'artists' }],
      ['/artists/artist%2F2', { name: 'artistDetail', id: 'artist/2' }],
      ['/playlists/playlist%203', { name: 'playlistDetail', id: 'playlist 3' }],
      ['/settings', { name: 'settings' }],
      ['/search', { name: 'search', query: '' }],
      ['/search/fuzzy%20beats', { name: 'search', query: 'fuzzy beats' }],
      ['/search/fuzzy/beats', { name: 'search', query: 'fuzzy/beats' }],
    ];

    for (const [path, expected] of cases) {
      expect(matchRoute(path)).toEqual(expected);
    }
  });

  it('normalizes duplicate slashes and trailing slashes before matching', () => {
    expect(matchRoute('//albums///album%201//')).toEqual({
      name: 'albumDetail',
      id: 'album 1',
    });
    expect(matchRoute('/artists/')).toEqual({ name: 'artists' });
    expect(matchRoute('/search//')).toEqual({ name: 'search', query: '' });
  });

  it('keeps malformed percent encoding as a literal identifier instead of throwing', () => {
    expect(matchRoute('/albums/%E0%A4%A')).toEqual({
      name: 'albumDetail',
      id: '%E0%A4%A',
    });
    expect(matchRoute('/search/%E0%A4%A')).toEqual({
      name: 'search',
      query: '%E0%A4%A',
    });
  });

  it('falls back to home for unknown paths', () => {
    expect(matchRoute('/now-playing')).toEqual({ name: 'home' });
    expect(matchRoute('/albums/one/two')).toEqual({ name: 'home' });
  });
});

describe('routeToPath', () => {
  it('serializes typed route contracts back to canonical paths', () => {
    const cases: Array<[RouteMatch, string]> = [
      [{ name: 'home' }, '/'],
      [{ name: 'songs' }, '/songs'],
      [{ name: 'albums' }, '/albums'],
      [{ name: 'albumDetail', id: 'album 1' }, '/albums/album%201'],
      [{ name: 'artists' }, '/artists'],
      [{ name: 'artistDetail', id: 'artist/2' }, '/artists/artist%2F2'],
      [{ name: 'playlistDetail', id: 'playlist 3' }, '/playlists/playlist%203'],
      [{ name: 'settings' }, '/settings'],
      [{ name: 'search', query: '' }, '/search'],
      [{ name: 'search', query: 'fuzzy beats' }, '/search/fuzzy%20beats'],
    ];

    for (const [route, expected] of cases) {
      expect(routeToPath(route)).toBe(expected);
    }
  });
});

describe('search route helpers', () => {
  it('normalizes route paths for comparison', () => {
    expect(normalizeRoutePath('')).toBe('/');
    expect(normalizeRoutePath('/albums//album%201/')).toBe('/albums/album%201');
  });

  it('maps empty search input back to home', () => {
    expect(searchTermToPath('')).toBe('/');
    expect(searchTermToPath('   ')).toBe('/');
  });

  it('builds search navigation targets only when the canonical path changes', () => {
    expect(searchTermToPath(' fuzzy beats ')).toBe('/search/fuzzy%20beats');
    expect(getSearchRouteSyncTarget(' fuzzy beats ', '/search/fuzzy%20beats')).toBeNull();
    expect(getSearchRouteSyncTarget(' fuzzy beats ', '/search/fuzzy%20beats/')).toBeNull();
    expect(getSearchRouteSyncTarget('', '/search')).toBe('/');
    expect(getSearchRouteSyncTarget('fuzzy beats', '/songs')).toBe('/search/fuzzy%20beats');
  });
});
