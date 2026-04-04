#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/.." && pwd)"
runtime_root="${repo_root}/.gsd/runtime/native-uat/current"
manifest_path="${runtime_root}/manifest.json"
readme_path="${runtime_root}/README.md"
env_path="${runtime_root}/env.sh"
expected_config_dir="${runtime_root}/config"
expected_data_dir="${runtime_root}/data"

fail() {
  printf 'native-uat-resume: %s\n' "$1" >&2
  exit 1
}

require_file() {
  local path="$1"
  local description="$2"
  [[ -f "${path}" ]] || fail "missing ${description} at ${path}. Run 'just native-uat-setup' first."
}

require_file "${manifest_path}" "manifest"
require_file "${readme_path}" "README"
require_file "${env_path}" "shell env override"

# shellcheck disable=SC1090
source "${env_path}"

[[ "${MUSIC_PLAYER_RS_CONFIG_DIR:-}" == "${expected_config_dir}" ]] || fail "env override mismatch for MUSIC_PLAYER_RS_CONFIG_DIR after sourcing ${env_path}. Expected ${expected_config_dir}, got ${MUSIC_PLAYER_RS_CONFIG_DIR:-<unset>}."
[[ "${MUSIC_PLAYER_RS_DATA_DIR:-}" == "${expected_data_dir}" ]] || fail "env override mismatch for MUSIC_PLAYER_RS_DATA_DIR after sourcing ${env_path}. Expected ${expected_data_dir}, got ${MUSIC_PLAYER_RS_DATA_DIR:-<unset>}."
[[ -d "${MUSIC_PLAYER_RS_CONFIG_DIR}" ]] || fail "expected config dir ${MUSIC_PLAYER_RS_CONFIG_DIR} to exist."
[[ -d "${MUSIC_PLAYER_RS_DATA_DIR}" ]] || fail "expected data dir ${MUSIC_PLAYER_RS_DATA_DIR} to exist."

cd "${repo_root}"

if [[ "$#" -eq 0 ]]; then
  exec bash scripts/dev.sh
fi

exec "$@"
