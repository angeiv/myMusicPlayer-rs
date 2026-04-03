import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sidebarPath = path.join(root, 'lib/layout/Sidebar.svelte');

async function readSidebar(): Promise<string> {
  return readFile(sidebarPath, 'utf8');
}

describe('sidebar playlist create button layout', () => {
  it('uses centered circular styling for the playlist create button', async () => {
    const source = await readSidebar();

    expect(source).toMatch(/\.create\s*\{[\s\S]*display:\s*(?:inline-)?flex;/);
    expect(source).toMatch(/\.create\s*\{[\s\S]*align-items:\s*center;/);
    expect(source).toMatch(/\.create\s*\{[\s\S]*justify-content:\s*center;/);
    expect(source).toMatch(/\.create\s*\{[\s\S]*width:\s*40px;/);
    expect(source).toMatch(/\.create\s*\{[\s\S]*height:\s*40px;/);
    expect(source).toMatch(/\.create\s*\{[\s\S]*border-radius:\s*999px;/);
    expect(source).toMatch(/\.create\s*\{[\s\S]*padding:\s*0;/);
    expect(source).toMatch(/\.create\s*\{[\s\S]*line-height:\s*1;/);
  });

  it('uses semantic shell tokens and icon-free navigation chrome', async () => {
    const source = await readSidebar();

    expect(source).toContain('data-sidebar-surface="shell"');
    expect(source).toContain('var(--surface-shell)');
    expect(source).toContain('var(--surface-panel-subtle)');
    expect(source).toContain('var(--state-selected)');
    expect(source).not.toContain('var(--sidebar-bg)');
    expect(source).not.toContain('var(--hover-bg)');
    expect(source).not.toContain('var(--active-bg)');
    expect(source).not.toContain('🎶');
    expect(source).not.toContain('🏠');
    expect(source).not.toContain('🎼');
    expect(source).not.toContain('⚙️');
    expect(source).not.toContain('🎵');
    expect(source).not.toContain('💿');
    expect(source).not.toContain('👤');
    expect(source).not.toContain('🎧');
  });
});
