# Project Knowledge Base

Generated: 2026-03-13
Baseline: commit e06c3c5 (branch: main)

## Overview
- Desktop music player: Tauri 2 (Rust backend) + Svelte 5/TS (Vite frontend).
- Frontend lives in `src/`, backend in `src-tauri/`.

## Structure
```
./
├── justfile                 # canonical dev/test/build/package entrypoints
├── config/                  # rustfmt/toolchain/cargo-deny policies
├── src/                     # Svelte + TS + Vite app (outputs to ./dist)
├── src-tauri/               # Rust crate + Tauri config/bundle/capabilities
├── packaging/               # optional platform scripts/docs
├── resources/               # platform resources used by packaging scripts
└── dist/                    # Vite build output (Tauri bundles this)
```

## Where To Look
| Task | Location | Notes |
|------|----------|-------|
| Start the app (Rust) | `src-tauri/src/main.rs` | thin wrapper; calls into `music_player_rs::run()` |
| App composition + command registration | `src-tauri/src/lib.rs` | AppState + plugins + `generate_handler![...]` |
| Tauri command implementations | `src-tauri/src/api/` | `#[tauri::command]` fns grouped by domain |
| Audio runtime core | `src-tauri/src/services/audio/` | playback thread + queue + analyzer |
| Library database + scanning | `src-tauri/src/services/library/mod.rs` | SQLite schema + scan + queries (large file) |
| Frontend entry + routing | `src/main.ts`, `src/App.svelte` | hash-router + view switching |
| Frontend DTOs | `src/lib/types.ts` | mirrors Rust models (Track/Album/Artist/Playlist) |
| Frontend playback UI | `src/lib/player/BottomPlayerBar.svelte` | polls playback state + invokes audio commands |

## Code Map (Hubs)
- Backend composition root: `src-tauri/src/lib.rs`.
- Backend shared contracts: `src-tauri/src/models/mod.rs`.
- Backend transport surface: `src-tauri/src/api/mod.rs`.
- Backend heavy domains: `src-tauri/src/services/audio/mod.rs`, `src-tauri/src/services/library/mod.rs`.
- Frontend composition root: `src/App.svelte`.
- Frontend shared helpers: `src/lib/utils/env.ts`, `src/lib/utils/format.ts`.

## Commands
Preferred entrypoint is `just`:
```bash
just --list
just dev          # vite (port 1420) + cargo tauri dev
just check        # cargo fmt --check + clippy -D warnings + svelte-check
just test         # cargo test (backend)
just qa           # check + test
just package      # build + cargo tauri build
```

Direct equivalents:
```bash
npm --prefix ./src run dev
npm --prefix ./src run build
npm --prefix ./src run check

cargo test  --manifest-path ./src-tauri/Cargo.toml --all-features -- --nocapture
cargo tauri dev   --manifest-path ./src-tauri/Cargo.toml
cargo tauri build --manifest-path ./src-tauri/Cargo.toml
```

## Conventions (Repo-Specific)
- `justfile` is the source of truth for workflows; there is no populated `.github/workflows/*`.
- Rust formatting is configured in `config/rustfmt.toml` (imports grouped, comments wrapped, 100 col width).
- Pre-commit is strict: `clippy` runs with `--all-targets --all-features -- -D warnings` in `.pre-commit-config.yaml`.
- Frontend build outputs to `./dist` (see `src/vite.config.ts`), and Tauri bundles `../dist` (see `src-tauri/Tauri.toml`).

## Anti-Patterns (This Repo)
- Do not remove Windows subsystem attribute: `src-tauri/src/main.rs`.
- Do not rely on stubbed config: `src-tauri/src/api/config/mod.rs` is TODO/no-op today.
- Avoid exposing borrowed refs backed by TLS + `unsafe`: `src-tauri/src/services/audio/mod.rs` (`current_track`).
- Beware placeholder behaviors: `src-tauri/src/services/audio/mod.rs` (`get_queue` returns empty).
- Prefer avoiding panics in runtime paths: several services use `expect`/`unwrap` in non-test code.

## Notes
- Toolchain mismatch: `src-tauri/Cargo.toml` declares `rust-version = "1.87"`, but `config/rust-toolchain.toml` pins `channel = "1.75.0"`.
- `cargo tauri build` already runs `beforeBuildCommand` (`src-tauri/Tauri.toml`), so some `just package*` tasks run a redundant frontend build.
