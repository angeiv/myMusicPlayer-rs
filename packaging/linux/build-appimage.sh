#!/usr/bin/env bash
set -euo pipefail

# Historical helper. Canonical path: repo root -> just package-linux

script_path="packaging/linux/build-appimage.sh"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd -- "${script_dir}/../.." && pwd)"

printf '%s\n' "${script_path}: Historical helper. Canonical path: repo root -> just package-linux" >&2
printf '%s\n' "${script_path}: Falling back to the underlying cargo tauri build target for compatibility." >&2

if command -v just >/dev/null 2>&1; then
  cd -- "${project_root}"
  exec just package-linux
fi

cd -- "${project_root}"
cargo tauri build --target x86_64-unknown-linux-gnu
