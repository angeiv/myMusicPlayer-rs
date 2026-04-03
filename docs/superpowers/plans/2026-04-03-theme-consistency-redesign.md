# Theme Consistency Redesign (R009) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified dark/light visual system for the app shell, playback surfaces, and primary pages so the player feels like one product in both themes.

**Architecture:** Keep theme semantics centralized in `src/app.css`, add a small set of shared UI primitives under `src/lib/components/ui/`, and migrate shell/pages onto those primitives instead of leaving per-view hardcoded styling. Treat playback surfaces (`BottomPlayerBar`, `NowPlayingOverlay`, queue/lyrics panels) as first-class migration targets rather than post-cleanup polish. Keep routing and product capabilities intact; only restructure layout/presentation seams that improve consistency.

**Tech Stack:** Svelte 5 + TypeScript + scoped component CSS + global CSS variables in `src/app.css`; Vitest + Testing Library for component behavior and source-contract tests; browser verification against the local app.

---

## Inputs / References

- Spec (approved): `docs/superpowers/specs/2026-04-03-theme-consistency-redesign-design.md`
- GSD requirement: `R009` in `.gsd/REQUIREMENTS.md`
- App shell: `src/App.svelte`, `src/app.css`, `src/lib/layout/Sidebar.svelte`, `src/lib/layout/TopBar.svelte`
- Playback surfaces: `src/lib/player/BottomPlayerBar.svelte`, `src/lib/player/NowPlayingOverlay.svelte`, `src/lib/player/QueueList.svelte`, `src/lib/player/NowPlayingLyricsTab.svelte`
- Primary pages: `src/lib/views/SongsView.svelte`, `src/lib/views/AlbumsView.svelte`, `src/lib/views/AlbumDetailView.svelte`, `src/lib/views/ArtistsView.svelte`, `src/lib/views/ArtistDetailView.svelte`
- Secondary pages / maintenance surfaces: `src/lib/views/HomeView.svelte`, `src/lib/views/SearchResultsView.svelte`, `src/lib/views/PlaylistDetailView.svelte`, `src/lib/views/SettingsView.svelte`
- Existing tests: `src/tests/sidebar-layout.test.ts`, `src/tests/player-utility-controls.test.ts`, `src/tests/now-playing-overlay.test.ts`, `src/tests/now-playing-lyrics-tab.test.ts`, `src/tests/songs-view.test.ts`, `src/tests/albums-view.test.ts`, `src/tests/album-detail-view.test.ts`, `src/tests/playlist-detail-view.test.ts`, `src/tests/settings-view.test.ts`

---

## File / Module Map

### Global theme contract
- **Modify:** `src/app.css`
  - Replace ad-hoc theme variables with semantic surface/text/border/state/effect tokens
  - Add shared global utility classes only where cross-view consistency would otherwise duplicate style logic
- **Modify:** `src/main.ts`
  - Keep single global CSS entrypoint only; do not introduce parallel global stylesheets

### Shared UI primitives
- **Create:** `src/lib/components/ui/PageHeader.svelte`
  - Standard page title / subtitle / action slot pattern used by views
- **Create:** `src/lib/components/ui/SurfacePanel.svelte`
  - Shared panel container with tone/spacing props for panel vs inset vs elevated variants
- **Create:** `src/lib/components/ui/EmptyState.svelte`
  - Shared empty/error placeholder surface used by library and maintenance pages
- **Create:** `src/tests/theme-primitives.test.ts`
  - Contract tests for shared primitives and semantic token presence

### Shell + playback surfaces
- **Modify:** `src/App.svelte`
  - Apply unified shell spacing and container structure
- **Modify:** `src/lib/layout/Sidebar.svelte`
  - Replace toy-like styling with stable navigation shell language
- **Modify:** `src/lib/layout/TopBar.svelte`
  - Recast as lightweight tool bar with calmer search treatment
- **Modify:** `src/lib/player/BottomPlayerBar.svelte`
  - Keep B3 highlight concentrated here; use semantic tokens only
- **Modify:** `src/lib/player/NowPlayingOverlay.svelte`
  - Align overlay with new shell/panel language
- **Modify:** `src/lib/player/QueueList.svelte`
  - Align queue row states with selected/playing semantics used elsewhere
- **Modify:** `src/lib/player/NowPlayingLyricsTab.svelte`
  - Align timed/plain lyrics panel with the same panel/state system
