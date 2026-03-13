# src-tauri/src/services/playlist (Playlists)

## Overview
Playlist domain rules (CRUD, ordering) used by the playlist command surface.

## Where To Look
- Playlist service: `src-tauri/src/services/playlist/mod.rs`.
- Playlist model: `src-tauri/src/models/playlist.rs`.

## Conventions
- Keep playlist business rules here; API layer should remain thin.
- Tests are colocated in `src-tauri/src/services/playlist/mod.rs`.

## Anti-Patterns
- Avoid adding persistence in the API layer; if persistence is introduced, keep it in services.
