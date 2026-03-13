# src/lib/player (Playback UI)

## Overview
Global bottom player bar: polls backend playback state, dispatches play/pause/seek/volume.

## Where To Look
- Main component: `src/lib/player/BottomPlayerBar.svelte`.
- Playback state typing: `src/lib/types.ts` (`PlaybackStateInfo`).

## Conventions
- Poll interval is `REFRESH_INTERVAL = 1000`ms; state refresh uses `Promise.all` for `get_playback_state`, `get_current_track`, `get_volume`.
- Optimistic UI updates are followed by `refreshState()` to resync.
- Non-Tauri mode simulates playback and uses `src/lib/mocks/library.ts`.

## Anti-Patterns
- Avoid adding more `any` parsing; `normalizePlaybackState` currently uses `Record<string, any>` to tolerate variant serialization.
- Avoid seeking when not in `playing`/`paused` states; keep behavior consistent with backend commands.
