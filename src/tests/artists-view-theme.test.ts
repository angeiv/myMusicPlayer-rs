import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const artistsViewPath = path.resolve(testsRoot, '../lib/views/ArtistsView.svelte');
const artistDetailViewPath = path.resolve(testsRoot, '../lib/views/ArtistDetailView.svelte');

async function readViewSource(pathname: string): Promise<string> {
  return readFile(pathname, 'utf8');
}

describe('Artist surfaces theme migration', () => {
  it('moves ArtistsView and ArtistDetailView onto the shared page, panel, and empty-state primitives', async () => {
    const [artistsSource, artistDetailSource] = await Promise.all([
      readViewSource(artistsViewPath),
      readViewSource(artistDetailViewPath),
    ]);

    for (const source of [artistsSource, artistDetailSource]) {
      expect(source).toContain('PageHeader');
      expect(source).toContain('SurfacePanel');
      expect(source).toContain('EmptyState');
    }
  });
});
