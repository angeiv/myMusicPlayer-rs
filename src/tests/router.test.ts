import { describe, expect, it } from 'vitest';

import { normalizeHashPath } from '../lib/stores/router';

describe('normalizeHashPath', () => {
  it('canonically normalizes hash routes for frontend navigation', () => {
    expect(normalizeHashPath('')).toBe('/');
    expect(normalizeHashPath('library//Artist Name/100% ready')).toBe(
      '/library/Artist%20Name/100%25%20ready'
    );
    expect(normalizeHashPath('/queue/AC%2FDC')).toBe('/queue/AC%2FDC');
  });
});
