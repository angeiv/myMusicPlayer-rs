# Summary Selection Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate accidental blue text-selection highlights on the frozen Home / Albums / Artists / Search summary surfaces while preserving existing hover, focus, and click behavior.

**Architecture:** Add one small shared `.selection-guard` utility in `src/app.css`, then apply it only to the frozen surfaces listed in `docs/superpowers/specs/2026-04-06-summary-card-selection-guard-design.md`. Lock the behavior with a focused source-contract regression test that proves the shared utility exists and every covered surface opts into it, then run the existing secondary-surface/view tests plus frontend check/build.

**Tech Stack:** Svelte 5, TypeScript, scoped component CSS, `src/app.css`, Vitest, Testing Library, Vite

---

## Spec Reference

- Spec: `docs/superpowers/specs/2026-04-06-summary-card-selection-guard-design.md`

## Preflight Constraints

- Execute this plan in a **dedicated worktree or otherwise clean checkout**. Do not mix these changes with unrelated local edits.
- Do **not** expand scope beyond the frozen list in the spec:
  - `src/lib/views/HomeView.svelte` → `Recently Added Tracks` / `Top Artists` summary items
  - `src/lib/views/AlbumsView.svelte` → album cards
  - `src/lib/views/ArtistsView.svelte` → artist cards
  - `src/lib/views/SearchResultsView.svelte` → track result rows, track-copy surface, album/artist list buttons
- Keep `SongsTable.svelte` and `TrackActionRow.svelte` as behavior references only. Do not refactor them in this plan.

## File Map

- Modify: `src/app.css`
  - Add the shared `.selection-guard` utility (`user-select`, `-webkit-user-select`, and localized `::selection` handling).
- Modify: `src/lib/views/HomeView.svelte`
  - Apply the shared utility to the frozen Home summary items only.
- Modify: `src/lib/views/AlbumsView.svelte`
  - Apply the shared utility to album cards.
- Modify: `src/lib/views/ArtistsView.svelte`
  - Apply the shared utility to artist cards.
- Modify: `src/lib/views/SearchResultsView.svelte`
  - Apply the shared utility to frozen search result surfaces only.
- Create: `src/tests/summary-selection-guard.test.ts`
  - Focused regression/source-contract coverage for the shared utility and every frozen surface.
- Verify only (no code changes expected):
  - `src/tests/theme-secondary-surfaces.test.ts`
  - `src/tests/albums-view.test.ts`
  - `src/tests/artists-view-theme.test.ts`

---

### Task 1: Shared utility + Home summary rows

**Files:**
- Modify: `src/app.css`
- Modify: `src/lib/views/HomeView.svelte`
- Create: `src/tests/summary-selection-guard.test.ts`
- Test: `src/tests/summary-selection-guard.test.ts`

- [ ] **Step 1: Write the failing regression test for the shared utility and Home coverage**

```ts
// src/tests/summary-selection-guard.test.ts
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
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm --prefix ./src run test -- --run tests/summary-selection-guard.test.ts`

Expected: FAIL because `src/app.css` does not yet define `.selection-guard` and the two frozen Home summary lists do not yet opt their summary items into that utility.

- [ ] **Step 3: Add the shared utility and wire Home summary items into it**

```css
/* src/app.css */
.selection-guard,
.selection-guard * {
  user-select: none;
  -webkit-user-select: none;
}

.selection-guard::selection,
.selection-guard *::selection {
  background: transparent;
  color: inherit;
}
```

```svelte
<!-- src/lib/views/HomeView.svelte -->
<li class="summary-card selection-guard">
  ...
</li>
```

Notes:
- Keep the fix scoped to the two frozen Home summary lists only.
- Do **not** add the utility to `.stat-card` or `.home-summary-chip`.
- It is fine to introduce a small semantic helper class like `.summary-card` if needed for clarity.

- [ ] **Step 4: Re-run the focused test to verify it passes**

Run: `npm --prefix ./src run test -- --run tests/summary-selection-guard.test.ts`

Expected: PASS for the utility + Home contract.

- [ ] **Step 5: Commit the task**

```bash
git add src/app.css src/lib/views/HomeView.svelte src/tests/summary-selection-guard.test.ts
git commit -m "fix: guard home summary cards against text selection"
```

---

### Task 2: Album + artist card surfaces

**Files:**
- Modify: `src/lib/views/AlbumsView.svelte`
- Modify: `src/lib/views/ArtistsView.svelte`
- Modify: `src/tests/summary-selection-guard.test.ts`
- Test: `src/tests/summary-selection-guard.test.ts`

- [ ] **Step 1: Extend the failing regression test to cover album and artist cards**

```ts
const albumsViewPath = path.join(srcRoot, 'views/AlbumsView.svelte');
const artistsViewPath = path.join(srcRoot, 'views/ArtistsView.svelte');

it('applies the shared selection-guard utility to album and artist cards', async () => {
  const [albumsSource, artistsSource] = await Promise.all([
    readFile(albumsViewPath, 'utf8'),
    readFile(artistsViewPath, 'utf8'),
  ]);

  expect(albumsSource).toContain('class="card selection-guard"');
  expect(artistsSource).toContain('class="card selection-guard"');
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm --prefix ./src run test -- --run tests/summary-selection-guard.test.ts`

Expected: FAIL because `AlbumsView.svelte` and `ArtistsView.svelte` do not yet opt their cards into `.selection-guard`.

- [ ] **Step 3: Apply the shared utility to the frozen album and artist cards**

