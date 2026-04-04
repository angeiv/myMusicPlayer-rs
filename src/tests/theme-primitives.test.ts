// @vitest-environment jsdom

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Component } from 'svelte';

import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

const semanticTokens = [
  '--surface-canvas',
  '--surface-shell',
  '--surface-panel',
  '--surface-panel-subtle',
  '--surface-elevated',
  '--text-primary',
  '--text-secondary',
  '--text-tertiary',
  '--text-on-accent',
  '--border-subtle',
  '--border-default',
  '--border-strong',
  '--accent',
  '--accent-soft',
  '--state-selected',
  '--state-playing',
  '--state-danger',
  '--state-warning',
  '--state-success',
  '--shadow-soft',
  '--shadow-elevated',
  '--glow-accent',
  '--focus-ring',
] as const;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appCssPath = path.join(root, 'app.css');

async function readAppCss(): Promise<string> {
  return readFile(appCssPath, 'utf8');
}

function getThemeBlock(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));

  expect(match, `Expected to find CSS block for ${selector}`).not.toBeNull();

  return match?.[1] ?? '';
}

async function loadComponent(path: string): Promise<{ default: Component<any> }> {
  return vi.importActual(path) as Promise<{ default: Component<any> }>;
}

afterEach(() => {
  cleanup();
});

describe('semantic theme contract', () => {
  it('defines the full semantic token family in the default, dark, and light theme blocks', async () => {
    const css = await readAppCss();
    const blocks = [
      getThemeBlock(css, ':root'),
      getThemeBlock(css, ":root[data-theme='dark']"),
      getThemeBlock(css, ":root[data-theme='light']"),
    ];

    for (const block of blocks) {
      for (const token of semanticTokens) {
        expect(block).toContain(token);
      }
    }
  });
});

describe('shared UI primitives', () => {
  it('renders PageHeader title, subtitle, and actions slot', async () => {
    const { default: PageHeaderFixture } = await loadComponent('./fixtures/PageHeaderFixture.svelte');

    render(PageHeaderFixture);

    expect(screen.getByRole('heading', { name: 'Songs' })).toBeTruthy();
    expect(screen.getByText('128 tracks')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Action' })).toBeTruthy();
  });

  it('applies tone metadata on SurfacePanel without hardcoding call-site wrappers', async () => {
    const { default: SurfacePanelFixture } = await loadComponent('./fixtures/SurfacePanelFixture.svelte');

    render(SurfacePanelFixture);

    const panel = screen.getByText('Panel body').closest('[data-surface-panel]');

    expect(panel).toBeTruthy();
    expect(panel?.getAttribute('data-tone')).toBe('inset');
  });

  it('renders EmptyState copy plus an actions slot for maintenance surfaces', async () => {
    const { default: EmptyStateFixture } = await loadComponent('./fixtures/EmptyStateFixture.svelte');

    render(EmptyStateFixture);

    expect(screen.getByRole('heading', { name: 'No songs yet' })).toBeTruthy();
    expect(screen.getByText('Add a folder to start building the library.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add Folder' })).toBeTruthy();
  });
});
