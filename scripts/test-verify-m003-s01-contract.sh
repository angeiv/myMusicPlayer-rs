#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/.." && pwd)"
verifier="${repo_root}/scripts/verify-m003-s01-contract.sh"

tmp_dirs=()
fixture=""
cleanup() {
  set +e
  for dir in "${tmp_dirs[@]}"; do
    [[ -n "${dir}" ]] && rm -rf "${dir}"
  done
}
trap cleanup EXIT

make_valid_fixture() {
  fixture="$(mktemp -d)"
  tmp_dirs+=("${fixture}")

  mkdir -p \
    "${fixture}/src-tauri" \
    "${fixture}/packaging/macos" \
    "${fixture}/packaging/linux" \
    "${fixture}/packaging/windows"

  cat >"${fixture}/README.md" <<'EOF'
# myMusicPlayer-rs

## Project overview
A local-first desktop music player for a personal library.

## Prerequisites
- Rust toolchain
- Node.js and npm
- just
- cargo-tauri

## Repo-root workflow
- `just install`
- `just qa`
- `just test-frontend`
- `just dev`
- `just info`
- `just package`

## Verification path
- `bash scripts/verify-m003-s01-contract.sh`
- `bash scripts/test-verify-m003-s01-contract.sh`
- `just --list`
- `just qa`
- `just test-frontend`
- `just info`
- Native UAT fits after `just qa` when a change touches the real Tauri runtime or macOS release-facing proof path.

## Support boundary
- Primary release-facing platform: macOS
- Proof-only additional build lanes: Linux and Windows
- Deferred formal support: Windows
EOF

  cat >"${fixture}/justfile" <<'EOF'
set shell := ["bash", "-lc"]

frontend_dir := "src"
npm_bin := "npm"

default:
    @just --list

# Install repo dependencies for local development
install:
    @echo install

# Run the repo-root quality and test baseline
qa:
    @echo qa

# Run the repo-root frontend behavior proof lane
test-frontend:
    {{npm_bin}} --prefix {{frontend_dir}} run test -- --run

# Run the application in development mode
[unix]
dev:
    @echo dev

# Package via the Tauri bundle configuration
package:
    cargo tauri build

# Run the Tauri CLI environment canary
info:
    cargo tauri info
EOF

  cat >"${fixture}/src-tauri/Cargo.toml" <<'EOF'
[package]
name = "music-player-rs"
description = "Local-first desktop music player with a Tauri 2 + Rust backend"
EOF

  cat >"${fixture}/src-tauri/Tauri.toml" <<'EOF'
[bundle]
shortDescription = "Local-first desktop music player"
longDescription = "Local-first desktop music player with a Tauri and Rust stack. macOS is the primary release-facing lane; Linux and Windows bundle lanes remain proof-only evidence."
EOF

  cat >"${fixture}/packaging/README.md" <<'EOF'
# Packaging collateral

`packaging/` is secondary material. The authoritative packaging contract lives at the repo root via `just` recipes and the Tauri bundle configuration.

## Authoritative packaging path

- `just package`
- `just package-macos`
- `just package-linux`
- `just package-windows`
- `cargo tauri build`

## Platform boundary

- Primary release-facing packaging lane: macOS
- Proof-only packaging lanes: Linux and Windows
- Deferred formal support: Windows

## Legacy helper status

Historical helpers under `packaging/` are secondary maintainer entrypoints, not the public packaging contract.
EOF

  cat >"${fixture}/packaging/macos/build.sh" <<'EOF'
#!/usr/bin/env bash
# Historical helper. Canonical path: repo root -> just package-macos
printf '%s\n' "packaging/macos/build.sh: Historical helper. Canonical path: repo root -> just package-macos" >&2
printf '%s\n' "packaging/macos/build.sh: Falling back to the underlying cargo tauri build targets for compatibility." >&2
cargo tauri build --target aarch64-apple-darwin
cargo tauri build --target x86_64-apple-darwin
EOF

  cat >"${fixture}/packaging/macos/build-app.sh" <<'EOF'
#!/usr/bin/env bash
# Historical helper. Canonical path: repo root -> just package-macos
printf '%s\n' "packaging/macos/build-app.sh: Historical helper. Canonical path: repo root -> just package-macos" >&2
printf '%s\n' "packaging/macos/build-app.sh: Falling back to the underlying cargo tauri build targets for compatibility." >&2
cargo tauri build --target aarch64-apple-darwin
cargo tauri build --target x86_64-apple-darwin
EOF

  cat >"${fixture}/packaging/linux/build-deb.sh" <<'EOF'
#!/usr/bin/env bash
# Historical helper. Canonical path: repo root -> just package-linux
# No current repo-root .deb packaging contract exists.
printf '%s\n' "packaging/linux/build-deb.sh: Historical helper. Canonical path: repo root -> just package-linux" >&2
printf '%s\n' "packaging/linux/build-deb.sh: No current repo-root .deb packaging contract exists." >&2
exit 1
EOF

  cat >"${fixture}/packaging/linux/build-appimage.sh" <<'EOF'
#!/usr/bin/env bash
# Historical helper. Canonical path: repo root -> just package-linux
printf '%s\n' "packaging/linux/build-appimage.sh: Historical helper. Canonical path: repo root -> just package-linux" >&2
printf '%s\n' "packaging/linux/build-appimage.sh: Falling back to the underlying cargo tauri build target for compatibility." >&2
cargo tauri build --target x86_64-unknown-linux-gnu
EOF

  cat >"${fixture}/packaging/windows/build.ps1" <<'EOF'
Write-Warning "Historical helper behind the repo-root proof-only Windows lane."
Write-Warning "Canonical path: repo root -> just package-windows"
Write-Warning "Windows remains proof-only and deferred for formal support."
EOF

  cat >"${fixture}/packaging/windows/build.bat" <<'EOF'
@echo off
REM Historical helper behind the repo-root proof-only Windows lane.
REM Canonical path: repo root -> just package-windows
REM Windows remains proof-only and deferred for formal support.
EOF
}