- **Modify/Test:** `src/tests/sidebar-layout.test.ts`, `src/tests/player-utility-controls.test.ts`, `src/tests/now-playing-overlay.test.ts`, `src/tests/now-playing-lyrics-tab.test.ts`

### High-frequency library views
- **Modify:** `src/lib/views/SongsView.svelte`
- **Modify:** `src/lib/components/songs/SongsBulkActionBar.svelte`
- **Modify:** `src/lib/components/songs/SongsContextMenu.svelte`
- **Modify:** `src/lib/components/songs/SongsPlaylistPicker.svelte`
- **Modify:** `src/lib/components/songs/SongsTable.svelte`
- **Modify:** `src/lib/views/AlbumsView.svelte`
- **Modify:** `src/lib/views/AlbumDetailView.svelte`
- **Modify:** `src/lib/views/ArtistsView.svelte`
- **Modify:** `src/lib/views/ArtistDetailView.svelte`
- **Modify/Test:** `src/tests/songs-view.test.ts`, `src/tests/albums-view.test.ts`, `src/tests/album-detail-view.test.ts`

### Secondary pages / maintenance surfaces
- **Modify:** `src/lib/views/HomeView.svelte`
- **Modify:** `src/lib/views/SearchResultsView.svelte`
- **Modify:** `src/lib/views/PlaylistDetailView.svelte`
- **Modify:** `src/lib/views/SettingsView.svelte`
- **Modify:** `src/lib/views/settings-library-scan.ts`
- **Modify:** `src/lib/views/settings-output-device.ts`
- **Create:** `src/tests/theme-secondary-surfaces.test.ts`
  - Source / render contract for secondary pages that currently lack direct coverage
- **Modify/Test:** `src/tests/playlist-detail-view.test.ts`, `src/tests/settings-view.test.ts`, `src/tests/settings-library-scan.test.ts`

### Verification artifacts
- **Modify/Create as needed:** `.artifacts/browser/...` (generated evidence only; do not commit)
- **Optional hygiene:** `.gitignore` add `.superpowers/` if still missing before any execution that uses the visual companion again

---

## Task 0: Create isolated implementation worktree

**Files:** none

- [ ] **Step 1: Create a dedicated worktree and branch**

Run:
```bash
git fetch origin
git worktree add -b m002-s03-theme-redesign .worktrees/m002-s03-theme-redesign origin/main
```

- [ ] **Step 2: Install frontend dependencies in the worktree**

Run:
```bash
cd .worktrees/m002-s03-theme-redesign
npm --prefix ./src ci
```

- [ ] **Step 3: Capture a clean baseline before changing UI**

Run:
```bash
npm --prefix ./src run check
npm --prefix ./src run test -- --run tests/app-shell-wiring.test.ts tests/sidebar-layout.test.ts tests/player-utility-controls.test.ts tests/now-playing-overlay.test.ts tests/songs-view.test.ts tests/settings-view.test.ts
```
Expected: PASS

---

## Task 1: Build the semantic theme contract and shared UI primitives

**Files:**
- Modify: `src/app.css`
- Create: `src/lib/components/ui/PageHeader.svelte`
- Create: `src/lib/components/ui/SurfacePanel.svelte`
- Create: `src/lib/components/ui/EmptyState.svelte`
- Test: `src/tests/theme-primitives.test.ts`

- [ ] **Step 1: Write the failing token contract test**

Add `src/tests/theme-primitives.test.ts` with a source-level CSS contract:
```ts
it('defines the full semantic theme contract used by R009 surfaces', async () => {
  const css = await readFile(new URL('../app.css', import.meta.url), 'utf8');

  for (const token of [
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
  ]) {
    expect(css).toContain(token);
  }
});
```

- [ ] **Step 2: Write the failing shared primitive tests**

Add render tests:
```ts
it('renders PageHeader title, subtitle, and actions slot', () => {
  render(PageHeader, {
    props: { title: 'Songs', subtitle: '128 tracks' },
    slots: { actions: '<button>Action</button>' },
  });

  expect(screen.getByRole('heading', { name: 'Songs' })).toBeInTheDocument();
  expect(screen.getByText('128 tracks')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
});
```

