import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(testsRoot, '../lib');
const appCssPath = path.resolve(testsRoot, '../app.css');
const homeViewPath = path.join(srcRoot, 'views/HomeView.svelte');
const albumsViewPath = path.join(srcRoot, 'views/AlbumsView.svelte');
const artistsViewPath = path.join(srcRoot, 'views/ArtistsView.svelte');

describe('summary selection guard contract', () => {
  it('defines the shared selection-guard utility and applies it to both frozen Home summary lists', async () => {
    const [css, homeSource] = await Promise.all([
      readFile(appCssPath, 'utf8'),
      readFile(homeViewPath, 'utf8'),
    ]);

    expect(css).toContain('.selection-guard');
    expect(css).toContain('user-select: none');
    expect(css).toContain('-webkit-user-select: none');
    expect(css).toContain('::selection');

    const homeMatches = homeSource.match(/class="summary-card selection-guard"/g) ?? [];
    expect(homeMatches).toHaveLength(2);
  });

  it('applies the shared selection-guard utility to album and artist cards', async () => {
    const [albumsSource, artistsSource] = await Promise.all([
      readFile(albumsViewPath, 'utf8'),
      readFile(artistsViewPath, 'utf8'),
    ]);

    expect(albumsSource).toContain('class="card selection-guard"');
    expect(artistsSource).toContain('class="card selection-guard"');
  });
});
