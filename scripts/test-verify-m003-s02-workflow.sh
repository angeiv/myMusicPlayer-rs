#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/.." && pwd)"
verifier="${repo_root}/scripts/verify-m003-s02-workflow.sh"

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

  mkdir -p "${fixture}/.github/workflows"

  cat >"${fixture}/README.md" <<'EOF'
# myMusicPlayer-rs

## Support boundary
- Primary release-facing platform: macOS
- Proof-only additional build lanes: Linux and Windows
- Deferred formal support: Windows
EOF

  cat >"${fixture}/.github/workflows/public-ci.yml" <<'EOF'
name: Public CI

on:
  pull_request:
  push:

permissions:
  contents: read

concurrency:
  group: public-ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  baseline:
    name: Repo-root baseline — just qa + just test-frontend
    runs-on: macos-latest
    timeout-minutes: 25
    steps:
      - name: Check out repository
        uses: actions/checkout@v6
      - name: Install stable Rust 1.94.0
        uses: dtolnay/rust-toolchain@v1
        with:
          toolchain: 1.94.0
          components: rustfmt,clippy
      - name: Install just
        uses: taiki-e/install-action@v2
        with:
          tool: just
      - name: Set up Node.js 24 with npm cache
        uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: src/package-lock.json
      - name: Cache Cargo registry and target artifacts
        uses: actions/cache@v5
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            src-tauri/target
          key: ${{ runner.os }}-cargo-${{ hashFiles('src-tauri/Cargo.lock', 'config/rust-toolchain.toml') }}
      - name: Install frontend dependencies
        run: npm --prefix src ci
      - name: Verify the repo-root public contract
        run: bash scripts/verify-m003-s01-contract.sh
      - name: Verify the public workflow boundary
        run: bash scripts/verify-m003-s02-workflow.sh
      - name: Run the repo-root baseline lane
        run: just qa
      - name: Run the explicit frontend behavior lane
        run: just test-frontend

  bundle-proof:
    name: Bundle proof — ${{ matrix.lane_name }}
    runs-on: ${{ matrix.runs_on }}
    timeout-minutes: ${{ matrix.timeout_minutes }}
    strategy:
      fail-fast: false
      matrix:
        include:
          - lane_name: macOS (primary release-facing lane)
            runs_on: macos-latest
            timeout_minutes: 60
            package_command: just package-macos
          - lane_name: Linux (proof-only additional build lane)
            runs_on: ubuntu-22.04
            timeout_minutes: 45
            package_command: just package-linux
          - lane_name: Windows (proof-only additional build lane; formal support deferred)
            runs_on: windows-latest
            timeout_minutes: 60
            package_command: just package-windows
    steps:
      - name: Check out repository
        uses: actions/checkout@v6
      - name: Install stable Rust 1.94.0
        uses: dtolnay/rust-toolchain@v1
        with:
          toolchain: 1.94.0
      - name: Install just
        uses: taiki-e/install-action@v2
        with:
          tool: just
      - name: Set up Node.js 24 with npm cache
        uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: src/package-lock.json
      - name: Cache Cargo registry and target artifacts
        uses: actions/cache@v5
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            src-tauri/target
          key: ${{ runner.os }}-cargo-${{ hashFiles('src-tauri/Cargo.lock', 'config/rust-toolchain.toml') }}
      - name: Install Linux Tauri system dependencies
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update
          sudo apt-get install --yes \
            libwebkit2gtk-4.0-dev \
            build-essential \
            curl \
            wget \
            libssl-dev \
            libgtk-3-dev \
            libayatana-appindicator3-dev \
            librsvg2-dev
      - name: Install frontend dependencies
        run: npm --prefix src ci
      - name: Install cargo-tauri
        run: cargo install tauri-cli --locked
      - name: Add macOS bundle targets
        if: runner.os == 'macOS'
        run: rustup target add aarch64-apple-darwin x86_64-apple-darwin
      - name: Run bundle proof lane
        run: ${{ matrix.package_command }}
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

