import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(testsRoot, '../lib');
const appCssPath = path.resolve(testsRoot, '../app.css');
const homeViewPath = path.join(srcRoot, 'views/HomeView.svelte');

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
});
