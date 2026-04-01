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
  it('renders queue, volume, and device as unified icon buttons without emoji labels', async () => {
    const source = await readPlayerBar();

    expect(source).toMatch(/class=\"utility-trigger utility-icon-button\"[^>]*aria-label=\"队列\"/);
    expect(source).toMatch(/class=\"utility-trigger utility-icon-button volume-trigger\"/);
    expect(source).toMatch(/class=\"utility-trigger utility-icon-button\"[^>]*aria-label=\"输出设备\"/);
    expect(source).not.toMatch(/class=\"utility-trigger utility-icon-button\"[^>]*aria-label=\"歌词\"/);
    expect(source).not.toContain('showLyricsPanel');
    expect(source).not.toContain('lyrics-panel');
    expect(source).not.toContain('📃');
    expect(source).not.toContain('🎧');
    expect(source).not.toContain('📝');
    expect(source).not.toContain('🔇');
    expect(source).not.toContain('🔈');
    expect(source).not.toContain('🔊');
    expect(source).not.toMatch(/volume-trigger-value/);
    expect(source).toMatch(/\.utility-icon-button\s*\{[\s\S]*width:\s*44px;/);
    expect(source).toMatch(/\.utility-icon-button\s*\{[\s\S]*height:\s*44px;/);
    expect(source).toMatch(/\.utility-icon-button\s*\{[\s\S]*padding:\s*0;/);
    expect(source).toMatch(/\.utility-icon-button\s*\{[\s\S]*border-radius:\s*16px;/);
  });

  it('renders the shuffle, previous, play-pause, next, and repeat controls as svg icons', async () => {
    const source = await readPlayerBar();

    expect(source).toMatch(/class=\"transport-icon\"/);
    expect(source).toMatch(/aria-label=\"切换随机播放\"/);
    expect(source).toMatch(/aria-label=\"上一首\"/);
    expect(source).toMatch(/aria-label=\"播放或暂停\"/);
    expect(source).toMatch(/aria-label=\"下一首\"/);
    expect(source).toMatch(/aria-label=\"切换重复模式\"/);
    expect(source).not.toContain('🔀');
    expect(source).not.toContain('⏮');
    expect(source).not.toContain('▶');
    expect(source).not.toContain('⏸');
    expect(source).not.toContain('⏭');
    expect(source).not.toContain('🔂');
    expect(source).not.toContain('🔁');
    expect(source).toMatch(/\.transport-icon\s*\{[\s\S]*width:\s*20px;/);
    expect(source).toMatch(/\.transport-icon\s*\{[\s\S]*height:\s*20px;/);
  });
});
