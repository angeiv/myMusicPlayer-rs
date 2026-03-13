# src-tauri (Tauri + Rust)

## Overview
This directory is the Tauri 2 Rust crate and bundle config.

## Where To Look
- Crate manifest: `src-tauri/Cargo.toml` (deps, features, rust-version).
- App config: `src-tauri/Tauri.toml` (devUrl, frontendDist, bundle targets, beforeBuildCommand).
- Binary entry: `src-tauri/src/main.rs` -> `music_player_rs::run()`.
- Build script: `src-tauri/build.rs` (tauri-build).
- Capabilities: `src-tauri/capabilities/default.json`.
- Generated schemas: `src-tauri/gen/schemas/`.

## Commands
```bash
# Run Tauri dev (expects Vite dev server at devUrl)
TAURI_DEV_URL=http://localhost:1420 cargo tauri dev --manifest-path ./src-tauri/Cargo.toml

# Build/bundle
cargo tauri build --manifest-path ./src-tauri/Cargo.toml
```

## Conventions
- `Tauri.toml` is used (not `tauri.conf.json`).
- Bundle targets are configured in `src-tauri/Tauri.toml` (includes dmg/msi/appimage).

## Anti-Patterns
- Avoid changing `devUrl`/Vite port without also updating `src/vite.config.ts` and `justfile`.
- Avoid silently depending on `config/rust-toolchain.toml` without reconciling it with `rust-version` in `src-tauri/Cargo.toml`.
