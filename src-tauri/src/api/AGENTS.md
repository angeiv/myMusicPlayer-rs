# src-tauri/src/api (Tauri Commands)

## Overview
Thin command layer: validates inputs, locks `AppState`, calls services, maps errors to `String`.

## Where To Look
- Domain barrels: `src-tauri/src/api/mod.rs`.
- Audio commands: `src-tauri/src/api/audio/mod.rs`.
- Library commands: `src-tauri/src/api/library/mod.rs`.
- Playlist commands: `src-tauri/src/api/playlist/mod.rs`.
- Config commands: `src-tauri/src/api/config/mod.rs` (currently mostly TODO).
- Misc commands: `src-tauri/src/api/misc/mod.rs` (`greet`).

## Conventions
- The frontend calls by command name: `invoke("get_tracks", ...)` matches the Rust function name.
- Keep payload shapes stable; update frontend callers in `src/lib/views/*.svelte` and `src/lib/player/BottomPlayerBar.svelte` when changing args.

## Anti-Patterns
- Do not forget to register new commands in `src-tauri/src/lib.rs`.
- Avoid heavy logic here; keep it in `src-tauri/src/services/*`.
