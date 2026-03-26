import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const shellFiles = [
  'App.svelte',
  'lib/player/BottomPlayerBar.svelte',
  'lib/views/SongsView.svelte',
  'lib/views/AlbumDetailView.svelte',
  'lib/views/ArtistDetailView.svelte',
  'lib/views/PlaylistDetailView.svelte',
  'lib/views/SearchResultsView.svelte',
  'lib/views/SettingsView.svelte',
] as const;

const pureSongsFiles = [
  'lib/components/songs/SongsBulkActionBar.svelte',
  'lib/components/songs/SongsContextMenu.svelte',
  'lib/components/songs/SongsPlaylistPicker.svelte',
  'lib/components/songs/SongsTable.svelte',
  'lib/features/songs-list/actions.ts',
  'lib/features/songs-list/selection.ts',
  'lib/features/songs-list/sort-filter.ts',
] as const;

async function readTargets(files: readonly string[]): Promise<Array<{ file: string; source: string }>> {
  return Promise.all(
    files.map(async (file) => ({
      file,
      source: await readFile(path.join(root, file), 'utf8'),
    })),
  );
}

describe('frontend boundary ownership', () => {
  it('keeps transport and environment branching outside app shell surfaces', async () => {
    const files = await readTargets(shellFiles);

    for (const { file, source } of files) {
      expect(source, `${file} should not import @tauri-apps/api/core`).not.toMatch('@tauri-apps/api/core');
      expect(source, `${file} should not branch on isTauri`).not.toMatch(/\bisTauri\b/);
      expect(source, `${file} should not import tauri bridge modules directly`).not.toMatch('../api/tauri/');
      expect(source, `${file} should not import mock data modules directly`).not.toMatch('../mocks/');
    }
  });

  it('keeps pure songs feature and presentation files free of transport adapters', async () => {
    const files = await readTargets(pureSongsFiles);

    for (const { file, source } of files) {
      expect(source, `${file} should not import @tauri-apps/api/core`).not.toMatch('@tauri-apps/api/core');
      expect(source, `${file} should not branch on isTauri`).not.toMatch(/\bisTauri\b/);
      expect(source, `${file} should not import tauri bridge modules directly`).not.toMatch('../api/tauri/');
      expect(source, `${file} should not import mock data modules directly`).not.toMatch('../mocks/');
      expect(source, `${file} should not reach into api adapters directly`).not.toMatch(/(?:\.\.\/){1,2}api\//);
    }
  });
});
