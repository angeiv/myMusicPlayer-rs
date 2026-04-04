#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/.." && pwd)"
runtime_root="${repo_root}/.gsd/runtime/native-uat/current"
manifest_path="${runtime_root}/manifest.json"
readme_path="${runtime_root}/README.md"
env_path="${runtime_root}/env.sh"
resume_script="${repo_root}/scripts/native-uat-resume.sh"

fail() {
  printf 'verify-m002-s04-preflight: %s\n' "$1" >&2
  exit 1
}

require_file() {
  local path="$1"
  local description="$2"
  [[ -f "${path}" ]] || fail "missing ${description} at ${path}."
}

require_readme_entry() {
  local needle="$1"
  grep -Fq -- "${needle}" "${readme_path}" || fail "README is missing expected entry: ${needle}"
}

run_step() {
  local command="$1"
  printf '\n==> %s\n' "${command}"
  bash -lc "cd \"${repo_root}\" && ${command}"
}

cd "${repo_root}"

printf '==> Preparing isolated native-UAT runtime\n'
just native-uat-setup >/dev/null

require_file "${manifest_path}" "manifest"
require_file "${readme_path}" "README"
require_file "${env_path}" "shell env override"
require_file "${resume_script}" "preserved-runtime helper"

printf '\n==> Validating manifest and README contract\n'
python3 - "${manifest_path}" <<'PY'
import json
import sys
from pathlib import Path

manifest_path = Path(sys.argv[1])
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

expected_scalars = {
    "proof_boundary": "M002/S04 acceptance evidence must come from the native Tauri runtime backed by an isolated fixture library. The browser/Vite shell remains mock regression coverage only and is not valid slice acceptance proof.",
    "canonical_path_reminder": "Resolve watched/current paths before comparing them. macOS can surface the same directory as /var/... and /private/var/..., so proof notes must compare canonical paths.",
    "playback_guardrail_context": ".gsd/milestones/M001/slices/S04/tasks/T02-CONTEXT.md",
}
for key, expected in expected_scalars.items():
    actual = manifest.get(key)
    if actual != expected:
        raise SystemExit(f"{manifest_path}: expected {key}={expected!r}, got {actual!r}")

expected_commands = {
    "setup": "just native-uat-setup",
    "preflight": "bash scripts/verify-m002-s04-preflight.sh",
    "first_launch": "just native-uat-dev",
    "resume": "bash scripts/native-uat-resume.sh",
    "teardown": "just native-uat-teardown",
}
commands = manifest.get("commands") or {}
for key, expected in expected_commands.items():
    actual = commands.get(key)
    if actual != expected:
        raise SystemExit(f"{manifest_path}: expected commands.{key}={expected!r}, got {actual!r}")

scenario_paths = ((manifest.get("fixture") or {}).get("scenario_paths") or {})
for key in ("add_directory", "modify_track", "remove_restore_track", "unavailable_root"):
    actual = scenario_paths.get(key)
    if not actual:
        raise SystemExit(f"{manifest_path}: expected fixture.scenario_paths.{key} to be populated")
PY

require_readme_entry "Canonical path reminder:"
require_readme_entry "bash scripts/verify-m002-s04-preflight.sh"
require_readme_entry "bash scripts/native-uat-resume.sh"
require_readme_entry "M002/S04 acceptance evidence"

printf '\n==> Validating preserved-runtime relaunch helper\n'
bash "${resume_script}" bash -lc '
  set -euo pipefail
  runtime_root="$(pwd)/.gsd/runtime/native-uat/current"
  test "${MUSIC_PLAYER_RS_CONFIG_DIR:-}" = "${runtime_root}/config"
  test "${MUSIC_PLAYER_RS_DATA_DIR:-}" = "${runtime_root}/data"
  test -f "${MUSIC_PLAYER_RS_CONFIG_DIR}/config.json"
  test -f "${runtime_root}/manifest.json"
  test -f "${runtime_root}/README.md"
'

run_step "cargo test --manifest-path ./src-tauri/Cargo.toml watcher_contract_ -- --nocapture"
run_step "cargo test --manifest-path ./src-tauri/Cargo.toml watcher_scheduler_ -- --nocapture"
run_step "cargo test --manifest-path ./src-tauri/Cargo.toml watcher_runtime_ -- --nocapture"
run_step "cargo test --manifest-path ./src-tauri/Cargo.toml native_uat -- --nocapture"
run_step "npm --prefix ./src run check"
run_step "npm --prefix ./src run test -- --run tests/library-scan-store.test.ts tests/app-shell.test.ts tests/app-shell-wiring.test.ts tests/settings-library-scan.test.ts tests/settings-view.test.ts tests/tauri-library-bridge.test.ts"
run_step "npm --prefix ./src run test -- --run tests/theme-primitives.test.ts tests/cover-art-geometry.test.ts tests/player-utility-controls.test.ts tests/now-playing-overlay.test.ts tests/now-playing-lyrics-tab.test.ts tests/songs-view.test.ts tests/albums-view.test.ts tests/album-detail-view.test.ts tests/playlist-detail-view.test.ts tests/artists-view-theme.test.ts tests/theme-secondary-surfaces.test.ts"
