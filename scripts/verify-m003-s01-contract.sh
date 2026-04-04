#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
default_repo_root="$(cd -- "${script_dir}/.." && pwd)"
repo_root="${MUSIC_PLAYER_RS_CONTRACT_ROOT:-${default_repo_root}}"
mode="${1:---full}"

fail() {
  printf 'verify-m003-s01-contract: %s\n' "$1" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: bash scripts/verify-m003-s01-contract.sh [--full|--core]

Modes:
  --full    verify the repo-root contract plus packaging collateral (default)
  --core    verify only the repo-root public contract introduced in M003/S01/T01

Environment:
  MUSIC_PLAYER_RS_CONTRACT_ROOT  optional repo root override for fixture tests
EOF
}

require_file() {
  local path="$1"
  local description="$2"
  [[ -f "${path}" ]] || fail "missing ${description} at ${path}"
}

require_text() {
  local path="$1"
  local description="$2"
  local expected="$3"
  local label="$4"
  grep -Fq -- "${expected}" "${path}" || fail "${description} is missing ${label}: ${expected}"
}

reject_text() {
  local path="$1"
  local description="$2"
  local rejected="$3"
  local label="$4"
  if grep -Fq -- "${rejected}" "${path}"; then
    fail "${description} still contains ${label}: ${rejected}"
  fi
}

require_just_listing() {
  local output="$1"
  local recipe="$2"
  local description="$3"
  JUST_OUTPUT="${output}" python3 - "${recipe}" "${description}" <<'PY'
import os
import re
import sys

recipe = sys.argv[1]
description = sys.argv[2]
output = os.environ["JUST_OUTPUT"]
pattern = rf"^\s*{re.escape(recipe)}\s+# {re.escape(description)}$"
if not re.search(pattern, output, flags=re.MULTILINE):
    raise SystemExit(f"just --list is missing required public recipe: {recipe} (# {description})")
PY
}

verify_core() {
  local readme_path="${repo_root}/README.md"
  local justfile_path="${repo_root}/justfile"
  local cargo_toml_path="${repo_root}/src-tauri/Cargo.toml"
  local tauri_toml_path="${repo_root}/src-tauri/Tauri.toml"
  local just_output

  require_file "${readme_path}" "README.md"
  require_file "${justfile_path}" "justfile"
  require_file "${cargo_toml_path}" "src-tauri/Cargo.toml"
  require_file "${tauri_toml_path}" "src-tauri/Tauri.toml"

  require_text "${readme_path}" "README.md" "## Project overview" "section heading"
  require_text "${readme_path}" "README.md" "## Prerequisites" "section heading"
  require_text "${readme_path}" "README.md" "## Repo-root workflow" "section heading"
  require_text "${readme_path}" "README.md" "## Verification path" "section heading"
  require_text "${readme_path}" "README.md" "## Support boundary" "section heading"

  require_text "${readme_path}" "README.md" "just install" "required command reference"
  require_text "${readme_path}" "README.md" "just qa" "required command reference"
  require_text "${readme_path}" "README.md" "just test-frontend" "required command reference"
  require_text "${readme_path}" "README.md" "just dev" "required command reference"
  require_text "${readme_path}" "README.md" "just info" "required command reference"
  require_text "${readme_path}" "README.md" "just package" "required command reference"
  require_text "${readme_path}" "README.md" 'Native UAT fits after `just qa`' "native-UAT lifecycle guidance"
  require_text "${readme_path}" "README.md" "Primary release-facing platform: macOS" "support-boundary marker"
  require_text "${readme_path}" "README.md" "Proof-only additional build lanes: Linux and Windows" "support-boundary marker"
  require_text "${readme_path}" "README.md" "Deferred formal support: Windows" "support-boundary marker"

  require_text "${justfile_path}" "justfile" "test-frontend:" "frontend proof recipe"
  require_text "${justfile_path}" "justfile" "{{npm_bin}} --prefix {{frontend_dir}} run test -- --run" "frontend proof command"
  require_text "${justfile_path}" "justfile" "cargo tauri info" "Tauri info canary command"
  require_text "${justfile_path}" "justfile" "cargo tauri build" "Tauri build command"

  reject_text "${readme_path}" "README.md" "--manifest-path" "stale Tauri CLI example"
  reject_text "${justfile_path}" "justfile" "cargo tauri info --manifest-path" "stale Tauri CLI flag"
  reject_text "${justfile_path}" "justfile" "cargo tauri build --manifest-path" "stale Tauri CLI flag"

  if ! just_output="$(cd -- "${repo_root}" && just --list 2>&1)"; then
    printf '%s\n' "${just_output}" >&2
    fail "just --list failed while checking the public recipe contract"
  fi

  require_just_listing "${just_output}" "install" "Install repo dependencies for local development"
  require_just_listing "${just_output}" "qa" "Run the repo-root quality and test baseline"
  require_just_listing "${just_output}" "test-frontend" "Run the repo-root frontend behavior proof lane"
  require_just_listing "${just_output}" "dev" "Run the application in development mode"
  require_just_listing "${just_output}" "package" "Package via the Tauri bundle configuration"
  require_just_listing "${just_output}" "info" "Run the Tauri CLI environment canary"

  python3 - "${cargo_toml_path}" "${tauri_toml_path}" <<'PY'
from pathlib import Path
import sys

try:
    import tomllib
except ModuleNotFoundError:
    raise SystemExit('Python 3.11+ with tomllib is required for verify-m003-s01-contract.sh')

cargo_path = Path(sys.argv[1])
tauri_path = Path(sys.argv[2])

cargo = tomllib.loads(cargo_path.read_text(encoding='utf-8'))
tauri = tomllib.loads(tauri_path.read_text(encoding='utf-8'))

expected = {
    'cargo_description': 'Local-first desktop music player with a Tauri 2 + Rust backend',
    'tauri_short': 'Local-first desktop music player',
    'tauri_long': 'Local-first desktop music player with a Tauri and Rust stack. macOS is the primary release-facing lane; Linux and Windows bundle lanes remain proof-only evidence.',
}

actual_cargo_description = ((cargo.get('package') or {}).get('description'))
if actual_cargo_description != expected['cargo_description']:
    raise SystemExit(
        'Cargo.toml description does not match the public contract: '
        f"expected {expected['cargo_description']!r}, got {actual_cargo_description!r}"
    )

bundle = tauri.get('bundle') or {}
actual_tauri_short = bundle.get('shortDescription')
if actual_tauri_short != expected['tauri_short']:
    raise SystemExit(
        'Tauri.toml bundle.shortDescription does not match the public contract: '
        f"expected {expected['tauri_short']!r}, got {actual_tauri_short!r}"
    )

actual_tauri_long = bundle.get('longDescription')
if actual_tauri_long != expected['tauri_long']:
    raise SystemExit(
        'Tauri.toml bundle.longDescription does not match the public contract: '
        f"expected {expected['tauri_long']!r}, got {actual_tauri_long!r}"
    )
PY

  printf 'verify-m003-s01-contract: core contract checks passed for %s\n' "${repo_root}"
}

