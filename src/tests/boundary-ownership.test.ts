import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const targetFiles = [
  'App.svelte',
  'lib/player/BottomPlayerBar.svelte',
  'lib/views/SongsView.svelte',
  'lib/views/AlbumDetailView.svelte',
  'lib/views/ArtistDetailView.svelte',
  'lib/views/PlaylistDetailView.svelte',
  'lib/views/SearchResultsView.svelte',
  'lib/views/SettingsView.svelte',
];

async function readTargets(): Promise<Array<{ file: string; source: string }>> {
  return Promise.all(
    targetFiles.map(async (file) => ({
      file,
      source: await readFile(path.join(root, file), 'utf8'),
    }))
  );
}

describe('frontend boundary ownership', () => {
  it('keeps transport and environment branching outside app shell surfaces', async () => {
    const files = await readTargets();

    for (const { file, source } of files) {
      expect(source, `${file} should not import @tauri-apps/api/core`).not.toMatch('@tauri-apps/api/core');
      expect(source, `${file} should not branch on isTauri`).not.toMatch(/\bisTauri\b/);
      expect(source, `${file} should not import tauri bridge modules directly`).not.toMatch('../api/tauri/');
      expect(source, `${file} should not import mock data modules directly`).not.toMatch('../mocks/');
    }
  });
});
