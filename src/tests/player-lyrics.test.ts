import { describe, expect, it } from 'vitest';

import { buildLyricsPanelState, parseLyrics } from '../lib/player/lyrics';

describe('player lyrics helpers', () => {
  it('returns an empty state when lyrics are missing', () => {
    expect(buildLyricsPanelState(null, 0)).toEqual({
      lines: [],
      activeIndex: -1,
      hasTimedLyrics: false,
    });
  });

  it('parses plain text lyrics without timestamps', () => {
    const state = buildLyricsPanelState('第一行\n第二行\n', 12);

    expect(state.hasTimedLyrics).toBe(false);
    expect(state.activeIndex).toBe(-1);
    expect(state.lines.map((line) => line.text)).toEqual(['第一行', '第二行']);
  });

  it('expands multiple time tags from one lrc line', () => {
    const lines = parseLyrics('[00:01.00][00:03.50]副歌');

    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.timestamp)).toEqual([1, 3.5]);
    expect(lines.map((line) => line.text)).toEqual(['副歌', '副歌']);
  });

  it('highlights the latest timed line for the current progress', () => {
    const state = buildLyricsPanelState(
      '[00:01.00]第一句\n[00:04.20]第二句\n[00:08.00]第三句',
      5
    );

    expect(state.hasTimedLyrics).toBe(true);
    expect(state.activeIndex).toBe(1);
    expect(state.lines.map((line) => line.text)).toEqual(['第一句', '第二句', '第三句']);
  });
});
