#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
default_repo_root="$(cd -- "${script_dir}/.." && pwd)"
repo_root="${MUSIC_PLAYER_RS_WORKFLOW_ROOT:-${default_repo_root}}"
workflow_path="${repo_root}/.github/workflows/public-ci.yml"
readme_path="${repo_root}/README.md"

fail() {
  printf 'verify-m003-s02-workflow: %s\n' "$1" >&2
  exit 1
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
  local message="$4"
  if grep -Fq -- "${rejected}" "${path}"; then
    fail "${description} ${message}"
  fi
}

require_lane_label() {
  local label="$1"
  grep -Fq -- "lane_name: ${label}" "${workflow_path}" || fail "workflow is missing boundary lane label: ${label}"
}

require_linux_package() {
  local package="$1"
  grep -Fq -- "${package}" "${workflow_path}" || fail "workflow is missing Linux system dependency package: ${package}"
}

main() {
  require_file "${readme_path}" "README.md"
  require_file "${workflow_path}" "workflow file"

  require_text "${readme_path}" "README.md" "Primary release-facing platform: macOS" "support-boundary marker"
  require_text "${readme_path}" "README.md" "Proof-only additional build lanes: Linux and Windows" "support-boundary marker"
  require_text "${readme_path}" "README.md" "Deferred formal support: Windows" "support-boundary marker"

  require_text "${workflow_path}" "workflow" "name: Public CI" "workflow name"
  require_text "${workflow_path}" "workflow" "pull_request:" "trigger"
  require_text "${workflow_path}" "workflow" "push:" "trigger"

  if ! grep -Fq -- "permissions:" "${workflow_path}" || ! grep -Fq -- "contents: read" "${workflow_path}"; then
    fail "workflow is missing read-only permissions"
  fi

  if ! grep -Fq -- "concurrency:" "${workflow_path}" || ! grep -Fq -- "cancel-in-progress: true" "${workflow_path}"; then
    fail "workflow is missing concurrency cancellation"
  fi

  require_text "${workflow_path}" "workflow" 'group: public-ci-${{ github.workflow }}-${{ github.ref }}' "concurrency group"
  require_text "${workflow_path}" "workflow" "name: Repo-root baseline — just qa + just test-frontend" "baseline job name"
  require_text "${workflow_path}" "workflow" "runs-on: macos-latest" "baseline runner"
  require_text "${workflow_path}" "workflow" "run: bash scripts/verify-m003-s01-contract.sh" "repo-root contract command"
  require_text "${workflow_path}" "workflow" "run: bash scripts/verify-m003-s02-workflow.sh" "workflow contract command"
  require_text "${workflow_path}" "workflow" "run: just qa" "repo-root baseline command"
  reject_text "${workflow_path}" "workflow" "run: npm --prefix src run test -- --run" "bypasses the repo-root frontend lane"
  require_text "${workflow_path}" "workflow" "run: just test-frontend" "repo-root frontend lane"

  reject_text "${workflow_path}" "workflow" "package_command: cargo tauri build" "bypasses the repo-root Windows proof lane"
  reject_text "${workflow_path}" "workflow" "run: cargo tauri build --target" "bypasses the repo-root packaging contract with a raw cargo tauri build"
  reject_text "${workflow_path}" "workflow" "run: cargo test --manifest-path" "bypasses the repo-root QA lane with a raw cargo test"
  reject_text "${workflow_path}" "workflow" "run: cargo clippy --manifest-path" "bypasses the repo-root QA lane with a raw cargo clippy"

  require_text "${workflow_path}" "workflow" 'name: Bundle proof — ${{ matrix.lane_name }}' "bundle-proof job name"
  require_text "${workflow_path}" "workflow" "strategy:" "matrix strategy"
  require_text "${workflow_path}" "workflow" "matrix:" "matrix definition"
  require_text "${workflow_path}" "workflow" "fail-fast: false" "matrix fail-fast guard"

  require_lane_label "macOS (primary release-facing lane)"
  require_lane_label "Linux (proof-only additional build lane)"
  require_lane_label "Windows (proof-only additional build lane; formal support deferred)"

  require_text "${workflow_path}" "workflow" "package_command: just package-macos" "repo-root package command"
  require_text "${workflow_path}" "workflow" "package_command: just package-linux" "repo-root package command"
  require_text "${workflow_path}" "workflow" "package_command: just package-windows" "repo-root package command"

  if ! grep -Fq -- "cache-dependency-path: src/package-lock.json" "${workflow_path}"; then
    fail "workflow is missing Node cache key input: src/package-lock.json"
  fi
  if ! grep -Fq -- "hashFiles('src-tauri/Cargo.lock', 'config/rust-toolchain.toml')" "${workflow_path}"; then
    fail "workflow is missing Rust cache key input: hashFiles('src-tauri/Cargo.lock', 'config/rust-toolchain.toml')"
  fi

  require_text "${workflow_path}" "workflow" "if: runner.os == 'Linux'" "Linux dependency gate"
  require_linux_package "libwebkit2gtk-4.0-dev"
  require_linux_package "build-essential"
  require_linux_package "libssl-dev"
  require_linux_package "libgtk-3-dev"
  require_linux_package "libayatana-appindicator3-dev"
  require_linux_package "librsvg2-dev"

  require_text "${workflow_path}" "workflow" "run: npm --prefix src ci" "frontend install command"
  require_text "${workflow_path}" "workflow" "run: cargo install tauri-cli --locked" "cargo-tauri install command"
  require_text "${workflow_path}" "workflow" "if: runner.os == 'macOS'" "macOS target gate"
  require_text "${workflow_path}" "workflow" "run: rustup target add aarch64-apple-darwin x86_64-apple-darwin" "macOS target bootstrap"
  require_text "${workflow_path}" "workflow" 'run: ${{ matrix.package_command }}' "matrix package invocation"

  printf 'verify-m003-s02-workflow: workflow boundary checks passed for %s\n' "${repo_root}"
}

main "$@"