assert_pass() {
  local description="$1"
  shift
  if "$@"; then
    printf 'PASS: %s\n' "${description}"
  else
    printf 'FAIL: %s\n' "${description}" >&2
    exit 1
  fi
}

assert_fail_contains() {
  local description="$1"
  local expected="$2"
  shift 2

  local output
  if output="$($@ 2>&1)"; then
    printf 'FAIL: %s (unexpected pass)\n' "${description}" >&2
    exit 1
  fi

  if [[ "${output}" != *"${expected}"* ]]; then
    printf 'FAIL: %s\nExpected output to contain: %s\nActual output:\n%s\n' "${description}" "${expected}" "${output}" >&2
    exit 1
  fi

  printf 'PASS: %s\n' "${description}"
}

run_core() {
  local fixture="$1"
  MUSIC_PLAYER_RS_CONTRACT_ROOT="${fixture}" bash "${verifier}" --core
}

run_full() {
  local fixture="$1"
  MUSIC_PLAYER_RS_CONTRACT_ROOT="${fixture}" bash "${verifier}"
}

make_valid_fixture
assert_pass "valid fixture passes core verification" run_core "${fixture}"

make_valid_fixture
rm -f "${fixture}/README.md"
assert_fail_contains "missing README fails" "missing README.md" run_core "${fixture}"

make_valid_fixture
python3 - "${fixture}/README.md" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')
path.write_text(text.replace('- `just test-frontend`\n', ''), encoding='utf-8')
PY
assert_fail_contains "missing just test-frontend README reference fails" "README.md is missing required command reference: just test-frontend" run_core "${fixture}"

make_valid_fixture
python3 - "${fixture}/justfile" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')
path.write_text(text.replace('# Run the repo-root frontend behavior proof lane\ntest-frontend:\n    {{npm_bin}} --prefix {{frontend_dir}} run test -- --run\n\n', ''), encoding='utf-8')
PY
assert_fail_contains "missing test-frontend recipe fails" "justfile is missing frontend proof recipe: test-frontend:" run_core "${fixture}"

make_valid_fixture
python3 - "${fixture}/justfile" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')
path.write_text(text.replace('cargo tauri info', 'cargo tauri info --manifest-path src-tauri/Cargo.toml'), encoding='utf-8')
PY
assert_fail_contains "stale manifest-path in justfile fails" "justfile still contains stale Tauri CLI flag: cargo tauri info --manifest-path" run_core "${fixture}"

make_valid_fixture
python3 - "${fixture}/src-tauri/Cargo.toml" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')
path.write_text(text.replace('Local-first desktop music player with a Tauri 2 + Rust backend', 'A cross-platform music player built with Tauri'), encoding='utf-8')
PY
assert_fail_contains "cross-platform cargo metadata fails" "Cargo.toml description does not match the public contract" run_core "${fixture}"

make_valid_fixture
assert_pass "valid fixture passes full verification" run_full "${fixture}"

make_valid_fixture
python3 - "${fixture}/packaging/README.md" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')
path.write_text(text.replace('`cargo tauri build`', '`cargo tauri build --manifest-path src-tauri/Cargo.toml`'), encoding='utf-8')
PY
assert_fail_contains "stale manifest-path in packaging README fails full verification" "packaging/README.md still contains stale Tauri CLI example: --manifest-path" run_full "${fixture}"

make_valid_fixture
python3 - "${fixture}/packaging/macos/build.sh" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')
path.write_text(text.replace('cargo tauri build --target aarch64-apple-darwin', 'cargo tauri build --manifest-path src-tauri/Cargo.toml --target aarch64-apple-darwin'), encoding='utf-8')
PY
assert_fail_contains "stale manifest-path in packaging fallback fails full verification" "packaging/macos/build.sh still contains stale Tauri CLI flag: cargo tauri build --manifest-path" run_full "${fixture}"

make_valid_fixture
python3 - "${fixture}/packaging/README.md" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')
path.write_text(text + '\nWindows is fully supported\n', encoding='utf-8')
PY
assert_fail_contains "unsupported platform claim fails full verification" "packaging/README.md still contains unsupported platform claim" run_full "${fixture}"

make_valid_fixture
python3 - "${fixture}/packaging/linux/build-deb.sh" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
path.write_text(path.read_text(encoding='utf-8') + '\nMaintainer: Your Name <your.email@example.com>\n', encoding='utf-8')
PY
assert_fail_contains "placeholder maintainer metadata fails full verification" "packaging/linux/build-deb.sh still contains placeholder maintainer metadata" run_full "${fixture}"

printf 'All verifier tests passed.\n'
