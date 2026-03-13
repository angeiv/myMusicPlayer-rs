# src-tauri/src (Rust Backend)

## Overview
Backend composition root + domain services + Tauri command surface.

## Where To Look
- AppState + plugins + command registration: `src-tauri/src/lib.rs`.
- Domain commands (frontend `invoke("...")` strings): `src-tauri/src/api/`.
- Domain services: `src-tauri/src/services/`.
- Shared DTOs: `src-tauri/src/models/`.
- Backend helpers (dirs, paths, misc): `src-tauri/src/utils/mod.rs`.

## How Commands Are Wired
- Registration is centralized in `src-tauri/src/lib.rs` via `invoke_handler(tauri::generate_handler![...])`.
- Each `#[tauri::command]` lives under `src-tauri/src/api/<domain>/mod.rs`.

## Testing Pattern
- Tests are mostly colocated at the bottom of modules (`#[cfg(test)] mod tests { ... }`).
- Run via `just test` or `cargo test --manifest-path ./src-tauri/Cargo.toml`.

## Conventions
- Command fns return `Result<_, String>` and log via `log::{info,error}` (see `src-tauri/src/api/audio/mod.rs`).
- Prefer: lock state, do sync work, release lock; do not hold a lock across `.await`.

## Anti-Patterns
- Avoid adding new commands without also adding them to the `generate_handler![...]` list in `src-tauri/src/lib.rs`.
- Avoid `expect`/`unwrap` in long-lived runtime paths (audio/library); surface errors via `anyhow`/`thiserror` and map at the API boundary.
