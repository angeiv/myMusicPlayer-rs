# Packaging collateral

`packaging/` is secondary material. The authoritative packaging contract lives at the repo root via `just` recipes and the Tauri bundle configuration.

## Authoritative packaging path

Run packaging work from the repository root:

- `just package` — default Tauri bundling path for the current host environment.
- `just package-macos` — primary release-facing macOS bundle proof lane.
- `just package-linux` — proof-only Linux bundle evidence.
- `just package-windows` — proof-only Windows bundle evidence.

For maintainers who need the underlying command shape, the repo-root recipes reduce to `cargo tauri build` plus target selection from the repository root.

## Platform boundary

- Primary release-facing packaging lane: macOS
- Proof-only packaging lanes: Linux and Windows
- Deferred formal support: Windows

macOS is the only lane this milestone treats as release-facing. Linux and Windows bundle outputs are still useful as proof and regression evidence, but this directory should not be read as a formal promise of day-to-day release support on those platforms.

## Legacy helper status

Historical helpers under `packaging/` are secondary maintainer entrypoints, not the public packaging contract.

They remain here so older notes, bookmarks, or muscle memory resolve to the current repo-root flow instead of silently keeping a parallel build story alive:

- `packaging/macos/build.sh` and `packaging/macos/build-app.sh` warn, then fall back to the macOS Tauri bundle lane.
- `packaging/linux/build-appimage.sh` warns, then falls back to the Linux proof-only Tauri bundle lane.
- `packaging/linux/build-deb.sh` is historical-only and exits with guidance because there is no current repo-root `.deb` packaging contract.
- `packaging/windows/build.ps1` and `packaging/windows/build.bat` are proof-only Windows-local helpers behind the repo-root lane.

## When to use this directory

Use `packaging/` when you need to:

- inspect historical platform-specific packaging experiments,
- follow an older internal note and get routed back to the current repo-root workflow, or
- read helper warnings while investigating packaging drift with `bash scripts/verify-m003-s01-contract.sh`.

If you are documenting the project for a new reader, link to the repo-root `README.md` and `just --list`, not to a direct helper under `packaging/`.