verify_packaging() {
  local packaging_readme_path="${repo_root}/packaging/README.md"
  local macos_build_path="${repo_root}/packaging/macos/build.sh"
  local macos_build_app_path="${repo_root}/packaging/macos/build-app.sh"
  local linux_deb_path="${repo_root}/packaging/linux/build-deb.sh"
  local linux_appimage_path="${repo_root}/packaging/linux/build-appimage.sh"
  local windows_ps1_path="${repo_root}/packaging/windows/build.ps1"
  local windows_bat_path="${repo_root}/packaging/windows/build.bat"

  require_file "${packaging_readme_path}" "packaging/README.md"
  require_file "${macos_build_path}" "packaging/macos/build.sh"
  require_file "${macos_build_app_path}" "packaging/macos/build-app.sh"
  require_file "${linux_deb_path}" "packaging/linux/build-deb.sh"
  require_file "${linux_appimage_path}" "packaging/linux/build-appimage.sh"
  require_file "${windows_ps1_path}" "packaging/windows/build.ps1"
  require_file "${windows_bat_path}" "packaging/windows/build.bat"

  require_text "${packaging_readme_path}" "packaging/README.md" "## Authoritative packaging path" "section heading"
  require_text "${packaging_readme_path}" "packaging/README.md" "just package" "canonical packaging reference"
  require_text "${packaging_readme_path}" "packaging/README.md" "just package-macos" "canonical packaging reference"
  require_text "${packaging_readme_path}" "packaging/README.md" "just package-linux" "canonical packaging reference"
  require_text "${packaging_readme_path}" "packaging/README.md" "just package-windows" "canonical packaging reference"
  require_text "${packaging_readme_path}" "packaging/README.md" "cargo tauri build" "underlying Tauri command reference"
  require_text "${packaging_readme_path}" "packaging/README.md" "## Platform boundary" "section heading"
  require_text "${packaging_readme_path}" "packaging/README.md" "Primary release-facing packaging lane: macOS" "platform-boundary marker"
  require_text "${packaging_readme_path}" "packaging/README.md" "Proof-only packaging lanes: Linux and Windows" "platform-boundary marker"
  require_text "${packaging_readme_path}" "packaging/README.md" "Deferred formal support: Windows" "platform-boundary marker"
  require_text "${packaging_readme_path}" "packaging/README.md" 'Historical helpers under `packaging/` are secondary maintainer entrypoints, not the public packaging contract.' "legacy-helper demotion marker"

  reject_text "${packaging_readme_path}" "packaging/README.md" "Or run the packaging script directly:" "legacy direct-script guidance"
  reject_text "${packaging_readme_path}" "packaging/README.md" "./packaging/macos/build-app.sh" "legacy direct-script guidance"
  reject_text "${packaging_readme_path}" "packaging/README.md" "./packaging/linux/build-deb.sh" "legacy direct-script guidance"
  reject_text "${packaging_readme_path}" "packaging/README.md" "./packaging/linux/build-appimage.sh" "legacy direct-script guidance"
  reject_text "${packaging_readme_path}" "packaging/README.md" "Windows is fully supported" "unsupported platform claim"
  reject_text "${packaging_readme_path}" "packaging/README.md" "--manifest-path" "stale Tauri CLI example"

  require_text "${macos_build_path}" "packaging/macos/build.sh" "Historical helper. Canonical path: repo root -> just package-macos" "demotion header"
  require_text "${macos_build_path}" "packaging/macos/build.sh" "Falling back to the underlying cargo tauri build targets for compatibility." "runtime warning"
  reject_text "${macos_build_path}" "packaging/macos/build.sh" "cargo tauri build --manifest-path" "stale Tauri CLI flag"
  require_text "${macos_build_path}" "packaging/macos/build.sh" "cargo tauri build --target aarch64-apple-darwin" "compatibility target"
  require_text "${macos_build_path}" "packaging/macos/build.sh" "cargo tauri build --target x86_64-apple-darwin" "compatibility target"

  require_text "${macos_build_app_path}" "packaging/macos/build-app.sh" "Historical helper. Canonical path: repo root -> just package-macos" "demotion header"
  require_text "${macos_build_app_path}" "packaging/macos/build-app.sh" "Falling back to the underlying cargo tauri build targets for compatibility." "runtime warning"
  reject_text "${macos_build_app_path}" "packaging/macos/build-app.sh" "cargo tauri build --manifest-path" "stale Tauri CLI flag"
  require_text "${macos_build_app_path}" "packaging/macos/build-app.sh" "cargo tauri build --target aarch64-apple-darwin" "compatibility target"
  require_text "${macos_build_app_path}" "packaging/macos/build-app.sh" "cargo tauri build --target x86_64-apple-darwin" "compatibility target"

  require_text "${linux_appimage_path}" "packaging/linux/build-appimage.sh" "Historical helper. Canonical path: repo root -> just package-linux" "demotion header"
  require_text "${linux_appimage_path}" "packaging/linux/build-appimage.sh" "Falling back to the underlying cargo tauri build target for compatibility." "runtime warning"
  reject_text "${linux_appimage_path}" "packaging/linux/build-appimage.sh" "cargo tauri build --manifest-path" "stale Tauri CLI flag"
  require_text "${linux_appimage_path}" "packaging/linux/build-appimage.sh" "cargo tauri build --target x86_64-unknown-linux-gnu" "compatibility target"

  require_text "${linux_deb_path}" "packaging/linux/build-deb.sh" "Historical helper. Canonical path: repo root -> just package-linux" "demotion header"
  require_text "${linux_deb_path}" "packaging/linux/build-deb.sh" "No current repo-root .deb packaging contract exists." "historical-only warning"

  require_text "${windows_ps1_path}" "packaging/windows/build.ps1" "Historical helper behind the repo-root proof-only Windows lane." "demotion warning"
  require_text "${windows_ps1_path}" "packaging/windows/build.ps1" "Canonical path: repo root -> just package-windows" "canonical replacement"
  require_text "${windows_ps1_path}" "packaging/windows/build.ps1" "Windows remains proof-only and deferred for formal support." "platform-boundary warning"

  require_text "${windows_bat_path}" "packaging/windows/build.bat" "Historical helper behind the repo-root proof-only Windows lane." "demotion warning"
  require_text "${windows_bat_path}" "packaging/windows/build.bat" "Canonical path: repo root -> just package-windows" "canonical replacement"
  require_text "${windows_bat_path}" "packaging/windows/build.bat" "Windows remains proof-only and deferred for formal support." "platform-boundary warning"

  reject_text "${linux_deb_path}" "packaging/linux/build-deb.sh" "Your Name <your.email@example.com>" "placeholder maintainer metadata"
  reject_text "${linux_deb_path}" "packaging/linux/build-deb.sh" "https://github.com/yourusername/music-player" "placeholder homepage metadata"
  reject_text "${linux_deb_path}" "packaging/linux/build-deb.sh" "A feature-rich music player built with Rust and GTK." "stale description metadata"

  printf 'verify-m003-s01-contract: packaging collateral checks passed for %s\n' "${repo_root}"
}

verify_full() {
  verify_core
  verify_packaging
  printf 'verify-m003-s01-contract: full contract checks passed for %s\n' "${repo_root}"
}

case "${mode}" in
  --core)
    verify_core
    ;;
  --full)
    verify_full
    ;;
  -h|--help)
    usage
    ;;
  *)
    fail "unsupported mode: ${mode}. Run with --help for usage."
    ;;
esac
