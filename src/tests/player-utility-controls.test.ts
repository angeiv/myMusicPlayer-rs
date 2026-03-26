import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const playerBarPath = path.join(root, 'lib/player/BottomPlayerBar.svelte');

async function readPlayerBar(): Promise<string> {
  return readFile(playerBarPath, 'utf8');
}

describe('player utility controls styling', () => {
  it('uses a dedicated utility-trigger style for the volume trigger and neighboring utility buttons', async () => {
    const source = await readPlayerBar();

    expect(source).toMatch(/class=\"utility-trigger volume-trigger\"/);
    expect(source).toMatch(/class=\"utility-trigger\"[^>]*>\s*📃 队列\s*</);
    expect(source).toMatch(/class=\"utility-trigger\"[^>]*>\s*🎧 设备\s*</);
    expect(source).toMatch(/class=\"utility-trigger\"[^>]*>\s*📝 歌词\s*</);
    expect(source).toMatch(/\.utility-trigger\s*\{[\s\S]*border-radius:\s*999px;/);
    expect(source).toMatch(/\.utility-trigger\s*\{[\s\S]*min-height:\s*40px;/);
  });
});