```svelte
<!-- src/lib/views/AlbumsView.svelte -->
<button class="card selection-guard" on:click={() => handleOpen(album)}>
```

```svelte
<!-- src/lib/views/ArtistsView.svelte -->
<button class="card selection-guard" on:click={() => handleOpen(artist)}>
```

Notes:
- Reuse the shared utility; do not duplicate `user-select` rules locally unless there is a real blocker.
- Do not change card layout, hover, focus, or transform behavior.

- [ ] **Step 4: Re-run the focused test to verify it passes**

Run: `npm --prefix ./src run test -- --run tests/summary-selection-guard.test.ts`

Expected: PASS for Home + Albums + Artists coverage.

- [ ] **Step 5: Commit the task**

```bash
git add src/lib/views/AlbumsView.svelte src/lib/views/ArtistsView.svelte src/tests/summary-selection-guard.test.ts
git commit -m "fix: guard album and artist cards against text selection"
```

---

### Task 3: Search result surfaces

**Files:**
- Modify: `src/lib/views/SearchResultsView.svelte`
- Modify: `src/tests/summary-selection-guard.test.ts`
- Test: `src/tests/summary-selection-guard.test.ts`
- Verify: `src/tests/theme-secondary-surfaces.test.ts`
- Verify: `src/tests/albums-view.test.ts`
- Verify: `src/tests/artists-view-theme.test.ts`

- [ ] **Step 1: Extend the failing regression test to cover the frozen Search surfaces**

```ts
const searchResultsViewPath = path.join(srcRoot, 'views/SearchResultsView.svelte');

it('applies the shared selection-guard utility to frozen search result surfaces', async () => {
  const searchSource = await readFile(searchResultsViewPath, 'utf8');

  expect(searchSource).toContain('class="result-list__row selection-guard"');
  expect(searchSource).toContain('class="track-copy selection-guard"');

  const listButtonMatches = searchSource.match(/class="list-button selection-guard"/g) ?? [];
  expect(listButtonMatches).toHaveLength(2);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm --prefix ./src run test -- --run tests/summary-selection-guard.test.ts`

Expected: FAIL because the Search result surfaces do not yet opt into `.selection-guard`, including both frozen album/artist `list-button` surfaces.

- [ ] **Step 3: Apply the shared utility to the frozen Search result surfaces**

```svelte
<!-- src/lib/views/SearchResultsView.svelte -->
<li class="result-list__row selection-guard">
...
<div class="track-copy selection-guard" ...>
...
<button class="list-button selection-guard" ...>
```

Notes:
- Only touch the frozen Search surfaces named in the spec.
- Do not alter playback wiring, keyboard handlers, or result ordering.
- Preserve existing focus-visible behavior on `.track-copy`, `.list-button`, and `.result-icon-button`.

- [ ] **Step 4: Run focused + regression-adjacent tests**

Run: `npm --prefix ./src run test -- --run tests/summary-selection-guard.test.ts tests/theme-secondary-surfaces.test.ts tests/albums-view.test.ts tests/artists-view-theme.test.ts`

Expected: PASS. The new contract test proves all frozen surfaces opt into the shared utility; existing view/theme tests confirm the migrated surfaces still render and wire correctly.

- [ ] **Step 5: Commit the task**

```bash
git add src/lib/views/SearchResultsView.svelte src/tests/summary-selection-guard.test.ts
git commit -m "fix: guard search summary surfaces against text selection"
```

---

### Task 4: Final verification sweep

**Files:**
- Verify only: `src/app.css`
- Verify only: `src/lib/views/HomeView.svelte`
- Verify only: `src/lib/views/AlbumsView.svelte`
- Verify only: `src/lib/views/ArtistsView.svelte`
- Verify only: `src/lib/views/SearchResultsView.svelte`
- Verify only: `src/tests/summary-selection-guard.test.ts`

- [ ] **Step 1: Run frontend static checks**

Run: `npm --prefix ./src run check`

Expected: PASS with `svelte-check found 0 errors and 0 warnings`.

- [ ] **Step 2: Run a production build**

Run: `npm --prefix ./src run build`

Expected: PASS with Vite build output and no TypeScript errors.

- [ ] **Step 3: Re-run the full targeted regression set one more time after the full build/check sweep**

Run: `npm --prefix ./src run test -- --run tests/summary-selection-guard.test.ts tests/theme-secondary-surfaces.test.ts tests/albums-view.test.ts tests/artists-view-theme.test.ts`

Expected: PASS.

- [ ] **Step 4: Manual smoke check in the running app (if available in the execution session)**

Check:
- Home: drag/double-click over `Recently Added Tracks` / `Top Artists` copy → no blue selection line
- Albums: drag over album card titles/meta → no blue selection line
- Artists: drag over artist card copy → no blue selection line
- Search: drag over track rows / track copy / album-artist list buttons → no blue selection line
- Songs: existing row focus/selection behavior still feels unchanged

Expected: No accidental text selection highlight on the frozen surfaces, with hover/focus/click affordances unchanged.

---

## Done Criteria

- `.selection-guard` exists in `src/app.css`
- All frozen spec surfaces explicitly opt into the shared utility
- `src/tests/summary-selection-guard.test.ts` passes
- `tests/theme-secondary-surfaces.test.ts`, `tests/albums-view.test.ts`, and `tests/artists-view-theme.test.ts` pass in the targeted sweep
- `npm --prefix ./src run check` passes
- `npm --prefix ./src run build` passes
- Manual smoke check (if performed) matches the spec behavior
