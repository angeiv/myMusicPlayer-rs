# myMusicPlayer-rs

A local-first desktop music player for a personal library, built with Tauri 2, Rust, Svelte 5, and SQLite.

This repository is being prepared for truthful public release. The repo root is the entry surface: clone here, use the repo-root `just` recipes, and treat the packaging helpers under `packaging/` as secondary material rather than the primary workflow.

## Project overview

- Desktop app with a Rust/Tauri backend and a Svelte/Vite frontend.
- Focused on a local library workflow: scan, browse, play, and keep the library state explainable.
- Meant to be both a daily-use tool and a readable Tauri/Rust practice project.

## Prerequisites

Install these tools before running the app from a fresh clone:

- Rust toolchain (`rustup`, `cargo`)
- Node.js and npm
- [`just`](https://github.com/casey/just)
- `cargo-tauri`

Notes:

- On Unix-like systems, `just install` will bootstrap `rustup` if it is missing, then install frontend dependencies and `cargo-tauri`.
- On Windows, the helper recipe expects Rust to already be installed. Windows remains a deferred formal support lane for this project.

## Repo-root workflow

These repo-root recipes are the canonical public command contract for M003:

- `just --list` — inspect the available repo-root workflows.
- `just install` — install repo dependencies for local development.
- `just qa` — run the repo-root quality and test baseline.
- `just test-frontend` — run the repo-root frontend behavior proof lane without widening `just qa`.
- `just dev` — start the development app path.
- `just info` — run the Tauri CLI environment canary from the repo root.
- `just package` — package via the Tauri bundle configuration.

Recommended order from a fresh clone:

```bash
just install
just qa
just test-frontend
just dev
```

Use `just test-frontend` when a change touches frontend behavior or when you want the explicit CI lane locally. Use `just package` when you need a local bundle proof instead of a development session.

## Verification path

Use these checks from the repo root:

```bash
bash scripts/verify-m003-s01-contract.sh
bash scripts/test-verify-m003-s01-contract.sh
just --list
just qa
just test-frontend
just info
```

Native UAT fits after `just qa` when a change touches the real Tauri runtime or macOS release-facing proof path. For that maintainer flow, use the existing native-UAT helpers instead of treating the browser shell alone as acceptance evidence.

## Support boundary

- Primary release-facing platform: macOS
- Proof-only additional build lanes: Linux and Windows
- Deferred formal support: Windows

What that means in practice:

- macOS is the lane this milestone treats as the release-facing proof path.
- Linux and Windows bundle commands may still be used as build evidence, but they are not being presented as fully supported day-to-day release promises in M003.
- `packaging/` contains older helper material and platform-specific scripts. Read it as supporting context, not as the primary public runbook.

## Repository map

- `justfile` — canonical repo-root workflows
- `src/` — Svelte 5 + TypeScript frontend
- `src-tauri/` — Rust crate, Tauri configuration, and bundle metadata
- `scripts/` — local verification and dev helpers
- `packaging/` — secondary packaging collateral and historical helpers

## License

GPL-3.0. See [`LICENSE`](./LICENSE).
