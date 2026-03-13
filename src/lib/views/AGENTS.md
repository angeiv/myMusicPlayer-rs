# src/lib/views (Route-Level Screens)

## Overview
Screen components: load data, call Tauri commands, render UI state.

## Where To Look
- Songs list: `src/lib/views/SongsView.svelte` (invokes `play`).
- Album detail: `src/lib/views/AlbumDetailView.svelte` (invokes `get_album`, `get_tracks_by_album`).
- Artist detail: `src/lib/views/ArtistDetailView.svelte` (invokes `get_artist`, `get_tracks_by_artist`, `get_albums_by_artist`).
- Playlist detail: `src/lib/views/PlaylistDetailView.svelte` (invokes `get_playlist`, `get_track`, `remove_from_playlist`, `update_playlist_metadata`).
- Search results: `src/lib/views/SearchResultsView.svelte` (plays via `play`).
- Settings: `src/lib/views/SettingsView.svelte` (invokes config + scan).

## Conventions
- Tauri calls are gated by `isTauri` (`src/lib/utils/env.ts`); non-Tauri falls back to mock data.
- Loading pattern: track `lastRequestedId` to prevent stale async updates (see album/artist/playlist detail views).

## Anti-Patterns
- Avoid unbounded fan-out `invoke` loops; `PlaylistDetailView.svelte` resolves many tracks by ID via `Promise.all`.
- Avoid mixing mock + real error messages; only show user-facing errors in Tauri mode.
