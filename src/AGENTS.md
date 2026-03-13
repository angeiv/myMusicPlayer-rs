# src (Frontend: Svelte + TS + Vite)

## Overview
Svelte 5 app built by Vite; bundled output goes to `../dist` for Tauri.

## Where To Look
- Entry: `src/main.ts` (Svelte 5 `mount`).
- App shell + routing: `src/App.svelte`.
- Vite config (port/output/base): `src/vite.config.ts`.
- Shared DTOs: `src/lib/types.ts`.
- Tauri environment gate: `src/lib/utils/env.ts` (`isTauri`).
- Playback UI: `src/lib/player/BottomPlayerBar.svelte`.
- Screens: `src/lib/views/*.svelte`.

## Commands
```bash
npm --prefix ./src install
npm --prefix ./src run dev     # http://localhost:1420
npm --prefix ./src run check   # svelte-check
npm --prefix ./src run build   # tsc + vite build -> ./dist
```

## Conventions
- Non-Tauri runs use mock data (see `src/lib/mocks/library.ts`) and gate behavior via `isTauri`.
- Hash routing is custom and lives in `src/lib/stores/router.ts`.

## Anti-Patterns
- Avoid adding ad-hoc `window.__TAURI__` checks; use `src/lib/utils/env.ts`.
- Keep Tauri `invoke(...)` calls inside views/player; avoid sprinkling them into low-level pure utils.
