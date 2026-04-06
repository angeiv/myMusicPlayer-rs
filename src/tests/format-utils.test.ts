import { describe, expect, it } from 'vitest';

import { formatLongDuration } from '../lib/utils/format';

describe('formatLongDuration', () => {
  it('formats zero duration with Chinese units', () => {
    expect(formatLongDuration(0)).toBe('0 分钟');
  });

  it('formats minute-only durations with Chinese units', () => {
    expect(formatLongDuration(540)).toBe('9 分钟');
  });

  it('formats hour durations with Chinese units', () => {
    expect(formatLongDuration(3_900)).toBe('1 小时 5 分钟');
  });
});