```ts
it('applies tone classes on SurfacePanel without hardcoding theme colors', () => {
  render(SurfacePanel, { props: { tone: 'inset' }, slots: { default: 'Panel body' } });
  expect(screen.getByText('Panel body').closest('[data-surface-panel]')).toHaveAttribute('data-tone', 'inset');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:
```bash
npm --prefix ./src run test -- --run tests/theme-primitives.test.ts
```
Expected: FAIL because the semantic token names and UI primitives do not exist yet.

- [ ] **Step 4: Implement the minimal semantic token layer in `src/app.css`**

Introduce the new token families and map existing shell aliases onto them first:
```css
:root {
  --surface-canvas: #0b1120;
  --surface-shell: #0f172a;
  --surface-panel: #111c33;
  --surface-panel-subtle: #16233f;
  --surface-elevated: #0f1b31;
  --text-primary: #e2e8f0;
  --text-secondary: rgba(226, 232, 240, 0.82);
  --text-tertiary: rgba(148, 163, 184, 0.82);
  --text-on-accent: #eff6ff;
  --border-subtle: rgba(148, 163, 184, 0.14);
  --border-default: rgba(148, 163, 184, 0.22);
  --border-strong: rgba(148, 163, 184, 0.32);
  --accent: #3b82f6;
  --accent-soft: color-mix(in srgb, var(--accent) 16%, transparent);
  --state-selected: color-mix(in srgb, var(--accent) 18%, transparent);
  --state-playing: color-mix(in srgb, #10b981 24%, transparent);
  --state-danger: color-mix(in srgb, #ef4444 24%, transparent);
  --state-warning: color-mix(in srgb, #f59e0b 22%, transparent);
  --state-success: color-mix(in srgb, #10b981 20%, transparent);
  --shadow-soft: 0 10px 24px rgba(2, 6, 23, 0.14);
  --shadow-elevated: 0 18px 40px rgba(2, 6, 23, 0.24);
  --glow-accent: 0 12px 28px color-mix(in srgb, var(--accent) 24%, transparent);
  --focus-ring: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent);
}
```
Do the same for `:root[data-theme='light']` and keep `body/#app` on the single global entrypoint. Do not leave any token from the spec undefined just because the first migrated components do not consume it yet.

- [ ] **Step 5: Implement the minimal shared primitives**

Create focused components only:
```svelte
<!-- PageHeader.svelte -->
<script lang="ts">
  export let title: string;
  export let subtitle = '';
</script>

<header class="page-header" data-page-header>
  <div>
    <h2>{title}</h2>
    {#if subtitle}<p>{subtitle}</p>{/if}
  </div>
  <div class="actions"><slot name="actions" /></div>
</header>
```

```svelte
<!-- SurfacePanel.svelte -->
<script lang="ts">
  export let tone: 'default' | 'inset' | 'elevated' = 'default';
</script>

<section class="surface-panel" data-surface-panel data-tone={tone}>
  <slot />
</section>
```

```svelte
<!-- EmptyState.svelte -->
<script lang="ts">
  export let title: string;
  export let body = '';
</script>
```

- [ ] **Step 6: Run the primitive tests again**

Run:
```bash
npm --prefix ./src run test -- --run tests/theme-primitives.test.ts
```
Expected: PASS

- [ ] **Step 7: Commit the semantic theme baseline**

```bash
git add src/app.css src/lib/components/ui/PageHeader.svelte src/lib/components/ui/SurfacePanel.svelte src/lib/components/ui/EmptyState.svelte src/tests/theme-primitives.test.ts
git commit -m "feat(ui): add semantic theme primitives"
```

---

## Task 2: Rebuild the shell and playback surfaces on the new theme system

**Files:**
- Modify: `src/App.svelte`
- Modify: `src/lib/layout/Sidebar.svelte`
- Modify: `src/lib/layout/TopBar.svelte`
- Modify: `src/lib/player/BottomPlayerBar.svelte`
- Modify: `src/lib/player/NowPlayingOverlay.svelte`
- Modify: `src/lib/player/QueueList.svelte`
- Modify: `src/lib/player/NowPlayingLyricsTab.svelte`
- Test: `src/tests/app-shell-wiring.test.ts`
- Test: `src/tests/sidebar-layout.test.ts`
- Test: `src/tests/player-utility-controls.test.ts`
- Test: `src/tests/now-playing-overlay.test.ts`
- Test: `src/tests/now-playing-lyrics-tab.test.ts`

- [ ] **Step 1: Write the failing shell contract test**

Extend `src/tests/sidebar-layout.test.ts` (or add a sibling `shell-theme-contract.test.ts`) to lock in semantic usage instead of raw dark literals:
```ts
expect(source).toMatch(/var\(--surface-shell\)/);
expect(source).not.toMatch(/rgba\(15,\s*23,\s*42/);
expect(source).not.toContain('🎶');
```
If removing emoji branding is too aggressive after the first pass, keep the semantic-token assertions and drop only the branding check.

- [ ] **Step 2: Write the failing playback surface tests**

Add expectations that playback surfaces expose unified panel/tab semantics:
```ts
expect(await screen.findByRole('region', { name: '正在播放' })).toHaveAttribute('data-surface', 'overlay');
expect(screen.getByRole('tab', { name: '歌词' })).toHaveAttribute('data-variant', 'tab');
expect(screen.getByRole('button', { name: '队列' })).toHaveAttribute('data-variant', 'utility');
```

Add explicit popover coverage so queue/device/volume surfaces cannot be skipped:
```ts
await fireEvent.click(screen.getByRole('button', { name: '队列' }));
expect(screen.getByText('接下来播放').closest('[data-surface="popover"]')).toBeTruthy();

await fireEvent.click(screen.getByRole('button', { name: '输出设备' }));
expect(screen.getByText('输出设备').closest('[data-surface="popover"]')).toBeTruthy();

expect(screen.getByText('音量').closest('[data-surface="popover"]')).toBeTruthy();
```
If the volume popover only opens on hover/focus, add the smallest stable hook needed to assert it shares the same popover surface contract.

Add a lyrics test for selected/active state hooks:
```ts
expect(screen.getByTestId('lyrics-scroll-region')).toBeInTheDocument();
expect(screen.getAllByTestId(/lyrics-line|lyrics-guide-line/).length).toBeGreaterThan(0);
```
(Use the real selectors already present in `NowPlayingLyricsTab.svelte`; add `data-testid` only where needed to make the test stable.)

- [ ] **Step 3: Run the focused shell/playback tests to confirm failure**

Run:
```bash
npm --prefix ./src run test -- --run tests/app-shell-wiring.test.ts tests/sidebar-layout.test.ts tests/player-utility-controls.test.ts tests/now-playing-overlay.test.ts tests/now-playing-lyrics-tab.test.ts
```
Expected: FAIL because the shell and playback surfaces have not been migrated to the new semantic contract.

- [ ] **Step 4: Implement shell migration with shared primitives and semantic tokens**

Make the smallest structural changes that establish the new shell language:
- `App.svelte`: normalize outer spacing and main content framing
- `Sidebar.svelte`: calmer navigation rows, counts, create-button treatment, no page-specific dark literals
- `TopBar.svelte`: quieter branding, denser search field, semantic shell tokens only
- `BottomPlayerBar.svelte`: keep highlight/glow concentrated here; replace raw rgba literals with semantic state/effect tokens
- `NowPlayingOverlay.svelte`, `QueueList.svelte`, `NowPlayingLyricsTab.svelte`: align overlay/panel/tab/queue row semantics with the same shell/panel/state language
- `BottomPlayerBar` popovers: queue/device/volume popovers must expose the same elevated/panel treatment and test hooks as the overlay, not retain old one-off styling

If a component needs a stable attribute for tests, add one explicitly:
```svelte
<section class="now-playing-overlay" data-surface="overlay" aria-labelledby={overlayTitleId}>
```
Use the same approach for popovers:
```svelte
<div class="popover queue-popover" data-surface="popover">
```

- [ ] **Step 5: Run the focused shell/playback tests again**

Run:
```bash
npm --prefix ./src run test -- --run tests/app-shell-wiring.test.ts tests/sidebar-layout.test.ts tests/player-utility-controls.test.ts tests/now-playing-overlay.test.ts tests/now-playing-lyrics-tab.test.ts
```
Expected: PASS

- [ ] **Step 6: Run a dual-theme shell/playback smoke check before moving on**

Run the local app and verify in both dark and light:
- `Sidebar` + `TopBar` + `BottomPlayerBar`
- `NowPlayingOverlay`
- queue/device/volume popovers
- lyrics tab active/selected states

Capture at least one screenshot per theme before starting page migration.

- [ ] **Step 7: Commit the shell + playback migration**

```bash
git add src/App.svelte src/lib/layout/Sidebar.svelte src/lib/layout/TopBar.svelte src/lib/player/BottomPlayerBar.svelte src/lib/player/NowPlayingOverlay.svelte src/lib/player/QueueList.svelte src/lib/player/NowPlayingLyricsTab.svelte src/tests/app-shell-wiring.test.ts src/tests/sidebar-layout.test.ts src/tests/player-utility-controls.test.ts src/tests/now-playing-overlay.test.ts src/tests/now-playing-lyrics-tab.test.ts
git commit -m "feat(ui): redesign shell and playback surfaces"
```

---

## Task 3: Migrate the high-frequency library views

**Files:**
- Modify: `src/lib/views/SongsView.svelte`
- Modify: `src/lib/components/songs/SongsBulkActionBar.svelte`
- Modify: `src/lib/components/songs/SongsContextMenu.svelte`
- Modify: `src/lib/components/songs/SongsPlaylistPicker.svelte`
- Modify: `src/lib/components/songs/SongsTable.svelte`
- Modify: `src/lib/views/AlbumsView.svelte`
- Modify: `src/lib/views/AlbumDetailView.svelte`
- Modify: `src/lib/views/ArtistsView.svelte`
- Modify: `src/lib/views/ArtistDetailView.svelte`
- Test: `src/tests/songs-view.test.ts`
- Test: `src/tests/albums-view.test.ts`
- Test: `src/tests/album-detail-view.test.ts`
- Create: `src/tests/artists-view-theme.test.ts`

- [ ] **Step 1: Write the failing page-header/panel reuse tests**

Add assertions that high-frequency views use shared primitives instead of per-view wrappers:
```ts
expect(source).toContain("../components/ui/PageHeader.svelte");
expect(source).toContain("../components/ui/SurfacePanel.svelte");
```
Use file-read source tests if render tests would be too brittle for layout-only changes.

Create `src/tests/artists-view-theme.test.ts` so the artist surfaces have a task-local pass/fail checkpoint:
```ts
it('moves ArtistsView and ArtistDetailView onto the shared page/panel primitives', async () => {
  const artists = await readView('ArtistsView.svelte');
  const artistDetail = await readView('ArtistDetailView.svelte');

  expect(artists).toContain('PageHeader');
  expect(artists).toContain('SurfacePanel');
  expect(artistDetail).toContain('PageHeader');
  expect(artistDetail).toContain('SurfacePanel');
});
```

For `SongsView`, add a stable render assertion around the bulk action slot / empty state shell:
```ts
expect(screen.getByRole('heading', { name: 'Songs' })).toBeInTheDocument();
expect(screen.getByTestId('songs-empty-state')).toBeInTheDocument();
```
(If the test id does not exist, add it during implementation.)

- [ ] **Step 2: Run the high-frequency view tests to confirm failure**

Run:
```bash
npm --prefix ./src run test -- --run tests/songs-view.test.ts tests/albums-view.test.ts tests/album-detail-view.test.ts tests/artists-view-theme.test.ts
```
Expected: FAIL because the views still own too much page-level styling.

- [ ] **Step 3: Implement the minimal library-view migration**

Apply the shared page/panel system without changing feature behavior:
- `SongsView.svelte`: use `PageHeader`/`EmptyState`; move feedback/empty surfaces to semantic panels
- Songs subcomponents: align bulk action, context menu, picker, table row selection/playing styles with shared state tokens
- `AlbumsView.svelte`, `AlbumDetailView.svelte`, `ArtistsView.svelte`, `ArtistDetailView.svelte`: unify page header, panel, list/card density, selected/open states

Example seam:
```svelte
<PageHeader title="Songs" subtitle={`${tracks.length} tracks in your library`} />
<SurfacePanel tone="default">
  <!-- existing table / content -->
</SurfacePanel>
```

- [ ] **Step 4: Re-run the high-frequency view tests**

Run:
```bash
npm --prefix ./src run test -- --run tests/songs-view.test.ts tests/albums-view.test.ts tests/album-detail-view.test.ts tests/artists-view-theme.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit the high-frequency page migration**

```bash
git add src/lib/views/SongsView.svelte src/lib/components/songs/SongsBulkActionBar.svelte src/lib/components/songs/SongsContextMenu.svelte src/lib/components/songs/SongsPlaylistPicker.svelte src/lib/components/songs/SongsTable.svelte src/lib/views/AlbumsView.svelte src/lib/views/AlbumDetailView.svelte src/lib/views/ArtistsView.svelte src/lib/views/ArtistDetailView.svelte src/tests/songs-view.test.ts src/tests/albums-view.test.ts src/tests/album-detail-view.test.ts src/tests/artists-view-theme.test.ts
git commit -m "feat(ui): migrate primary library views to the new theme system"
```

---

## Task 4: Migrate secondary pages and maintenance surfaces, then verify both themes

**Files:**
- Modify: `src/lib/views/HomeView.svelte`
- Modify: `src/lib/views/SearchResultsView.svelte`
- Modify: `src/lib/views/PlaylistDetailView.svelte`
- Modify: `src/lib/views/SettingsView.svelte`
- Modify: `src/lib/views/settings-library-scan.ts`
- Modify: `src/lib/views/settings-output-device.ts`
- Create: `src/tests/theme-secondary-surfaces.test.ts`
- Modify: `src/tests/playlist-detail-view.test.ts`
- Modify: `src/tests/settings-view.test.ts`
- Modify: `src/tests/settings-library-scan.test.ts`

- [ ] **Step 1: Write the failing secondary-surface tests**

Create `src/tests/theme-secondary-surfaces.test.ts` with a small contract set:
```ts
it('moves Home, SearchResults, PlaylistDetail, and Settings onto the shared page/panel primitives', async () => {
  const files = await Promise.all([
    readView('HomeView.svelte'),
    readView('SearchResultsView.svelte'),
    readView('PlaylistDetailView.svelte'),
    readView('SettingsView.svelte'),
  ]);

  for (const source of files) {
    expect(source).toContain('PageHeader');
    expect(source).toContain('SurfacePanel');
  }
});
```

Extend `settings-view.test.ts` to assert the maintenance surface remains wired while the layout changes, and explicitly cover control/state semantics that are easy to skip:
```ts
expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
expect(screen.getByRole('button', { name: /Rescan Now|Full Scan/ })).toBeInTheDocument();
expect(screen.getByRole('button', { name: /Rescan Now|Full Scan/ })).toBeDisabled();
expect(screen.getByText(/failed|error/i)).toHaveAttribute('data-tone', 'danger');
expect(screen.getByText(/saved|ready|completed/i)).toHaveAttribute('data-tone', 'success');
```
If the current tests do not expose warning/success states, add the smallest helper fixture necessary so `active`, `disabled`, `warning`, and `success` styling is checked on at least one maintenance surface.

- [ ] **Step 2: Run the secondary-surface tests to confirm failure**

Run:
```bash
npm --prefix ./src run test -- --run tests/theme-secondary-surfaces.test.ts tests/playlist-detail-view.test.ts tests/settings-view.test.ts tests/settings-library-scan.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement the secondary-page migration**

Migrate these views to the same header/panel/empty-state system while preserving existing behavior:
- `HomeView.svelte`
- `SearchResultsView.svelte`
- `PlaylistDetailView.svelte`
- `SettingsView.svelte`
- `settings-library-scan.ts` / `settings-output-device.ts` only where helper wording or tone labels need to match the new system

Keep Settings functionally identical; this task is about surface consistency, not changing scan orchestration.

- [ ] **Step 4: Run the focused secondary-surface tests again**

Run:
```bash
npm --prefix ./src run test -- --run tests/theme-secondary-surfaces.test.ts tests/playlist-detail-view.test.ts tests/settings-view.test.ts tests/settings-library-scan.test.ts
```
Expected: PASS

- [ ] **Step 5: Run full type-check and the targeted redesign regression set**

Run:
```bash
npm --prefix ./src run check
npm --prefix ./src run test -- --run tests/app-shell-wiring.test.ts tests/theme-primitives.test.ts tests/sidebar-layout.test.ts tests/player-utility-controls.test.ts tests/now-playing-overlay.test.ts tests/now-playing-lyrics-tab.test.ts tests/songs-view.test.ts tests/albums-view.test.ts tests/album-detail-view.test.ts tests/playlist-detail-view.test.ts tests/settings-view.test.ts tests/settings-library-scan.test.ts tests/settings-output-device.test.ts tests/theme-secondary-surfaces.test.ts
```
Expected: PASS

- [ ] **Step 6: Capture dual-theme browser evidence**

Start the browser-verification runtime explicitly with the web dev server (not full Tauri) so browser automation targets the same deterministic UI each time:
```bash
npm --prefix ./src run dev -- --host 127.0.0.1 --port 1420
```
Then open `http://127.0.0.1:1420` in the browser tools and execute a real acceptance loop in both dark and light:
- shell (`Sidebar`, `TopBar`, `BottomPlayerBar`)
- playback surfaces (`NowPlayingOverlay`, queue popover, device popover, volume popover, lyrics tab)
- `Home`
- `Songs`
- `Albums`
- `AlbumDetail`
- `Artists`
- `ArtistDetail`
- `SearchResults`
- `PlaylistDetail`
- `Settings`

For **each theme**, perform this interaction loop and capture evidence:
1. Switch the theme in `Settings`
2. Run a search from `TopBar`
3. Open `Songs`, select a row, and verify active/selected styling
4. Start playback and verify `playing` styling in the list plus `BottomPlayerBar`
5. Open `NowPlayingOverlay`, switch between lyrics and queue, and open queue/device/volume popovers
6. Visit `AlbumDetail`, `Artists`, `ArtistDetail`, `SearchResults`, and `PlaylistDetail`
7. Toggle at least one Settings control and verify disabled/warning/success/danger states where applicable

Record screenshots or a browser debug bundle for each theme. The minimum evidence set must include every in-scope surface in both themes:
- dark shell (`Sidebar`, `TopBar`, `BottomPlayerBar`)
- dark `Home`
- dark `Songs`
- dark `Albums`
- dark `AlbumDetail`
- dark `Artists`
- dark `ArtistDetail`
- dark `SearchResults`
- dark `PlaylistDetail`
- dark `Settings`
- dark `NowPlayingOverlay` + queue/device/volume popovers + lyrics tab
- light shell (`Sidebar`, `TopBar`, `BottomPlayerBar`)
- light `Home`
- light `Songs`
- light `Albums`
- light `AlbumDetail`
- light `Artists`
- light `ArtistDetail`
- light `SearchResults`
- light `PlaylistDetail`
- light `Settings`
- light `NowPlayingOverlay` + queue/device/volume popovers + lyrics tab

- [ ] **Step 7: Commit the secondary migration and verification-ready state**

```bash
git add src/lib/views/HomeView.svelte src/lib/views/SearchResultsView.svelte src/lib/views/PlaylistDetailView.svelte src/lib/views/SettingsView.svelte src/lib/views/settings-library-scan.ts src/lib/views/settings-output-device.ts src/tests/theme-secondary-surfaces.test.ts src/tests/playlist-detail-view.test.ts src/tests/settings-view.test.ts src/tests/settings-library-scan.test.ts src/tests/settings-output-device.test.ts
git commit -m "feat(ui): migrate secondary surfaces and complete theme redesign"
```

---

## Verification Checklist

- [ ] `src/app.css` exposes the semantic token families defined by the spec
- [ ] Shell surfaces no longer depend on per-component hardcoded dark rgba values for theme identity
- [ ] `BottomPlayerBar`, `NowPlayingOverlay`, queue, lyrics, and queue/device/volume popovers all share one visual language
- [ ] High-frequency library pages use the shared header/panel system
- [ ] Secondary pages and Settings use the same header/panel/empty-state system
- [ ] Hover / active / selected / playing / disabled / missing / warning / success / danger states read consistently across pages and playback surfaces
- [ ] Dark and light themes both have evidence on the minimum verification set
- [ ] `npm --prefix ./src run check` passes
- [ ] Focused redesign regression tests pass

---

## Notes for Implementers

- Keep `watcher` and auto-sync scope out of this plan. This is the R009 visual redesign track only.
- Avoid introducing a sprawling design system. Only add shared primitives that remove real duplication across shell/pages.
- If a render test becomes too brittle for pure styling changes, prefer a focused source-contract test that enforces shared primitive usage or bans raw theme literals.
- Do not silently widen the scope into product-model changes (routing, navigation taxonomy, library behavior). Layout reshaping is allowed; capability redesign is not.
- If `.superpowers/` is still unignored, add it to `.gitignore` before running more visual-companion sessions so the plan/worktree stays clean.
