# src-tauri/src/services/library (Library + SQLite)

## Overview
Scans filesystem, extracts tags/metadata, persists normalized library data in SQLite.

## Where To Look
- Everything is currently concentrated in one module: `src-tauri/src/services/library/mod.rs`.
- App data directory helpers: `src-tauri/src/utils/mod.rs`.

## Conventions
- Library DB file name is `library.sqlite` (see `src-tauri/src/services/library/mod.rs`).
- Scans use `walkdir` and metadata uses `lofty`.
- Inserts/updates run in a transaction during scans.

## Testing Pattern
- Tests are colocated; library tests use `tempfile` (dev-dependency in `src-tauri/Cargo.toml`).

## Anti-Patterns
- Avoid growing the monolith further; consider splitting schema/query/mapping when touching large areas.
- Avoid panics on IO/tag extraction; prefer returning errors and continuing scan where possible.