run_verifier() {
  local fixture_root="$1"
  MUSIC_PLAYER_RS_WORKFLOW_ROOT="${fixture_root}" bash "${verifier}"
}

make_valid_fixture
assert_pass "valid workflow fixture passes verification" run_verifier "${fixture}"

make_valid_fixture
rm -f "${fixture}/.github/workflows/public-ci.yml"
assert_fail_contains "missing workflow file fails" "missing workflow file" run_verifier "${fixture}"

make_valid_fixture
python3 - "${fixture}/.github/workflows/public-ci.yml" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')
path.write_text(text.replace('permissions:\n  contents: read\n\n', ''), encoding='utf-8')
PY
assert_fail_contains "missing read-only permissions fails" "workflow is missing read-only permissions" run_verifier "${fixture}"

make_valid_fixture
python3 - "${fixture}/.github/workflows/public-ci.yml" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')
path.write_text(text.replace('concurrency:\n  group: public-ci-${{ github.workflow }}-${{ github.ref }}\n  cancel-in-progress: true\n\n', ''), encoding='utf-8')
PY
assert_fail_contains "missing concurrency fails" "workflow is missing concurrency cancellation" run_verifier "${fixture}"

make_valid_fixture
python3 - "${fixture}/.github/workflows/public-ci.yml" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')
path.write_text(text.replace('run: just test-frontend', 'run: npm --prefix src run test -- --run', 1), encoding='utf-8')
PY
assert_fail_contains "frontend lane bypassing just fails" "workflow bypasses the repo-root frontend lane" run_verifier "${fixture}"

make_valid_fixture
python3 - "${fixture}/.github/workflows/public-ci.yml" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')
path.write_text(text.replace('package_command: just package-windows', 'package_command: cargo tauri build --target x86_64-pc-windows-msvc'), encoding='utf-8')
PY
assert_fail_contains "windows package lane bypassing just fails" "workflow bypasses the repo-root Windows proof lane" run_verifier "${fixture}"

make_valid_fixture
python3 - "${fixture}/.github/workflows/public-ci.yml" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')
path.write_text(text.replace('Windows (proof-only additional build lane; formal support deferred)', 'Windows'), encoding='utf-8')
PY
assert_fail_contains "windows deferred wording is required" "workflow is missing boundary lane label: Windows (proof-only additional build lane; formal support deferred)" run_verifier "${fixture}"

make_valid_fixture
python3 - "${fixture}/.github/workflows/public-ci.yml" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')
path.write_text(text.replace('cache-dependency-path: src/package-lock.json', 'cache-dependency-path: package-lock.json'), encoding='utf-8')
PY
assert_fail_contains "node cache must use the real frontend lockfile" "workflow is missing Node cache key input: src/package-lock.json" run_verifier "${fixture}"

make_valid_fixture
python3 - "${fixture}/.github/workflows/public-ci.yml" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')
path.write_text(text.replace("hashFiles('src-tauri/Cargo.lock', 'config/rust-toolchain.toml')", "hashFiles('Cargo.lock')"), encoding='utf-8')
PY
assert_fail_contains "rust cache must use the real Cargo.lock and toolchain file" "workflow is missing Rust cache key input: hashFiles('src-tauri/Cargo.lock', 'config/rust-toolchain.toml')" run_verifier "${fixture}"

make_valid_fixture
python3 - "${fixture}/.github/workflows/public-ci.yml" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')
path.write_text(text.replace('libwebkit2gtk-4.0-dev \\\n            build-essential', 'build-essential'), encoding='utf-8')
PY
assert_fail_contains "linux system dependency step must keep WebKitGTK" "workflow is missing Linux system dependency package: libwebkit2gtk-4.0-dev" run_verifier "${fixture}"

printf 'All workflow verifier tests passed.\n'
